export type VisionScenarioId = string;

export type VisionScenario = {
  id: VisionScenarioId;
  label: string;
  description: string;
};

export type OrbisSystemView = {
  visionMode: 'openai' | 'fixture';
  visionModel?: string;
  pollIntervalMs: number;
};

export type WorkflowStepView = {
  id: string;
  name: string;
  capability: string;
  description: string;
  status: string;
  assignedWorkerId?: string;
};

export type VisionObservationView = {
  packageDetected?: boolean;
  packageType?: string;
  sizeClass?: string;
  visibleDamage?: string;
  labelReadable?: boolean;
  notes?: string;
};

export type VisionGateView = {
  state: 'pending' | 'analyzing' | 'review_required' | 'clear' | 'unavailable';
  inspectionId?: string;
  evidenceId?: string;
  providerLabel: string;
  imageUrl?: string;
  confidence?: number;
  observations: VisionObservationView;
  reasons: string[];
};

export type RoutingCandidateView = {
  id: string;
  name: string;
  kind: string;
  status: string;
  selected: boolean;
  reasons: string[];
};

export type RoutingView = {
  mode: string;
  recommendedWorkerId?: string;
  candidates: RoutingCandidateView[];
};

export type WorkflowEventView = {
  sequence: number;
  type: string;
  message: string;
  occurredAt?: string;
};

export type WorkflowView = {
  id: string;
  status: string;
  phase: string;
  progress: number;
  currentWorkerId?: string;
  currentWorkerName?: string;
  currentAction?: string;
  steps: WorkflowStepView[];
  vision: VisionGateView;
  routing: RoutingView;
  recoveryActions: string[];
  events: WorkflowEventView[];
};

export type ReviewDisposition =
  | 'corrected'
  | 'repackaged_and_cleared'
  | 'cleared_by_inspector'
  | 'rejected';

export class OrbisApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = 'OrbisApiError';
    this.status = status;
    this.code = code;
  }
}

export const fallbackVisionScenarios: VisionScenario[] = [
  { id: 'normal', label: 'Normal', description: 'Clear package and readable label' },
  { id: 'damaged', label: 'Damaged', description: 'Crushed corner requires inspection' },
  { id: 'uncertain', label: 'Uncertain', description: 'Low-confidence package observation' },
];

const apiOrigin = (process.env.NEXT_PUBLIC_ORBIS_API_ORIGIN ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringList(value: unknown): string[] {
  return array(value).map((item) => text(item)).filter(Boolean);
}

function requestId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${suffix}`;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');
    if (init?.body) headers.set('Content-Type', 'application/json');
    response = await fetch(`${apiOrigin}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new OrbisApiError('Orbis backend is offline. Start the API and retry.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = record(payload);
    const detail = record(body.detail);
    const apiError = record(body.error);
    const message = text(body.message) || text(apiError.message) || text(body.error) || text(detail.message) || `Request failed (${response.status})`;
    throw new OrbisApiError(message, response.status, text(body.code) || text(apiError.code) || text(detail.code) || undefined);
  }
  return payload;
}

function normalizedVisionState(value: string, decision: string, workflowStatus: string): VisionGateView['state'] {
  const source = `${value} ${decision}`.toLowerCase();
  if (source.includes('review') || source.includes('attention') || source.includes('blocked')) return 'review_required';
  if (source.includes('clear') || source.includes('approved') || source.includes('completed')) return 'clear';
  if (source.includes('unavailable') || source.includes('failed') || source.includes('error')) return 'unavailable';
  if (source.includes('analy') || source.includes('execut') || source.includes('inspect')) return 'analyzing';
  if (workflowStatus === 'attention_required') return 'review_required';
  return 'pending';
}

