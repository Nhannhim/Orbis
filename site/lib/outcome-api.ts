export type OutcomeStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'scheduled'
  | 'executing'
  | 'attention_required'
  | 'blocked'
  | 'dinner_ready'
  | 'cleaning_up'
  | 'completed'
  | 'cancelled';

export type OutcomePhase =
  | 'planning'
  | 'warehouse_fulfillment'
  | 'home_preparation'
  | 'delivery'
  | 'cooking'
  | 'final_verification'
  | 'dinner_ready'
  | 'cleanup'
  | 'completed';

export type OutcomeTaskStatus =
  | 'queued'
  | 'ready'
  | 'reserved'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'attention_required'
  | 'blocked'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type OutcomeLaneId = 'warehouse' | 'delivery' | 'home';
export type OutcomeWorkerKind = 'ai' | 'robot' | 'human';

export type OutcomeTaskView = {
  id: string;
  title: string;
  description?: string;
  status: OutcomeTaskStatus;
  progress: number;
  workerId?: string;
  workerName?: string;
  dependencies: string[];
  blockingReasons: string[];
  currentAction?: string;
  expectedCompletion?: string;
  evidenceIds: string[];
};

export type OutcomeLaneView = {
  id: OutcomeLaneId;
  label: string;
  status: string;
  progress: number;
  currentAction?: string;
  nextAction?: string;
  blockedBy?: string;
  expectedCompletion?: string;
  tasks: OutcomeTaskView[];
};

export type OutcomeWorkerView = {
  id: string;
  name: string;
  kind: OutcomeWorkerKind;
  subtype?: string;
  status: string;
  health: string;
  location?: string;
  capabilities: string[];
  activeAssignment?: string;
  videoUrl?: string;
  attempts?: number;
  completions?: number;
  failures?: number;
  interventionRate?: number;
};

export type OutcomeAttentionView = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  lane?: OutcomeLaneId;
  affectedTasks: string[];
  continuingTasks: string[];
  deadlineImpact?: string;
  evidenceIds: string[];
  permittedActions: OutcomeActionKind[];
  openedAt?: string;
};

export type OutcomeCustodyView = {
  id: string;
  objectName: string;
  from?: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  occurredAt?: string;
  evidenceId?: string;
};

export type OutcomeEvidenceView = {
  id: string;
  type: string;
  title: string;
  actor: string;
  actorKind?: OutcomeWorkerKind;
  occurredAt?: string;
  confidence?: number | null;
  source?: string;
  summary?: string;
};

export type OutcomeEventView = {
  sequence: number;
  type: string;
  message: string;
  occurredAt?: string;
};

export type OutcomeChecklistItem = {
  id: string;
  label: string;
  status: 'pending' | 'verified' | 'attention' | 'not_required';
  evidenceId?: string;
};

export type OutcomeRoutingCandidateView = {
  id: string;
  name: string;
  selected: boolean;
  eligible: boolean;
  reasons: string[];
};

export type OutcomeOrderItemView = {
  id: string;
  name: string;
  quantity: string;
  category?: string;
  status?: string;
  substitution?: string;
};

export type OutcomePlanView = {
  id: string;
  status: 'draft' | 'generating' | 'awaiting_approval' | 'approved' | 'rejected' | 'invalid';
  title: string;
  objective: string;
  guestCount: number;
  readyBy?: string;
  menu: string[];
  orderItems: OutcomeOrderItemView[];
  estimatedCost?: string;
  workers: OutcomeWorkerView[];
  schedule: { id: string; label: string; time?: string; detail?: string }[];
  policies: string[];
  assumptions: string[];
  dinnerReadyCriteria: string[];
  cleanupTasks: string[];
};

