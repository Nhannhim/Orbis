'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowUp, Bot, Boxes, Cable, Check, CheckCircle2, CircleHelp,
  Clock3, ListChecks, Map, MessageSquarePlus, MoreHorizontal, Package, PanelLeftClose,
  PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, QrCode, Radio, ScanLine,
  RefreshCw, Search, Settings, ShieldCheck, Sparkles, Truck, UserCheck, Warehouse, Waypoints, Wifi, X,
} from 'lucide-react';
import { MachineThreePreview } from '@/components/machine-three-preview';
import { OrbisMark } from '@/components/orbis-mark';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Textarea } from '@/components/ui/textarea';
import {
  createWorkflow,
  fallbackVisionScenarios,
  getSystemView,
  getVisionScenarios,
  getWorkflow,
  OrbisApiError,
  retryWorkflow,
  startWorkflow,
  submitVisionReview,
  type ReviewDisposition,
  type RoutingCandidateView,
  type VisionGateView,
  type VisionScenario,
  type WorkflowView,
} from '@/lib/orbis-api';

type ViewId = 'orchestrator' | 'connections' | 'tasks' | 'space';
type MachineId = 'packing' | 'amr' | 'loading';
type ProcessId = 'pack' | 'route' | 'truck' | 'move' | 'load';
type ProcessStatus = 'running' | 'waiting' | 'success' | 'not_validated';
type SessionReturn = ViewId | 'connection-detail' | null;

type MachineSession = { id: string; title: string; time: string; success: boolean | null };
type Machine = {
  id: MachineId;
  name: string;
  model: string;
  location: string;
  health: string;
  protocol: string;
  sessions: MachineSession[];
};
type ProcessNode = { id: ProcessId; title: string; machineId: MachineId; detail: string; x: number; y: number };

const machines: Record<MachineId, Machine> = {
  packing: {
    id: 'packing', name: 'Packing Arm 01', model: 'Universal Robots UR16e', location: 'Packing cell A', health: 'Online', protocol: 'OPC UA · Vision v4',
    sessions: [
      { id: 'SES-319', title: 'Seal and verify ORD-1042', time: 'Now', success: null },
      { id: 'SES-318', title: 'Repack ORD-1037', time: '11:04 AM', success: true },
      { id: 'SES-316', title: 'Prepare outbound tote', time: '9:42 AM', success: true },
    ],
  },
  amr: {
    id: 'amr', name: 'Mobile Robot 01', model: 'MiR 250 · LiDAR', location: 'Lane C2', health: 'Online', protocol: 'MQTT · ROS 2',
    sessions: [
      { id: 'SES-521', title: 'Reserve route to dock 04', time: 'Now', success: null },
      { id: 'SES-520', title: 'Return empty pallet', time: '11:22 AM', success: true },
      { id: 'SES-517', title: 'Move inbound tote 18', time: '10:08 AM', success: true },
    ],
  },
  loading: {
    id: 'loading', name: 'Loading Station 01', model: 'Dock eye · Siemens PLC', location: 'Dock 04', health: 'Online', protocol: 'PROFINET · RTSP',
    sessions: [
      { id: 'SES-144', title: 'Validate truck-17', time: 'Now', success: true },
      { id: 'SES-143', title: 'Load outbound pallet 22', time: '10:51 AM', success: true },
      { id: 'SES-141', title: 'Inspect dock safety zone', time: '8:35 AM', success: false },
    ],
  },
};

const processNodes: ProcessNode[] = [
  { id: 'pack', title: 'Pack and verify', machineId: 'packing', detail: 'Seal ORD-1042 and validate label, weight, and enclosure.', x: 7, y: 17 },
  { id: 'route', title: 'Reserve route', machineId: 'amr', detail: 'Move to the C2 pickup point and reserve a clear dock path.', x: 37, y: 17 },
  { id: 'truck', title: 'Validate truck', machineId: 'loading', detail: 'Confirm truck-17 identity, position, and cargo readiness.', x: 67, y: 17 },
  { id: 'move', title: 'Transfer custody', machineId: 'amr', detail: 'Accept the package and transport it to dock 04.', x: 27, y: 56 },
  { id: 'load', title: 'Load and prove', machineId: 'loading', detail: 'Load the package and prove secure placement in truck-17.', x: 57, y: 76 },
];

const idleStatuses: Record<ProcessId, ProcessStatus> = {
  pack: 'waiting', route: 'waiting', truck: 'waiting', move: 'waiting', load: 'not_validated',
};

const initialRecentTasks = [
  { title: 'Outbound fulfillment', meta: 'Warehouse 01 · Active', icon: Warehouse },
  { title: 'Dock 04 reset', meta: '12 minutes ago', icon: Truck },
  { title: 'Inventory sweep', meta: 'Yesterday', icon: Package },
  { title: 'Dinner preparation', meta: 'Home · Aug 27', icon: Bot },
];

const taskGroups = [
  { title: 'Available', state: 'available', items: ['Cycle-count aisle D', 'Charge inspection drone'] },
  { title: 'Ongoing', state: 'running', items: ['Fulfill ORD-1042', 'Reserve route C2 → Dock 04'] },
  { title: 'Issue', state: 'issue', items: ['Inspect safety curtain'] },
  { title: 'Success', state: 'success', items: ['Validate truck-17', 'Return empty pallet'] },
];

const fallbackRoutingCandidates: RoutingCandidateView[] = [
  { id: 'delivery-robot-01', name: 'Delivery Robot 01', kind: 'robot', status: 'blocked', selected: false, reasons: ['WAITING_FOR_VISION_CLEARANCE'] },
  { id: 'delivery-van-07', name: 'Delivery Van 07', kind: 'human', status: 'blocked', selected: false, reasons: ['WAITING_FOR_VISION_CLEARANCE'] },
];

const emptyVision: VisionGateView = {
  state: 'pending', providerLabel: 'Provider pending', observations: {}, reasons: [],
};