function workerDisplayName(id: string): string {
  if (id === 'delivery-robot-01') return 'Delivery Robot 01';
  if (id.startsWith('delivery-van-')) return 'Delivery Van 07';
  if (id === 'package-vision-01' || id === 'vision-ai-01') return 'Package Vision 01';
  if (id === 'human-inspector-demo' || id === 'human-inspector-01') return 'Human Inspector';
  return id.split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

export function normalizeWorkflow(payload: unknown): WorkflowView {
  const outer = record(payload);
  const root = record(outer.workflow ?? outer.data ?? payload);
  const status = text(root.status, 'pending');
  const phase = text(root.phase, status);
  const currentWorker = record(root.current_worker);
  const currentStep = record(root.current_step);
  const rawSteps = array(root.steps);
  const steps = rawSteps.map((value, index): WorkflowStepView => {
    const step = record(value);
    const worker = record(step.assigned_worker ?? step.assigned_agent);
    return {
      id: text(step.id, `step-${index + 1}`),
      name: text(step.name, text(step.title, `Step ${index + 1}`)),
      capability: text(step.capability),
      description: text(step.description, text(step.detail)),
      status: text(step.status, 'pending'),
      assignedWorkerId: text(step.assigned_worker_id) || text(step.assigned_agent_id) || text(worker.id) || undefined,
    };
  });

  const visionGate = record(root.vision_gate ?? root.vision);
  const inspection = record(visionGate.inspection ?? root.inspection);
  const analysis = record(inspection.analysis ?? record(inspection.result).analysis);
  const inspectionResult = record(inspection.result);
  const provenance = record(inspectionResult.provenance ?? inspection.provenance);
  const observations = record(inspection.observations ?? analysis.observations ?? visionGate.observations);
  const confidence = record(inspection.model_reported_confidence ?? inspection.confidence ?? analysis.confidence ?? visionGate.confidence);
  const policy = record(inspection.policy ?? visionGate.policy);
  const evidence = record(inspection.evidence ?? visionGate.evidence);
  const source = record(inspection.source ?? visionGate.source);
  const agent = record(inspection.agent ?? visionGate.agent);
  const gateError = record(visionGate.error ?? inspection.error);
  const decision = text(policy.decision);
  const visionState = normalizedVisionState(text(visionGate.state, text(visionGate.status, text(inspection.status))), decision, status);
  const reasons = stringList(policy.reasons).length > 0
    ? stringList(policy.reasons)
    : stringList(visionGate.reasons ?? root.attention_reasons).length > 0
      ? stringList(visionGate.reasons ?? root.attention_reasons)
      : text(gateError.message) ? [text(gateError.message)] : [];

  const rawRouting = record(root.routing);
  const recommendedWorkerId = text(rawRouting.recommended_worker_id) || text(rawRouting.selected_worker_id) || undefined;
  const candidates = array(rawRouting.candidates).map((value): RoutingCandidateView => {
    const candidate = record(value);
    const worker = record(candidate.worker);
    const id = text(candidate.worker_id) || text(candidate.id) || text(worker.id);
    const kind = text(candidate.worker_kind) || text(candidate.worker_type) || text(candidate.kind) || text(worker.kind, 'robot');
    const eligible = candidate.eligible === true;
    const candidateReasons = stringList(candidate.reasons);
    return {
      id,
      name: text(candidate.name) || text(worker.name) || workerDisplayName(id),
      kind,
      status: text(candidate.status) || (eligible ? 'eligible' : text(rawRouting.status) === 'blocked' ? 'blocked' : 'ineligible'),
      selected: candidate.selected === true || id === recommendedWorkerId,
      reasons: candidateReasons.length > 0 ? candidateReasons : text(candidate.reason) ? [text(candidate.reason)] : [],
    };
  });

  const events = array(root.events).map((value, index): WorkflowEventView => {
    const event = record(value);
    return {
      sequence: number(event.sequence, index + 1),
      type: text(event.type, 'workflow.updated'),
      message: text(event.message),
      occurredAt: text(event.occurred_at) || text(event.timestamp) || undefined,
    };
  });

  const currentWorkerId = text(root.current_worker_id) || text(root.current_worker) || text(currentWorker.id) || text(currentStep.assigned_worker_id) || text(currentStep.assigned_agent_id) || undefined;
  const activeStep = steps.find((step) => ['reserved', 'executing', 'verifying', 'running'].includes(step.status));

  const phases = array(root.phases);
  const completedPhases = phases.filter((value) => ['completed', 'skipped'].includes(text(record(value).status))).length;
  const derivedProgress = phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : status === 'completed' ? 100 : 0;

  return {
    id: text(root.id) || text(root.workflow_id),
    status,
    phase,
    progress: number(root.progress, derivedProgress),
    currentWorkerId,
    currentWorkerName: text(currentWorker.name) || (currentWorkerId ? workerDisplayName(currentWorkerId) : undefined),
    currentAction: text(root.current_action) || text(currentWorker.current_action) || text(currentStep.description) || text(currentStep.name) || activeStep?.description || activeStep?.name,
    steps,
    vision: {
      state: visionState,
      inspectionId: text(inspection.inspection_id) || text(inspection.id) || text(visionGate.inspection_id) || undefined,
      evidenceId: text(evidence.id) || text(evidence.evidence_id) || stringList(inspection.evidence_ids)[0] || text(inspection.id) || undefined,
      providerLabel: [text(inspectionResult.provider) || text(provenance.mode) || text(inspection.provider) || text(source.inference_mode) || text(evidence.inference_mode), text(provenance.model) || text(agent.model)].filter(Boolean).join(' · ') || text(visionGate.provider_label) || 'Provider pending',
      imageUrl: text(inspectionResult.image_url) || text(inspection.image_url) || undefined,
      confidence: number(confidence.overall, Number.NaN),
      observations: {
        packageDetected: boolean(observations.package_detected),
        packageType: text(observations.package_type) || undefined,
        sizeClass: text(observations.size_class) || undefined,
        visibleDamage: text(observations.visible_damage) || undefined,
        labelReadable: boolean(observations.label_readable),
        notes: text(observations.notes) || undefined,
      },
      reasons,
    },
    routing: {
      mode: text(rawRouting.kind) || text(rawRouting.mode, 'simulated_next_mile'),
      recommendedWorkerId,
      candidates,
    },
    recoveryActions: stringList(root.permitted_recovery_actions ?? root.recovery_actions),
    events,
  };
}

export async function getVisionScenarios(): Promise<VisionScenario[]> {
  const payload = await requestJson('/api/v1/vision/scenarios');
  const root = record(payload);
  const values = array(root.scenarios ?? payload);
  const scenarios = values.map((value): VisionScenario => {
    const item = record(value);
    const id = text(item.id) || text(item.scenario_id);
    return {
      id,
      label: text(item.label) || text(item.name) || workerDisplayName(id),
      description: text(item.description),
    };
  }).filter((scenario) => scenario.id && scenario.id !== 'provider-failure');
  return scenarios.length > 0 ? scenarios : fallbackVisionScenarios;
}

export async function getSystemView(): Promise<OrbisSystemView> {
  const root = record(await requestJson('/api/v1/system'));
  return {
    visionMode: text(root.vision_mode).toLowerCase() === 'openai' ? 'openai' : 'fixture',
    visionModel: text(root.vision_model) || undefined,
    pollIntervalMs: number(root.poll_interval_ms, 750),
  };
}

export async function createWorkflow(input: { objective: string; scenarioId: VisionScenarioId; visionMode?: 'openai' | 'fixture' }): Promise<WorkflowView> {
  const createRequestId = requestId('create');
  const uniqueSuffix = createRequestId.slice(-12).replaceAll('-', '');
  const payload = await requestJson('/api/v1/workflows', {
    method: 'POST',
    body: JSON.stringify({
      request_id: createRequestId,
      objective: input.objective,
      order_id: `ORD-1042-${uniqueSuffix}`,
      package_id: `PKG-1042-${uniqueSuffix}`,
      destination: 'Dock 04',
      trailer_id: 'truck-17',
      scenario_id: input.scenarioId,
      vision_mode: input.visionMode,
    }),
  });
  return normalizeWorkflow(payload);
}

export async function startWorkflow(workflowId: string, visionMode?: 'openai' | 'fixture'): Promise<WorkflowView> {
  const payload = await requestJson(`/api/v1/workflows/${encodeURIComponent(workflowId)}/start`, {
    method: 'POST',
    body: JSON.stringify({ request_id: requestId('start'), vision_mode: visionMode }),
  });
  return normalizeWorkflow(payload);
}

export async function getWorkflow(workflowId: string): Promise<WorkflowView> {
  return normalizeWorkflow(await requestJson(`/api/v1/workflows/${encodeURIComponent(workflowId)}`));
}

export async function retryWorkflow(workflowId: string, visionMode?: 'openai' | 'fixture'): Promise<WorkflowView> {
  const payload = await requestJson(`/api/v1/workflows/${encodeURIComponent(workflowId)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ request_id: requestId('retry'), vision_mode: visionMode }),
  });
  return normalizeWorkflow(payload);
}

export async function submitVisionReview(input: {
  workflowId: string;
  inspectionId: string;
  disposition: ReviewDisposition;
  corrections?: Record<string, unknown>;
  notes?: string;
}): Promise<WorkflowView> {
  const payload = await requestJson(`/api/v1/vision/inspections/${encodeURIComponent(input.inspectionId)}/reviews`, {
    method: 'POST',
    body: JSON.stringify({
      request_id: requestId('review'),
      actor_id: 'human-inspector-demo',
      reviewer_id: 'human-inspector-demo',
      disposition: input.disposition,
      resolution: input.disposition,
      corrections: input.corrections,
      overrides: input.corrections,
      notes: input.notes,
    }),
  });
  void payload;
  return getWorkflow(input.workflowId);
}