export type OutcomeView = {
  id: string;
  planId?: string;
  title: string;
  objective: string;
  status: OutcomeStatus;
  phase: OutcomePhase;
  progress: number;
  deadline?: string;
  predictedCompletion?: string;
  currentAction?: string;
  currentWorkerId?: string;
  currentWorkerName?: string;
  nextAction?: string;
  blockedBy?: string;
  scheduleRisk?: string;
  mode: 'fixture' | 'live' | 'simulation';
  lanes: OutcomeLaneView[];
  workers: OutcomeWorkerView[];
  attention: OutcomeAttentionView[];
  routingCandidates: OutcomeRoutingCandidateView[];
  custody: OutcomeCustodyView[];
  evidence: OutcomeEvidenceView[];
  events: OutcomeEventView[];
  dinnerReadyChecklist: OutcomeChecklistItem[];
  cleanupChecklist: OutcomeChecklistItem[];
  permittedActions: OutcomeActionKind[];
  createdAt?: string;
  updatedAt?: string;
};

export type OutcomeActionKind =
  | 'approve_substitution'
  | 'submit_vision_review'
  | 'clear_obstruction'
  | 'approve_layout_change'
  | 'reassign_worker'
  | 'assign_human'
  | 'retry_task'
  | 'simplify_menu'
  | 'begin_dinner'
  | 'keep_warm'
  | 'report_issue'
  | 'begin_cleanup'
  | 'cancel_outcome';

export type OutcomeActionInput = {
  action: OutcomeActionKind;
  requestId?: string;
  taskId?: string;
  notes?: string;
  payload?: Record<string, unknown>;
};

type JsonRecord = Record<string, unknown>;