function displayToken(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function connectionStatusFor(error: unknown): 'online' | 'offline' {
  return error instanceof OrbisApiError && error.status === 0 ? 'offline' : 'online';
}

function visionStateLabel(state: VisionGateView['state']) {
  if (state === 'review_required') return 'Human review required';
  if (state === 'clear') return 'Cleared';
  if (state === 'unavailable') return 'Service unavailable';
  if (state === 'analyzing') return 'Analyzing';
  return 'Awaiting inspection';
}

function mapStepStatus(status: string): ProcessStatus {
  if (status === 'completed' || status === 'success') return 'success';
  if (['reserved', 'executing', 'verifying', 'running'].includes(status)) return 'running';
  if (status === 'failed') return 'waiting';
  return 'waiting';
}

function processStatuses(workflow: WorkflowView | null): Record<ProcessId, ProcessStatus> {
  if (!workflow) return idleStatuses;
  const byCapability = (pattern: RegExp) => workflow.steps.find((step) => pattern.test(`${step.capability} ${step.name}`));
  const pack = byCapability(/pack|seal/i);
  const move = byCapability(/move|transport|route/i);
  const load = byCapability(/load|vehicle/i);
  const visionClear = workflow.vision.state === 'clear';
  return {
    pack: pack ? mapStepStatus(pack.status) : visionClear ? 'waiting' : 'not_validated',
    route: move ? mapStepStatus(move.status) : 'waiting',
    truck: load ? (mapStepStatus(load.status) === 'success' ? 'success' : 'waiting') : 'waiting',
    move: move ? mapStepStatus(move.status) : 'waiting',
    load: load ? mapStepStatus(load.status) : 'not_validated',
  };
}

function MachineIcon({ machineId }: { machineId: MachineId }) {
  if (machineId === 'packing') return <Bot />;
  if (machineId === 'amr') return <Truck />;
  return <Warehouse />;
}

function processForMachine(machineId: MachineId): ProcessId {
  if (machineId === 'packing') return 'pack';
  if (machineId === 'amr') return 'route';
  return 'truck';
}

function titleFromObjective(objective: string) {
  if (/ORD-1042/i.test(objective)) return 'Fulfill ORD-1042 at Dock 04';
  const words = objective.trim().split(/\s+/).slice(0, 8).join(' ');
  return words.length < objective.trim().length ? `${words}…` : words;
}

function MachineSessions({ machine, onOpen }: { machine: Machine; onOpen: (session: MachineSession) => void }) {
  return (
    <section className="ow-session-list">
      <header><div><h3>{machine.name} sessions</h3><p>Every session belongs to this robot and its coordinated task.</p></div><button type="button">View all</button></header>
      <div>{machine.sessions.map((session) => <button className="ow-session-row" type="button" key={session.id} onClick={() => onOpen(session)}><span className={`ow-session-result ${session.success === true ? 'is-success' : session.success === false ? 'is-failed' : 'is-running'}`}>{session.success === true ? <Check /> : session.success === false ? '×' : <Activity />}</span><span><strong>{session.title}</strong><small>{session.id} · {machine.name}</small></span><time>{session.time}</time></button>)}</div>
    </section>
  );
}

function FlowGraph({ statuses, selectedProcessId, onSelect }: { statuses: Record<ProcessId, ProcessStatus>; selectedProcessId: ProcessId; onSelect: (id: ProcessId) => void }) {
  return (
    <div className="ow-flow-canvas">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M50 6 V12 M50 12 H16 V17 M50 12 H46 V17 M50 12 H76 V17" />
        <path d="M16 39 V48 H38 V56 M46 39 V48 H38 M76 39 V48 H38" />
        <path d="M38 70 V73 H68 V76" />
      </svg>
      <div className="ow-flow-origin"><span>Task</span><strong>ORD-1042 → Dock 04</strong></div>
      {processNodes.map((process) => {
        const status = statuses[process.id];
        return <button className={`ow-flow-node is-${status} ${selectedProcessId === process.id ? 'is-selected' : ''}`} style={{ left: `${process.x}%`, top: `${process.y}%` }} type="button" key={process.id} onClick={() => onSelect(process.id)}>
          <span className="ow-flow-node-icon"><MachineIcon machineId={process.machineId} /></span>
          <span><strong>{process.title}</strong><small>{machines[process.machineId].name}</small></span>
          <i>{status === 'success' ? <CheckCircle2 /> : status === 'running' ? <Activity /> : <Clock3 />}</i>
        </button>;
      })}
      <span className="ow-wait-label is-pickup">Wait for custody</span><span className="ow-wait-label is-dock">Wait for package</span>
    </div>
  );
}

function ScenarioControls({
  scenarios,
  selectedId,
  onSelect,
  mode,
  onModeChange,
  disabled,
}: {
  scenarios: VisionScenario[];
  selectedId: string;
  onSelect: (id: string) => void;
  mode: 'openai' | 'fixture';
  onModeChange: (mode: 'openai' | 'fixture') => void;
  disabled: boolean;
}) {
  return <div className="ow-scenario-controls">
    <div className="ow-scenario-options" aria-label="Package condition scenario">
      {scenarios.map((scenario) => <button className={scenario.id === selectedId ? 'is-selected' : ''} type="button" key={scenario.id} onClick={() => onSelect(scenario.id)} disabled={disabled}><strong>{scenario.label}</strong><small>{scenario.description}</small></button>)}
    </div>
    <div className="ow-provider-mode" aria-label="Vision provider mode">
      <button className={mode === 'openai' ? 'is-selected' : ''} type="button" onClick={() => onModeChange('openai')} disabled={disabled}>Live model</button>
      <button className={mode === 'fixture' ? 'is-selected' : ''} type="button" onClick={() => onModeChange('fixture')} disabled={disabled}>Fixture</button>
    </div>
  </div>;
}

function VisionGatePanel({
  vision,
  scenarios,
  scenarioId,
  onScenarioChange,
  mode,
  onModeChange,
  workflow,
  busy,
  apiError,
  onRun,
  onReview,
  onRetry,
}: {
  vision: VisionGateView;
  scenarios: VisionScenario[];
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  mode: 'openai' | 'fixture';
  onModeChange: (mode: 'openai' | 'fixture') => void;
  workflow: WorkflowView | null;
  busy: boolean;
  apiError: string | null;
  onRun: () => void;
  onReview: (disposition: ReviewDisposition) => void;
  onRetry: () => void;
}) {
  const observationRows = [
    ['Package', vision.observations.packageDetected === undefined ? 'Pending' : vision.observations.packageDetected ? 'Detected' : 'Not detected'],
    ['Type', vision.observations.packageType ? displayToken(vision.observations.packageType) : 'Pending'],
    ['Size', vision.observations.sizeClass ? displayToken(vision.observations.sizeClass) : 'Pending'],
    ['Damage', vision.observations.visibleDamage ? displayToken(vision.observations.visibleDamage) : 'Pending'],
    ['Label', vision.observations.labelReadable === undefined ? 'Pending' : vision.observations.labelReadable ? 'Readable' : 'Review needed'],
  ];
  const scenarioKey = scenarioId.toLowerCase().includes('uncertain') ? 'uncertain' : scenarioId.toLowerCase().includes('damaged') ? 'damaged' : 'normal';
  const imageUrl = vision.imageUrl ?? `/images/vision/package-${scenarioKey}.jpg`;
  const stateClass = vision.state === 'clear' ? 'is-clear' : vision.state === 'review_required' || vision.state === 'unavailable' ? 'is-attention' : 'is-running';

  return <section className={`ow-vision-gate ${stateClass}`}>
    <header>
      <div><span className="ow-worker-symbol"><ScanLine /></span><div><small>AI WORKER · OBSERVE ONLY</small><h2>Package Vision 01</h2></div></div>
      <div className="ow-vision-labels"><span className={`ow-gate-state ${stateClass}`}>{vision.state === 'clear' ? <Check /> : vision.state === 'review_required' || vision.state === 'unavailable' ? <AlertTriangle /> : <Activity />}{visionStateLabel(vision.state)}</span><span>{mode === 'fixture' ? 'FIXTURE' : vision.providerLabel.toUpperCase()}</span></div>
    </header>

    {!workflow && <ScenarioControls scenarios={scenarios} selectedId={scenarioId} onSelect={onScenarioChange} mode={mode} onModeChange={onModeChange} disabled={busy} />}

    {apiError && <div className="ow-api-error"><AlertTriangle /><span><strong>Backend connection interrupted</strong><small>{apiError}</small></span><button type="button" onClick={onRetry} disabled={busy}><RefreshCw /> Retry</button></div>}

    <div className="ow-vision-content">
      <div className="ow-vision-frame">
        <Image src={imageUrl} alt={`${scenarios.find((scenario) => scenario.id === scenarioId)?.label ?? 'Package'} inspection scenario`} fill sizes="(max-width: 900px) 100vw, 50vw" unoptimized />
        <span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" />
        <div><span>{workflow ? visionStateLabel(vision.state) : 'SIMULATED FEED'}</span><strong>{scenarios.find((scenario) => scenario.id === scenarioId)?.label ?? 'Package'} package · CAM-INTAKE-01</strong></div>
      </div>
      <div className="ow-observation-panel">
        <header><span>Structured observations</span>{Number.isFinite(vision.confidence) && <strong>{Math.round((vision.confidence ?? 0) * 100)}% model-reported</strong>}</header>
        <dl>{observationRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {vision.reasons.length > 0 && <div className="ow-policy-reasons"><span>Policy signals</span><p>{vision.reasons.map(displayToken).join(' · ')}</p></div>}
        <footer><span>Evidence</span><strong>{vision.evidenceId ?? 'Created after inspection'}</strong></footer>
      </div>
    </div>

    {vision.state === 'review_required' && vision.inspectionId && <div className="ow-review-actions"><div><UserCheck /><span><strong>Human decision required</strong><small>Original AI evidence stays unchanged. Your decision is appended.</small></span></div><div><button type="button" onClick={() => onReview('corrected')} disabled={busy}>Correct observations</button><button type="button" onClick={() => onReview('repackaged_and_cleared')} disabled={busy}>Repackaged &amp; clear</button><button className="is-danger" type="button" onClick={() => onReview('rejected')} disabled={busy}>Reject</button></div></div>}

    {vision.state === 'unavailable' && <div className="ow-review-actions is-unavailable"><div><AlertTriangle /><span><strong>Vision failed closed</strong><small>No physical or delivery worker has been released.</small></span></div><div><button type="button" onClick={onRetry} disabled={busy}><RefreshCw /> Retry inspection</button></div></div>}

    {!workflow && <footer className="ow-vision-start"><span>Vision must clear before a delivery worker can be selected.</span><Button onClick={onRun} disabled={busy}>{busy ? <Activity className="spin-soft" /> : <ArrowUp />}{busy ? 'Starting…' : 'Run demo'}</Button></footer>}
  </section>;
}

function RoutingPanel({ candidates }: { candidates: RoutingCandidateView[] }) {
  return <section className="ow-routing-panel">
    <header><div><span>SIMULATED ROUTING</span><h2>Next-mile worker selection</h2></div><small>Orbis policy · downstream placeholder</small></header>
    <div>{candidates.map((candidate) => {
      const humanOperated = candidate.kind === 'human' || candidate.kind === 'van';
      const Icon = humanOperated ? Truck : Bot;
      return <article className={`${candidate.selected ? 'is-selected' : ''} is-${candidate.status}`} key={candidate.id}>
        <span className="ow-routing-icon"><Icon /></span>
        <div><strong>{humanOperated ? 'Delivery Van 07' : candidate.name}</strong><small>{humanOperated ? 'Human driver · Delivery Van 07' : 'Autonomous robot · Delivery Robot 01'}</small><p>{candidate.reasons.length > 0 ? candidate.reasons.map(displayToken).join(' · ') : 'Awaiting policy evaluation'}</p></div>
        <span className="ow-routing-state">{candidate.selected ? <><Check /> Selected</> : displayToken(candidate.status)}</span>
      </article>;
    })}</div>
  </section>;
}

export function OrbisWorkspace({ displayName, demo = false }: { displayName: string; demo?: boolean }) {
  const [activeView, setActiveView] = useState<ViewId>('orchestrator');
  const [taskMode, setTaskMode] = useState<'new' | 'session'>('session');
  const [sessionTitle, setSessionTitle] = useState('Fulfill ORD-1042 at Dock 04');
  const [sessionReturn, setSessionReturn] = useState<SessionReturn>(null);
  const [recentTasks, setRecentTasks] = useState(initialRecentTasks);
  const [selectedProcessId, setSelectedProcessId] = useState<ProcessId>('pack');
  const [selectedMachineId, setSelectedMachineId] = useState<MachineId>('packing');
  const [connectionScreen, setConnectionScreen] = useState<'list' | 'detail'>('list');
  const [machineDetailReturn, setMachineDetailReturn] = useState<ViewId>('connections');
  const [objective, setObjective] = useState('Fulfill ORD-1042 and load truck-17 at dock 04');
  const [followUp, setFollowUp] = useState('');
  const [scenarios, setScenarios] = useState<VisionScenario[]>(fallbackVisionScenarios);
  const [scenarioId, setScenarioId] = useState<string>('damaged');
  const [visionMode, setVisionMode] = useState<'openai' | 'fixture'>('fixture');
  const [pollIntervalMs, setPollIntervalMs] = useState(750);
  const [workflow, setWorkflow] = useState<WorkflowView | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiError, setApiError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workflowOpen, setWorkflowOpen] = useState(true);

  const statuses = useMemo(() => processStatuses(workflow), [workflow]);
  const selectedProcess = processNodes.find((process) => process.id === selectedProcessId) ?? processNodes[0];
  const processMachine = machines[selectedProcess.machineId];
  const selectedMachine = activeView === 'orchestrator' ? processMachine : machines[selectedMachineId];
  const selectedStatus = statuses[selectedProcess.id];
  const isRunning = actionPending || ['pending', 'inspecting', 'ready_for_routing', 'routing', 'running'].includes(workflow?.status ?? '');
  const machineIsWorking = selectedStatus === 'running';
  const vision = workflow?.vision ?? emptyVision;
  const routingCandidates = workflow?.routing.candidates.length ? workflow.routing.candidates : fallbackRoutingCandidates;
  const shortName = displayName.includes('@') ? displayName.split('@')[0] : displayName.split(' ')[0];

  useEffect(() => {
    let cancelled = false;
    Promise.all([getVisionScenarios(), getSystemView()]).then(([items, system]) => {
      if (cancelled) return;
      setScenarios(items);
      setVisionMode(system.visionMode);
      setPollIntervalMs(system.pollIntervalMs);
      const damaged = items.find((item) => item.id.toLowerCase().includes('damaged'));
      setScenarioId((current) => items.some((item) => item.id === current) ? current : damaged?.id ?? items[0]?.id ?? 'damaged');
      setApiStatus('online');
      setApiError(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setApiStatus(connectionStatusFor(error));
      setApiError(error instanceof Error ? error.message : 'Unable to reach the Orbis backend.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workflow?.id || ['completed', 'cancelled', 'rejected'].includes(workflow.status)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await getWorkflow(workflow.id);
        if (cancelled) return;
        setWorkflow(next);
        setApiStatus('online');
        setApiError(null);
      } catch (error) {
        if (cancelled) return;
        setApiStatus(connectionStatusFor(error));
        setApiError(error instanceof Error ? error.message : 'Unable to refresh workflow state.');
      }
    };
    const interval = window.setInterval(() => { void refresh(); }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, workflow?.id, workflow?.status]);

  function navigate(view: ViewId) {
    setActiveView(view);
    setShowScanner(false);
    setSessionReturn(null);
    if (view === 'connections') setConnectionScreen('list');
  }

  function startNewTask() {
    setActiveView('orchestrator');
    setTaskMode('new');
    setSessionReturn(null);
    setObjective('');
    setFollowUp('');
    setWorkflow(null);
    setApiError(null);
    setWorkflowOpen(false);
  }

  function selectProcess(processId: ProcessId) {
    const process = processNodes.find((item) => item.id === processId);
    if (process) setSelectedMachineId(process.machineId);
    setSelectedProcessId(processId);
  }

  function openSession(title: string, machineId: MachineId, returnTo: SessionReturn = null) {
    setSessionTitle(title);
    setSelectedMachineId(machineId);
    selectProcess(processForMachine(machineId));
    setTaskMode('session');
    setActiveView('orchestrator');
    setSessionReturn(returnTo);
    setWorkflowOpen(true);
  }

  function backFromSession() {
    if (sessionReturn === 'connection-detail') {
      setActiveView('connections');
      setConnectionScreen('detail');
    } else if (sessionReturn) {
      navigate(sessionReturn);
    }
    setSessionReturn(null);
  }

  function openMachineDetail(machineId: MachineId, returnTo: ViewId = 'connections') {
    setSelectedMachineId(machineId);
    setMachineDetailReturn(returnTo);
    setConnectionScreen('detail');
    setActiveView('connections');
    setShowScanner(false);
  }

  function backFromMachineDetail() {
    if (machineDetailReturn === 'connections') {
      setConnectionScreen('list');
    } else {
      navigate(machineDetailReturn);
    }
  }

  async function runObjective() {
    const taskObjective = objective.trim();
    if (isRunning || !taskObjective) return;
    const generatedTitle = titleFromObjective(taskObjective);
    setSessionTitle(generatedTitle);
    setTaskMode('session');
    setSessionReturn(null);
    setWorkflowOpen(true);
    setActionPending(true);
    setApiError(null);
    setRecentTasks((items) => [{ title: generatedTitle, meta: 'Warehouse 01 · Just now', icon: Warehouse }, ...items.filter((item) => item.title !== generatedTitle)].slice(0, 6));
    try {
      const created = await createWorkflow({ objective: taskObjective, scenarioId, visionMode });
      if (!created.id) throw new Error('The backend created a workflow without an ID.');
      setWorkflow(created);
      const started = created.status === 'pending' ? await startWorkflow(created.id, visionMode) : created;
      setWorkflow(started);
      setApiStatus('online');
    } catch (error) {
      setApiStatus(connectionStatusFor(error));
      setApiError(error instanceof Error ? error.message : 'Unable to start this workflow.');
    } finally {
      setActionPending(false);
    }
  }

  async function reviewVision(disposition: ReviewDisposition) {
    if (!workflow?.id || !vision.inspectionId || actionPending) return;
    setActionPending(true);
    setApiError(null);
    try {
      const corrections = disposition === 'corrected' ? { package_type: 'cardboard_box', size_class: 'medium', visible_damage: 'none', label_readable: true } : undefined;
      const next = await submitVisionReview({
        workflowId: workflow.id,
        inspectionId: vision.inspectionId,
        disposition,
        corrections,
        notes: disposition === 'repackaged_and_cleared' ? 'Package was repackaged by the demo inspector.' : disposition === 'corrected' ? 'Inspector verified all critical package observations.' : undefined,
      });
      setWorkflow(next);
      setApiStatus('online');
    } catch (error) {
      setApiStatus(connectionStatusFor(error));
      setApiError(error instanceof Error ? error.message : 'Unable to submit this review.');
    } finally {
      setActionPending(false);
    }
  }

  async function retryCurrentWorkflow() {
    setActionPending(true);
    setApiError(null);
    try {
      if (workflow?.id) {
        setWorkflow(apiStatus === 'offline' ? await getWorkflow(workflow.id) : await retryWorkflow(workflow.id, visionMode));
      } else {
        const [items, system] = await Promise.all([getVisionScenarios(), getSystemView()]);
        setScenarios(items);
        setVisionMode(system.visionMode);
        setPollIntervalMs(system.pollIntervalMs);
      }
      setApiStatus('online');
    } catch (error) {
      setApiStatus(connectionStatusFor(error));
      setApiError(error instanceof Error ? error.message : 'Retry failed.');
    } finally {
      setActionPending(false);
    }
  }

  function sendFollowUp() {
    if (!followUp.trim()) return;
    setFollowUp('');
  }

  const topbarTitle = activeView === 'orchestrator'
    ? taskMode === 'new' ? 'New task' : sessionTitle
    : activeView === 'connections' && connectionScreen === 'detail' ? selectedMachine.name
      : activeView[0].toUpperCase() + activeView.slice(1);

  const detailContent = <section className="ow-detail-pane">
    {activeView === 'orchestrator' && taskMode === 'new' && <div className="ow-detail-scroll ow-new-task-page">
      <section className="ow-new-task-empty">
        <div className="ow-new-task-mark"><OrbisMark /></div>
        <h1>What should your machines do?</h1>
        <p>Describe the outcome. Orbis will create a task session, start independent work in parallel, and coordinate every handoff.</p>
        <section className="ow-prompt-card ow-new-task-composer">
          <Textarea aria-label="New task objective" placeholder="Ask Orbis to coordinate an outcome…" value={objective} onChange={(event) => setObjective(event.target.value)} disabled={isRunning} />
          <ScenarioControls scenarios={scenarios} selectedId={scenarioId} onSelect={setScenarioId} mode={visionMode} onModeChange={setVisionMode} disabled={isRunning} />
          {apiError && <div className="ow-api-error is-compact"><AlertTriangle /><span><strong>Backend offline</strong><small>{apiError}</small></span><button type="button" onClick={retryCurrentWorkflow} disabled={actionPending}><RefreshCw /> Retry</button></div>}
          <footer><span><Sparkles /> First-instance execution</span><Button size="icon" aria-label="Start task" onClick={runObjective} disabled={isRunning || !objective.trim()}>{isRunning ? <Activity className="spin-soft" /> : <ArrowUp />}</Button></footer>
        </section>
        <div className="ow-task-suggestions"><button type="button" onClick={() => setObjective('Fulfill ORD-1042 and load truck-17 at dock 04')}>Fulfill an outbound order</button><button type="button" onClick={() => setObjective('Inspect aisle D, count available inventory, and report exceptions')}>Run an inventory sweep</button><button type="button" onClick={() => setObjective('Reset dock 04 and validate the safety zone')}>Reset a loading dock</button></div>
      </section>
    </div>}

    {activeView === 'orchestrator' && taskMode === 'session' && <div className="ow-detail-scroll ow-session-page">
      <header className="ow-page-title ow-session-title">
        <div className="ow-title-with-back">{sessionReturn && <button className="ow-back-button" type="button" aria-label="Go back" onClick={backFromSession}><ArrowLeft /></button>}<div><h1>{sessionTitle}</h1><p>Task session · Warehouse 01 · {workflow ? displayToken(workflow.status) : 'Ready to run'}</p></div></div>
        <button type="button" aria-label="Session actions"><MoreHorizontal /></button>
      </header>

      <VisionGatePanel vision={vision} scenarios={scenarios} scenarioId={scenarioId} onScenarioChange={setScenarioId} mode={visionMode} onModeChange={setVisionMode} workflow={workflow} busy={actionPending} apiError={apiError} onRun={runObjective} onReview={reviewVision} onRetry={retryCurrentWorkflow} />

      <RoutingPanel candidates={routingCandidates} />

      {workflow && workflow.events.length > 0 && <section className="ow-evidence-log"><header><div><span>Evidence and activity</span><strong>{workflow.id}</strong></div><small>{workflow.events.length} backend events</small></header><div>{workflow.events.slice(-4).reverse().map((event) => <article key={`${event.sequence}-${event.type}`}><span>{event.sequence}</span><div><strong>{event.message || displayToken(event.type)}</strong><small>{displayToken(event.type)}{event.occurredAt ? ` · ${new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</small></div></article>)}</div></section>}

      <section className="ow-live-card ow-machine-work-card">
        <header><span><i /> {machineIsWorking ? 'Machine working' : selectedStatus === 'success' ? 'Task validated' : 'Machine ready'}</span><span>{selectedMachine.name} · CAM-02</span></header>
        <div className="ow-working-status">
          <span className={`ow-working-pulse ${machineIsWorking ? 'is-live' : 'is-complete'}`}>{machineIsWorking ? <Activity /> : <Check />}</span>
          <div><small>Current action</small><strong>{workflow?.currentAction ?? (selectedStatus === 'success' ? 'Vision proof accepted — ready for handoff' : selectedProcess.detail)}</strong><span>{workflow?.currentWorkerName ?? selectedProcess.title} · {selectedMachine.name} · updated from backend</span></div>
          <span className={`ow-binary is-${selectedStatus === 'success' ? 'success' : 'pending'}`}>{selectedStatus === 'success' ? <Check /> : <Radio />} {selectedStatus === 'success' ? 'Success' : 'Validating'}</span>
        </div>
        <div className="ow-camera"><MachineIcon machineId={selectedMachine.id} /><span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" /><div><span>{machineIsWorking ? 'Live tracking' : selectedStatus === 'success' ? 'Proof captured' : 'Waiting for release'}</span><strong>{selectedMachine.name}</strong></div></div>
        <footer><div><span>Task action</span><strong>{selectedProcess.detail}</strong></div><div className="ow-frame-proof"><span>Vision gate</span><strong>{visionStateLabel(vision.state)}</strong></div></footer>
      </section>

      <section className="ow-machine-activity">
        <header><div className="ow-machine-avatar"><MachineIcon machineId={selectedMachine.id} /></div><div><span>{selectedProcess.title}</span><h2>{selectedMachine.name}</h2><p>{selectedMachine.model} · {selectedMachine.location}</p></div><button type="button" onClick={() => openMachineDetail(selectedMachine.id, 'orchestrator')}>Machine details</button></header>
        <div className="ow-activity-steps"><span className="is-complete"><Check /> Input recognized</span><i /><span className={machineIsWorking ? 'is-live' : 'is-complete'}>{machineIsWorking ? <Activity /> : <Check />} Action executed</span><i /><span className={selectedStatus === 'success' ? 'is-complete' : ''}>{selectedStatus === 'success' ? <Check /> : <Clock3 />} Vision validated</span></div>
      </section>

      <MachineSessions machine={selectedMachine} onOpen={(session) => openSession(session.title, selectedMachine.id)} />

      <section className="ow-session-composer">
        <Textarea aria-label="Follow up on this task" placeholder="Give Orbis a follow-up instruction…" value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
        <footer><span>{selectedMachine.name} and the workflow will receive this update.</span><Button size="icon" aria-label="Send follow-up" onClick={sendFollowUp} disabled={!followUp.trim()}><ArrowUp /></Button></footer>
      </section>
    </div>}

    {activeView === 'connections' && connectionScreen === 'list' && <div className="ow-detail-scroll ow-connections-page">
      <header className="ow-page-title"><div><h1>Connections</h1><p>Select a machine to see its complete details and robot-specific task sessions.</p></div><Button variant="outline" onClick={() => setShowScanner(true)}><QrCode /> Scan QR</Button></header>
      <section className="ow-connection-summary"><div><strong>3</strong><span>Connected machines</span></div><div><strong>3</strong><span>Live vision streams</span></div><div><strong>99.8%</strong><span>Connection uptime</span></div></section>
      <section className="ow-machine-grid">
        {(Object.values(machines) as Machine[]).map((machine) => {
          return <button className="ow-machine-card" type="button" key={machine.id} onClick={() => openMachineDetail(machine.id)}><header><span><MachineIcon machineId={machine.id} /> {machine.name}</span><i>Online</i></header><MachineThreePreview machineId={machine.id} /><footer><div><strong>{machine.model}</strong><small>{machine.location} · {machine.protocol}</small></div><span>{machine.sessions.length} sessions</span></footer></button>;
        })}
        <button className="ow-machine-card ow-add-machine" type="button" onClick={() => setShowScanner(true)}><span><Plus /></span><strong>Connect a machine</strong><small>Scan its Orbis QR or enter an endpoint</small></button>
      </section>
      {showScanner && <section className="ow-scanner-card"><button className="ow-scanner-close" type="button" aria-label="Close scanner" onClick={() => setShowScanner(false)}><X /></button><div className="ow-qr-frame"><ScanLine />{Array.from({ length: 49 }, (_, index) => <i className={(index * 7 + index % 5) % 3 === 0 ? 'is-filled' : ''} key={index} />)}</div><div><span>Connection setup</span><h2>Scan the machine’s Orbis QR</h2><p>The machine shares its endpoint, capabilities, vision stream, and safety contract. You approve it before it joins a task.</p><Button onClick={() => setShowScanner(false)}>Use demo machine</Button></div></section>}
    </div>}

    {activeView === 'connections' && connectionScreen === 'detail' && <div className="ow-detail-scroll ow-machine-detail-page">
      <header className="ow-page-title ow-session-title"><div className="ow-title-with-back"><button className="ow-back-button" type="button" aria-label="Go back" onClick={backFromMachineDetail}><ArrowLeft /></button><div><h1>{selectedMachine.name}</h1><p>Connected machine · {selectedMachine.location}</p></div></div><Button onClick={() => { setObjective(`Create a coordinated task for ${selectedMachine.name}`); openSession(`Work with ${selectedMachine.name}`, selectedMachine.id, 'connection-detail'); }}>New task</Button></header>
      <section className="ow-machine-detail-hero">
        <MachineThreePreview machineId={selectedMachine.id} className="is-large" />
        <div><span className="ow-live-status"><i /> Connected</span><h2>{selectedMachine.model}</h2><p>This digital twin stays synchronized with the physical machine, its vision stream, task state, and handoff contract.</p><dl><div><dt>Connection</dt><dd>{selectedMachine.protocol}</dd></div><div><dt>Vision</dt><dd>Live · 30 fps</dd></div><div><dt>Daily validation</dt><dd className="is-success">Success</dd></div></dl></div>
      </section>
      <MachineSessions machine={selectedMachine} onOpen={(session) => openSession(session.title, selectedMachine.id, 'connection-detail')} />
    </div>}

    {activeView === 'tasks' && <div className="ow-detail-scroll ow-tasks-page">
      <header className="ow-page-title"><div><h1>Tasks</h1><p>Every machine task is grouped by availability, execution, issue, or binary success.</p></div><Button variant="outline" onClick={startNewTask}><Plus /> New task</Button></header>
      <section className="ow-task-summary"><div><strong>8</strong><span>Total today</span></div><div><strong>2</strong><span>Running</span></div><div><strong>1</strong><span>Needs attention</span></div><div><strong>96%</strong><span>Validated success</span></div></section>
      <section className="ow-task-board">{taskGroups.map((group) => <div className={`ow-task-group is-${group.state}`} key={group.title}><header><span><i /> {group.title}</span><small>{group.items.length}</small></header>{group.items.map((task, index) => { const machineId: MachineId = index % 2 ? 'amr' : 'packing'; return <button type="button" key={task} onClick={() => openSession(task, machineId, 'tasks')}><span>TSK-{1042 + index}</span><strong>{task}</strong><small>{group.state === 'success' ? 'Validated by vision' : group.state === 'issue' ? 'Safety contract paused' : 'Warehouse 01'}</small><footer><MachineIcon machineId={machineId} /> {machines[machineId].name}</footer></button>; })}</div>)}</section>
    </div>}

    {activeView === 'space' && <div className="ow-detail-scroll ow-space-page">
      <header className="ow-page-title"><div><h1>Space</h1><p>A shared scene of the environment, machines, safety zones, and live handoff paths.</p></div><Button variant="outline"><ScanLine /> Rescan space</Button></header>
      <section className="ow-space-card"><header><div><span><i /> Live environment</span><strong>Warehouse 01 · North floor</strong></div><span>3 machines · 2 waiting points</span></header><div className="ow-space-map"><span className="ow-zone-label is-packing">PACKING A</span><span className="ow-zone-label is-lane">LANE C2</span><span className="ow-zone-label is-dock">DOCK 04</span><div className="ow-space-route" />{(Object.values(machines) as Machine[]).map((machine) => <button className={`ow-space-machine is-${machine.id} ${selectedMachineId === machine.id ? 'is-selected' : ''}`} type="button" key={machine.id} onClick={() => openMachineDetail(machine.id, 'space')}><span><MachineIcon machineId={machine.id} /></span><strong>{machine.name}</strong><small>{machine.health}</small></button>)}<span className="ow-space-wait is-one"><i /> Wait for custody</span><span className="ow-space-wait is-two"><i /> Wait for package</span></div></section>
      <section className="ow-environment-stats"><article><Wifi /><div><strong>12 ms</strong><span>Agent latency</span></div></article><article><ShieldCheck /><div><strong>Clear</strong><span>Safety zones</span></div></article><article><Boxes /><div><strong>86%</strong><span>Space utilization</span></div></article></section>
    </div>}
  </section>;

  const workflowContent = activeView === 'orchestrator' && taskMode === 'session' ? <aside className="ow-workflow-pane">
    <header><div><h2>Workflow</h2><p>{workflow?.id ?? 'Not started'} · {sessionTitle}</p></div><div className="ow-pane-actions"><span className={`ow-live-status ${apiStatus === 'offline' ? 'is-offline' : ''}`}><i /> {apiStatus === 'offline' ? 'Offline' : 'Backend live'}</span><button type="button" aria-label="Close workflow panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <div className="ow-workflow-summary"><span>Vision {visionStateLabel(vision.state).toLowerCase()}</span><span>{workflow?.steps.length ?? 3} physical steps</span><span>{workflow ? `${workflow.progress}%` : 'Not started'}</span></div>
    <FlowGraph statuses={statuses} selectedProcessId={selectedProcessId} onSelect={selectProcess} />
    <footer className="ow-workflow-footer"><div><span>Selected process</span><strong>{selectedProcess.title}</strong><p>{selectedProcess.detail}</p></div><dl><div><dt>Machine</dt><dd>{processMachine.name}</dd></div><div><dt>Live status</dt><dd>{machineIsWorking ? 'Working' : selectedStatus === 'success' ? 'Success' : 'Waiting'}</dd></div><div><dt>Vision gate</dt><dd className={vision.state === 'clear' ? 'is-success' : ''}>{visionStateLabel(vision.state)}</dd></div></dl></footer>
  </aside> : activeView === 'orchestrator' ? <aside className="ow-workflow-pane ow-empty-workflow"><header><div><h2>Workflow</h2><p>Created when your task starts</p></div><button type="button" aria-label="Close workflow panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></header><div><Waypoints /><h3>No workflow yet</h3><p>Start the task and Orbis will place every machine, parallel action, wait point, and handoff here.</p></div></aside> : <aside className="ow-workflow-pane ow-context-pane">
    <header><div><h2>{activeView === 'connections' ? 'Machine sessions' : activeView === 'tasks' ? 'Status and workflow' : 'Environment status'}</h2><p>{selectedMachine.name} · {selectedMachine.location}</p></div><div className="ow-pane-actions"><span className="ow-live-status"><i /> Live</span><button type="button" aria-label="Close status panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <section className="ow-context-machine"><div className="ow-machine-avatar"><MachineIcon machineId={selectedMachine.id} /></div><div><strong>{selectedMachine.name}</strong><span>{selectedMachine.model}</span></div><button type="button" onClick={() => openMachineDetail(selectedMachine.id)}>Open</button></section>
    <section className="ow-context-status"><header><span>Current coordination</span><strong>WF-1042</strong></header><div className="ow-mini-flow"><article className="is-success"><Check /><span><strong>Validate input</strong><small>Packing Arm 01</small></span></article><i /><article className="is-running"><Activity /><span><strong>Active session</strong><small>{selectedMachine.name}</small></span></article><i /><article><Clock3 /><span><strong>Next handoff</strong><small>Wait for agent proof</small></span></article></div></section>
    <section className="ow-context-sessions"><header><span>Robot sessions</span><button type="button" onClick={() => openMachineDetail(selectedMachine.id)}>View all</button></header>{selectedMachine.sessions.map((session) => <button type="button" key={session.id} onClick={() => openSession(session.title, selectedMachine.id, 'connection-detail')}><span className={`ow-session-result ${session.success === true ? 'is-success' : session.success === false ? 'is-failed' : 'is-running'}`}>{session.success === true ? <Check /> : session.success === false ? '×' : <Activity />}</span><span><strong>{session.title}</strong><small>{session.id} · {session.time}</small></span></button>)}</section>
    <footer className="ow-context-footer"><dl><div><dt>Connection</dt><dd>{selectedMachine.protocol}</dd></div><div><dt>Daily validation</dt><dd className="is-success">Success</dd></div><div><dt>Vision stream</dt><dd>Live · 30 fps</dd></div></dl></footer>
  </aside>;

  return (
    <main className={`ow-app ${sidebarOpen ? '' : 'is-sidebar-closed'}`}>
      {sidebarOpen && <aside className="ow-sidebar">
        <header className="ow-sidebar-brand"><Link href="/" aria-label="Orbis home"><OrbisMark /></Link><strong>Orbis</strong><button type="button" aria-label="Close navigation panel" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></header>
        <Button className="ow-new-button" variant="outline" onClick={startNewTask}><MessageSquarePlus /> New task</Button>
        <nav className="ow-main-nav" aria-label="Workspace navigation">
          <button className={activeView === 'orchestrator' ? 'is-active' : ''} onClick={() => navigate('orchestrator')} type="button"><Waypoints /><span>Orchestrator</span></button>
          <button className={activeView === 'connections' ? 'is-active' : ''} onClick={() => navigate('connections')} type="button"><Cable /><span>Connections</span><small>3</small></button>
          <button className={activeView === 'tasks' ? 'is-active' : ''} onClick={() => navigate('tasks')} type="button"><ListChecks /><span>Tasks</span><small>8</small></button>
          <button className={activeView === 'space' ? 'is-active' : ''} onClick={() => navigate('space')} type="button"><Map /><span>Space</span></button>
        </nav>
        <section className="ow-projects"><header><span>Projects</span><button type="button" aria-label="Add project">+</button></header><button className="is-active" type="button" onClick={() => navigate('orchestrator')}><span className="ow-project-mark"><Warehouse /></span><span><strong>Warehouse 01</strong><small>Northstar Logistics</small></span><MoreHorizontal /></button></section>
        <section className="ow-recents"><header><span>Recent tasks</span></header>{recentTasks.map((task) => { const Icon = task.icon; return <button type="button" key={task.title} onClick={() => openSession(task.title, task.title.includes('Dock') ? 'loading' : 'packing')}><Icon /><span><strong>{task.title}</strong><small>{task.meta}</small></span></button>; })}</section>
        <footer className="ow-sidebar-footer"><button type="button"><CircleHelp /><span>Help</span></button><button type="button"><Settings /><span>Settings</span></button><span className="ow-avatar">{shortName.slice(0,1).toUpperCase()}</span></footer>
      </aside>}

      <section className="ow-shell">
        <header className="ow-topbar">
          <div><strong>{topbarTitle}</strong>{taskMode === 'session' && activeView === 'orchestrator' && <span className="ow-topbar-session"><i /> {isRunning ? 'Working' : 'Active'}</span>}</div>
          <div>{demo && <span className="ow-demo">Demo</span>}<span className={`ow-online ${apiStatus === 'offline' ? 'is-offline' : apiStatus === 'checking' ? 'is-checking' : ''}`}><i /> {apiStatus === 'offline' ? 'Backend offline' : apiStatus === 'checking' ? 'Checking backend' : 'All systems operational'}</span><span className="ow-panel-controls"><button type="button" aria-label={sidebarOpen ? 'Close navigation panel' : 'Open navigation panel'} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button><button type="button" aria-label={workflowOpen ? 'Close workflow panel' : 'Open workflow panel'} onClick={() => setWorkflowOpen((value) => !value)}>{workflowOpen ? <PanelRightClose /> : <PanelRightOpen />}</button></span><button type="button" aria-label="Search"><Search /></button></div>
        </header>
        <ResizablePanelGroup key={workflowOpen ? 'split' : 'single'} orientation="horizontal" className="ow-panel-group">
          <ResizablePanel defaultSize={workflowOpen ? 62 : 100} minSize={workflowOpen ? 43 : 100}>{detailContent}</ResizablePanel>
          {workflowOpen && <><ResizableHandle withHandle className="ow-resize-handle" /><ResizablePanel defaultSize={38} minSize={28}>{workflowContent}</ResizablePanel></>}
        </ResizablePanelGroup>
      </section>
    </main>
  );
}