const apiOrigin = (process.env.NEXT_PUBLIC_ORBIS_API_ORIGIN ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

export class OutcomeApiError extends Error {
  status: number;
  code?: string;
  retryable: boolean;
  details?: unknown;

  constructor(message: string, status = 0, code?: string, retryable = false, details?: unknown) {
    super(message);
    this.name = 'OutcomeApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function strings(value: unknown): string[] {
  return list(value).map((item) => string(item)).filter(Boolean);
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = string(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
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
    response = await fetch(`${apiOrigin}${path}`, { ...init, cache: 'no-store', headers });
  } catch {
    throw new OutcomeApiError('Orbis backend is offline. Start the API and retry.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const root = record(payload);
    const error = record(root.error ?? root.detail);
    throw new OutcomeApiError(
      string(error.message) || string(root.message) || `Request failed (${response.status})`,
      response.status,
      string(error.code) || string(root.code) || undefined,
      bool(error.retryable),
      error.details,
    );
  }
  return payload;
}

const taskStatuses = ['queued', 'ready', 'reserved', 'executing', 'verifying', 'completed', 'attention_required', 'blocked', 'failed', 'skipped', 'cancelled'] as const;
const outcomeStatuses = ['draft', 'awaiting_approval', 'scheduled', 'executing', 'attention_required', 'blocked', 'dinner_ready', 'cleaning_up', 'completed', 'cancelled'] as const;
const outcomePhases = ['planning', 'warehouse_fulfillment', 'home_preparation', 'delivery', 'cooking', 'final_verification', 'dinner_ready', 'cleanup', 'completed'] as const;
const actionKinds = ['approve_substitution', 'submit_vision_review', 'clear_obstruction', 'approve_layout_change', 'reassign_worker', 'assign_human', 'retry_task', 'simplify_menu', 'begin_dinner', 'keep_warm', 'report_issue', 'begin_cleanup', 'cancel_outcome'] as const;

function normalizeTask(value: unknown, index: number): OutcomeTaskView {
  const task = record(value);
  const worker = record(task.worker ?? task.assigned_worker);
  return {
    id: string(task.id, `task-${index + 1}`),
    title: string(task.title, string(task.name, `Task ${index + 1}`)),
    description: string(task.description, string(task.detail)) || undefined,
    status: enumValue(task.status, taskStatuses, 'queued'),
    progress: Math.max(0, Math.min(100, number(task.progress_percent, number(task.progress)))),
    workerId: string(task.worker_id, string(task.assigned_worker_id, string(worker.id))) || undefined,
    workerName: string(task.worker_name, string(task.assigned_worker_name, string(worker.name))) || (string(task.assigned_worker_id) ? humanize(string(task.assigned_worker_id)) : undefined),
    dependencies: strings(task.dependencies ?? task.depends_on),
    blockingReasons: strings(task.blocking_reasons ?? task.blocked_by),
    currentAction: string(task.current_action) || undefined,
    expectedCompletion: string(task.expected_completion ?? task.estimated_completion) || undefined,
    evidenceIds: strings(task.evidence_ids),
  };
}

function normalizeWorker(value: unknown, index: number): OutcomeWorkerView {
  const worker = record(value);
  const feed = record(worker.feed);
  const reliability = record(worker.reliability);
  return {
    id: string(worker.id, `worker-${index + 1}`),
    name: string(worker.name, `Worker ${index + 1}`),
    kind: enumValue(worker.kind ?? worker.worker_kind, ['ai', 'robot', 'human'] as const, 'robot'),
    subtype: string(worker.subtype, string(worker.model)) || undefined,
    status: string(worker.status, 'available'),
    health: string(worker.health, 'online'),
    location: string(worker.location, string(worker.lane_id)) || undefined,
    capabilities: strings(worker.capabilities),
    activeAssignment: string(worker.active_assignment, string(record(worker.assignment).title)) || undefined,
    videoUrl: string(worker.video_url, string(feed.src)) || undefined,
    attempts: typeof worker.attempts === 'number' ? worker.attempts : typeof reliability.attempts === 'number' ? reliability.attempts : undefined,
    completions: typeof worker.completions === 'number' ? worker.completions : typeof reliability.completions === 'number' ? reliability.completions : undefined,
    failures: typeof worker.failures === 'number' ? worker.failures : typeof reliability.failures === 'number' ? reliability.failures : undefined,
    interventionRate: typeof worker.intervention_rate === 'number' ? worker.intervention_rate : undefined,
  };
}

export function normalizeOutcomePlan(payload: unknown): OutcomePlanView {
  const outer = record(payload);
  const root = record(outer.plan ?? outer.data ?? payload);
  const order = record(root.order ?? root.warehouse_order);
  const rawMenu = record(root.meal).menu ?? root.menu;
  const menu = list(rawMenu).map((item) => typeof item === 'string' ? item : string(record(item).name, string(record(item).title))).filter(Boolean);
  const rawSchedule = Array.isArray(root.schedule ?? root.milestones)
    ? list(root.schedule ?? root.milestones)
    : list(root.proposed_lanes).map((lane) => ({ id: record(lane).id, label: record(lane).name, time: record(lane).starts_at, detail: record(lane).summary }));
  return {
    id: string(root.id, string(root.plan_id)),
    status: enumValue(root.status, ['draft', 'generating', 'awaiting_approval', 'approved', 'rejected', 'invalid'] as const, 'awaiting_approval'),
    title: string(root.title, 'Dinner for 12'),
    objective: string(root.objective),
    guestCount: number(root.guest_count, number(record(root.request).guest_count, number(record(root.details).guest_count, 12))),
    readyBy: string(root.ready_by, string(record(root.request).ready_by, string(root.deadline))) || undefined,
    menu,
    orderItems: list(order.items ?? root.order_items).map((value, index) => {
      const item = record(value);
      return {
        id: string(item.id, `item-${index + 1}`),
        name: string(item.name, `Item ${index + 1}`),
        quantity: `${typeof item.quantity === 'number' ? item.quantity : string(item.quantity, `${number(item.count, 1)}`)}${string(item.unit) ? ` ${string(item.unit)}` : ''}`,
        category: string(item.category) || undefined,
        status: string(item.status) || undefined,
        substitution: string(item.substitution) || undefined,
      };
    }),
    estimatedCost: typeof order.estimated_total === 'number' ? `$${order.estimated_total.toFixed(2)}` : string(order.estimated_cost, string(root.estimated_cost)) || undefined,
    workers: list(root.workers ?? root.proposed_workers).map(normalizeWorker),
    schedule: rawSchedule.map((value, index) => {
      const item = record(value);
      return { id: string(item.id, `milestone-${index + 1}`), label: string(item.label, string(item.title, `Milestone ${index + 1}`)), time: string(item.time) || undefined, detail: string(item.detail) || undefined };
    }),
    policies: list(root.policies).map((policy) => typeof policy === 'string' ? policy : `${string(record(policy).name)} · ${humanize(string(record(policy).decision))}`).filter(Boolean),
    assumptions: strings(root.assumptions),
    dinnerReadyCriteria: strings(root.dinner_ready_criteria ?? root.definition_of_done ?? record(root.dinner_readiness).criteria ?? record(root.dinner_readiness).required_checks),
    cleanupTasks: strings(root.cleanup_tasks ?? record(root.cleanup).tasks ?? record(root.cleanup).required_checks ?? root.cleanup),
  };
}

export function normalizeOutcome(payload: unknown): OutcomeView {
  const outer = record(payload);
  const root = record(outer.outcome ?? outer.data ?? payload);
  const currentWorker = record(root.current_worker);
  const routing = record(root.routing);
  const checklist = record(root.checklists);

  return {
    id: string(root.id, string(root.outcome_id)),
    planId: string(root.plan_id) || undefined,
    title: string(root.title, 'Dinner for 12'),
    objective: string(root.objective),
    status: enumValue(root.status, outcomeStatuses, 'draft'),
    phase: enumValue(root.phase, outcomePhases, 'planning'),
    progress: Math.max(0, Math.min(100, number(root.progress_percent, number(root.progress)))),
    deadline: string(root.deadline, string(root.ready_by)) || undefined,
    predictedCompletion: string(root.predicted_completion, string(root.estimated_completion)) || undefined,
    currentAction: string(root.current_action) || undefined,
    currentWorkerId: string(root.current_worker_id, string(currentWorker.id)) || undefined,
    currentWorkerName: string(root.current_worker_name, string(currentWorker.name)) || undefined,
    nextAction: string(root.next_action) || undefined,
    blockedBy: typeof root.blocked_by === 'string' ? string(root.blocked_by) || undefined : strings(root.blocked_by).join(' · ') || undefined,
    scheduleRisk: string(root.schedule_risk) || undefined,
    mode: enumValue(root.mode, ['fixture', 'live', 'simulation'] as const, 'simulation'),
    lanes: list(root.lanes).map((value, index): OutcomeLaneView => {
      const lane = record(value);
      const id = enumValue(lane.id ?? lane.kind, ['warehouse', 'delivery', 'home'] as const, index === 0 ? 'warehouse' : index === 1 ? 'delivery' : 'home');
      return {
        id,
        label: string(lane.label, string(lane.name, id[0].toUpperCase() + id.slice(1))),
        status: string(lane.status, 'queued'),
        progress: Math.max(0, Math.min(100, number(lane.progress_percent, number(lane.progress)))),
        currentAction: string(lane.current_action) || undefined,
        nextAction: string(lane.next_action) || undefined,
        blockedBy: string(lane.blocked_by) || undefined,
        expectedCompletion: string(lane.expected_completion, string(lane.predicted_completion)) || undefined,
        tasks: list(lane.tasks).map(normalizeTask),
      };
    }),
    workers: list(root.workers).map(normalizeWorker),
    attention: (Array.isArray(root.attention ?? root.attention_items) ? list(root.attention ?? root.attention_items) : root.attention ? [root.attention] : []).map((value, index): OutcomeAttentionView => {
      const item = record(value);
      return {
        id: string(item.id, `attention-${index + 1}`),
        severity: item.severity === 'high' ? 'critical' : item.severity === 'medium' ? 'warning' : enumValue(item.severity, ['info', 'warning', 'critical'] as const, 'warning'),
        title: string(item.title, 'Attention required'),
        message: string(item.message, string(item.reason)),
        lane: string(item.lane) ? enumValue(item.lane, ['warehouse', 'delivery', 'home'] as const, 'home') : undefined,
        affectedTasks: strings(item.affected_tasks ?? item.affected_task_ids),
        continuingTasks: strings(item.continuing_tasks ?? item.continuing_task_ids),
        deadlineImpact: string(item.deadline_impact) || (typeof item.deadline_impact_minutes === 'number' ? `${item.deadline_impact_minutes} minute impact` : undefined),
        evidenceIds: strings(item.evidence_ids),
        permittedActions: list(item.permitted_actions).map((action) => enumValue(typeof action === 'string' ? action : record(action).kind, actionKinds, 'retry_task')),
        openedAt: string(item.opened_at, string(item.raised_at)) || undefined,
      };
    }),
    routingCandidates: list(routing.candidates ?? root.routing_candidates).map((value, index): OutcomeRoutingCandidateView => {
      const candidate = record(value);
      return {
        id: string(candidate.id, string(candidate.worker_id, `route-${index + 1}`)),
        name: string(candidate.name, string(record(candidate.worker).name, string(candidate.worker_id) ? humanize(string(candidate.worker_id)) : `Delivery worker ${index + 1}`)),
        selected: bool(candidate.selected),
        eligible: bool(candidate.eligible),
        reasons: strings(candidate.reasons),
      };
    }),
    custody: list(record(root.custody).history ?? root.custody_chain ?? root.custody).map((value, index): OutcomeCustodyView => {
      const item = record(value);
      return {
        id: string(item.id, `custody-${index + 1}`),
        objectName: string(item.object_name, string(item.object_id, 'Dinner order')),
        from: string(item.from, string(item.from_worker_name, string(item.from_worker_id))) || undefined,
        to: string(item.to, string(item.to_worker_name, string(item.to_worker_id))),
        status: enumValue(item.status === 'offered' ? 'pending' : item.status, ['pending', 'accepted', 'rejected'] as const, 'pending'),
        occurredAt: string(item.occurred_at) || undefined,
        evidenceId: string(item.evidence_id) || undefined,
      };
    }),
    evidence: list(root.evidence).map((value, index): OutcomeEvidenceView => {
      const item = record(value);
      return {
        id: string(item.id, `evidence-${index + 1}`),
        type: string(item.type, 'event'),
        title: string(item.title, string(item.summary, 'Evidence recorded')),
        actor: string(item.actor, string(item.actor_name, string(item.actor_id, 'Orbis'))),
        actorKind: string(item.actor_kind) ? enumValue(item.actor_kind, ['ai', 'robot', 'human'] as const, 'ai') : undefined,
        occurredAt: string(item.occurred_at) || undefined,
        confidence: typeof item.confidence === 'number' || item.confidence === null ? item.confidence as number | null : undefined,
        source: string(item.source) || undefined,
        summary: string(item.summary) || undefined,
      };
    }),
    events: list(root.events).map((value, index): OutcomeEventView => {
      const event = record(value);
      return { sequence: number(event.sequence, index + 1), type: string(event.type, 'outcome.updated'), message: string(event.message), occurredAt: string(event.occurred_at, string(event.timestamp)) || undefined };
    }),
    dinnerReadyChecklist: list(root.dinner_ready_checklist ?? checklist.dinner_ready ?? record(root.dinner_readiness).checks).map(normalizeChecklistItem),
    cleanupChecklist: list(root.cleanup_checklist ?? checklist.cleanup ?? record(root.cleanup).checks).map(normalizeChecklistItem),
    permittedActions: list(root.permitted_actions).map((action) => enumValue(typeof action === 'string' ? action : record(action).kind, actionKinds, 'retry_task')),
    createdAt: string(root.created_at) || undefined,
    updatedAt: string(root.updated_at) || undefined,
  };
}

function normalizeChecklistItem(value: unknown, index: number): OutcomeChecklistItem {
  const item = record(value);
  const rawStatus = string(item.status);
  const status = rawStatus === 'passed' ? 'verified' : rawStatus === 'blocked' || rawStatus === 'failed' ? 'attention' : rawStatus === 'executing' ? 'pending' : rawStatus;
  return {
    id: string(item.id, `check-${index + 1}`),
    label: string(item.label, string(item.title, string(item.id) ? humanize(string(item.id)) : `Check ${index + 1}`)),
    status: enumValue(status, ['pending', 'verified', 'attention', 'not_required'] as const, 'pending'),
    evidenceId: string(item.evidence_id) || undefined,
  };
}

export async function createOutcomePlan(input: { objective: string; requestId?: string; details?: Record<string, unknown> }): Promise<OutcomePlanView> {
  const payload = await requestJson('/api/v1/outcome-plans', {
    method: 'POST',
    body: JSON.stringify({ request_id: input.requestId ?? requestId('plan'), objective: input.objective, scenario: 'home_dinner', constraints: input.details ?? {} }),
  });
  return normalizeOutcomePlan(payload);
}

export async function getOutcomePlan(planId: string): Promise<OutcomePlanView> {
  return normalizeOutcomePlan(await requestJson(`/api/v1/outcome-plans/${encodeURIComponent(planId)}`));
}

export async function approveOutcomePlan(planId: string, input: { requestId?: string; notes?: string } = {}): Promise<OutcomeView> {
  const payload = await requestJson(`/api/v1/outcome-plans/${encodeURIComponent(planId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ request_id: input.requestId ?? requestId('approve'), approve_purchase: true, approve_execution: true, high_risk_cooking: 'human_approval_required', notes: input.notes }),
  });
  return normalizeOutcome(payload);
}

export async function getOutcome(outcomeId: string): Promise<OutcomeView> {
  return normalizeOutcome(await requestJson(`/api/v1/outcomes/${encodeURIComponent(outcomeId)}`));
}

export async function startOutcome(outcomeId: string, input: { requestId?: string } = {}): Promise<OutcomeView> {
  const payload = await requestJson(`/api/v1/outcomes/${encodeURIComponent(outcomeId)}/start`, {
    method: 'POST',
    body: JSON.stringify({ request_id: input.requestId ?? requestId('start') }),
  });
  return normalizeOutcome(payload);
}

export async function performOutcomeAction(outcomeId: string, input: OutcomeActionInput): Promise<OutcomeView> {
  const payload = await requestJson(`/api/v1/outcomes/${encodeURIComponent(outcomeId)}/actions`, {
    method: 'POST',
    body: JSON.stringify({
      request_id: input.requestId ?? requestId(input.action),
      action: input.action,
      actor_id: 'host-demo',
      target_id: input.taskId,
      parameters: { ...input.payload, ...(input.notes ? { notes: input.notes } : {}) },
    }),
  });
  return normalizeOutcome(payload);
}

export async function getOutcomeEvents(outcomeId: string, afterSequence = 0): Promise<OutcomeEventView[]> {
  const payload = await requestJson(`/api/v1/outcomes/${encodeURIComponent(outcomeId)}/events?after_sequence=${afterSequence}`);
  const root = record(payload);
  return list(root.events ?? payload).map((value, index) => {
    const event = record(value);
    return { sequence: number(event.sequence, afterSequence + index + 1), type: string(event.type, 'outcome.updated'), message: string(event.message), occurredAt: string(event.occurred_at, string(event.timestamp)) || undefined };
  });
}

export async function getHomeWorkers(): Promise<OutcomeWorkerView[]> {
  const payload = await requestJson('/api/v1/home/workers');
  const root = record(payload);
  return list(root.workers ?? payload).map(normalizeWorker);
}

export async function getHomeWorker(workerId: string): Promise<OutcomeWorkerView> {
  const payload = await requestJson(`/api/v1/home/workers/${encodeURIComponent(workerId)}`);
  const root = record(payload);
  return normalizeWorker(root.worker ?? root.data ?? payload, 0);
}
