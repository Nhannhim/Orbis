'use client';

import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUp, Bot, Boxes, Cable, Check, CheckCircle2, CircleHelp,
  Clock3, ListChecks, Map, MessageSquarePlus, MoreHorizontal, Package, PanelLeftClose,
  PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, QrCode, Radio, ScanLine,
  Search, Settings, ShieldCheck, Sparkles, Truck, Warehouse, Waypoints, Wifi, X,
} from 'lucide-react';
import { MachineThreePreview } from '@/components/machine-three-preview';
import { OrbisMark } from '@/components/orbis-mark';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Textarea } from '@/components/ui/textarea';

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

const initialStatuses: Record<ProcessId, ProcessStatus> = {
  pack: 'running', route: 'running', truck: 'success', move: 'waiting', load: 'not_validated',
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

const liveUpdates = [
  'Reading the live vision stream',
  'Matching the package to ORD-1042',
  'Checking pose and safety boundary',
  'Validating task proof before handoff',
];

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function machineIcon(machineId: MachineId) {
  if (machineId === 'packing') return Bot;
  if (machineId === 'amr') return Truck;
  return Warehouse;
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
        const Icon = machineIcon(process.machineId);
        const status = statuses[process.id];
        return <button className={`ow-flow-node is-${status} ${selectedProcessId === process.id ? 'is-selected' : ''}`} style={{ left: `${process.x}%`, top: `${process.y}%` }} type="button" key={process.id} onClick={() => onSelect(process.id)}>
          <span className="ow-flow-node-icon"><Icon /></span>
          <span><strong>{process.title}</strong><small>{machines[process.machineId].name}</small></span>
          <i>{status === 'success' ? <CheckCircle2 /> : status === 'running' ? <Activity /> : <Clock3 />}</i>
        </button>;
      })}
      <span className="ow-wait-label is-pickup">Wait for custody</span><span className="ow-wait-label is-dock">Wait for package</span>
    </div>
  );
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
  const [statuses, setStatuses] = useState<Record<ProcessId, ProcessStatus>>(initialStatuses);
  const [isRunning, setIsRunning] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workflowOpen, setWorkflowOpen] = useState(true);

  const selectedProcess = processNodes.find((process) => process.id === selectedProcessId) ?? processNodes[0];
  const processMachine = machines[selectedProcess.machineId];
  const selectedMachine = activeView === 'orchestrator' ? processMachine : machines[selectedMachineId];
  const SelectedMachineIcon = machineIcon(selectedMachine.id);
  const selectedStatus = statuses[selectedProcess.id];
  const machineIsWorking = isRunning || selectedStatus === 'running';
  const shortName = displayName.includes('@') ? displayName.split('@')[0] : displayName.split(' ')[0];

  useEffect(() => {
    if (!machineIsWorking) return;
    const interval = window.setInterval(() => setLiveTick((value) => value + 1), 900);
    return () => window.clearInterval(interval);
  }, [machineIsWorking]);

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
    setIsRunning(true);
    setLiveTick(0);
    setRecentTasks((items) => [{ title: generatedTitle, meta: 'Warehouse 01 · Just now', icon: Warehouse }, ...items.filter((item) => item.title !== generatedTitle)].slice(0, 6));
    setStatuses({ pack: 'running', route: 'running', truck: 'running', move: 'waiting', load: 'not_validated' });
    selectProcess('pack');
    await delay(1500);
    setStatuses({ pack: 'success', route: 'success', truck: 'success', move: 'running', load: 'waiting' });
    selectProcess('move');
    await delay(1800);
    setStatuses({ pack: 'success', route: 'success', truck: 'success', move: 'success', load: 'running' });
    selectProcess('load');
    await delay(1800);
    setStatuses({ pack: 'success', route: 'success', truck: 'success', move: 'success', load: 'success' });
    setIsRunning(false);
  }

  function sendFollowUp() {
    if (!followUp.trim()) return;
    setFollowUp('');
    setLiveTick((value) => value + 1);
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
          <Textarea autoFocus aria-label="New task objective" placeholder="Ask Orbis to coordinate an outcome…" value={objective} onChange={(event) => setObjective(event.target.value)} disabled={isRunning} />
          <footer><span><Sparkles /> First-instance execution</span><Button size="icon" aria-label="Start task" onClick={runObjective} disabled={isRunning || !objective.trim()}>{isRunning ? <Activity className="spin-soft" /> : <ArrowUp />}</Button></footer>
        </section>
        <div className="ow-task-suggestions"><button type="button" onClick={() => setObjective('Fulfill ORD-1042 and load truck-17 at dock 04')}>Fulfill an outbound order</button><button type="button" onClick={() => setObjective('Inspect aisle D, count available inventory, and report exceptions')}>Run an inventory sweep</button><button type="button" onClick={() => setObjective('Reset dock 04 and validate the safety zone')}>Reset a loading dock</button></div>
      </section>
    </div>}

    {activeView === 'orchestrator' && taskMode === 'session' && <div className="ow-detail-scroll ow-session-page">
      <header className="ow-page-title ow-session-title">
        <div className="ow-title-with-back">{sessionReturn && <button className="ow-back-button" type="button" aria-label="Go back" onClick={backFromSession}><ArrowLeft /></button>}<div><h1>{sessionTitle}</h1><p>Task session · Warehouse 01 · {isRunning ? 'Running now' : 'Active'}</p></div></div>
        <button type="button" aria-label="Session actions"><MoreHorizontal /></button>
      </header>

      <section className="ow-live-card ow-machine-work-card">
        <header><span><i /> {machineIsWorking ? 'Machine working' : selectedStatus === 'success' ? 'Task validated' : 'Machine ready'}</span><span>{selectedMachine.name} · CAM-02</span></header>
        <div className="ow-working-status">
          <span className={`ow-working-pulse ${machineIsWorking ? 'is-live' : 'is-complete'}`}>{machineIsWorking ? <Activity /> : <Check />}</span>
          <div><small>Current action</small><strong>{machineIsWorking ? liveUpdates[liveTick % liveUpdates.length] : selectedStatus === 'success' ? 'Vision proof accepted — ready for handoff' : selectedProcess.detail}</strong><span>{selectedProcess.title} · {selectedMachine.name} · updated just now</span></div>
          <span className={`ow-binary is-${selectedStatus === 'success' ? 'success' : 'pending'}`}>{selectedStatus === 'success' ? <Check /> : <Radio />} {selectedStatus === 'success' ? 'Success' : 'Validating'}</span>
        </div>
        <div className="ow-camera"><SelectedMachineIcon /><span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" /><div><span>{machineIsWorking ? 'Live tracking' : 'Proof captured'}</span><strong>{selectedMachine.name}</strong></div></div>
        <footer><div><span>Task action</span><strong>{selectedProcess.detail}</strong></div><div className="ow-frame-proof"><span>Vision</span><strong>{machineIsWorking ? 'Continuous validation' : 'Binary proof stored'}</strong></div></footer>
      </section>

      <section className="ow-machine-activity">
        <header><div className="ow-machine-avatar"><SelectedMachineIcon /></div><div><span>{selectedProcess.title}</span><h2>{selectedMachine.name}</h2><p>{selectedMachine.model} · {selectedMachine.location}</p></div><button type="button" onClick={() => openMachineDetail(selectedMachine.id, 'orchestrator')}>Machine details</button></header>
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
          const Icon = machineIcon(machine.id);
          return <button className="ow-machine-card" type="button" key={machine.id} onClick={() => openMachineDetail(machine.id)}><header><span><Icon /> {machine.name}</span><i>Online</i></header><MachineThreePreview machineId={machine.id} /><footer><div><strong>{machine.model}</strong><small>{machine.location} · {machine.protocol}</small></div><span>{machine.sessions.length} sessions</span></footer></button>;
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
      <section className="ow-task-board">{taskGroups.map((group) => <div className={`ow-task-group is-${group.state}`} key={group.title}><header><span><i /> {group.title}</span><small>{group.items.length}</small></header>{group.items.map((task, index) => { const machineId: MachineId = index % 2 ? 'amr' : 'packing'; const Icon = machineIcon(machineId); return <button type="button" key={task} onClick={() => openSession(task, machineId, 'tasks')}><span>TSK-{1042 + index}</span><strong>{task}</strong><small>{group.state === 'success' ? 'Validated by vision' : group.state === 'issue' ? 'Safety contract paused' : 'Warehouse 01'}</small><footer><Icon /> {machines[machineId].name}</footer></button>; })}</div>)}</section>
    </div>}

    {activeView === 'space' && <div className="ow-detail-scroll ow-space-page">
      <header className="ow-page-title"><div><h1>Space</h1><p>A shared scene of the environment, machines, safety zones, and live handoff paths.</p></div><Button variant="outline"><ScanLine /> Rescan space</Button></header>
      <section className="ow-space-card"><header><div><span><i /> Live environment</span><strong>Warehouse 01 · North floor</strong></div><span>3 machines · 2 waiting points</span></header><div className="ow-space-map"><span className="ow-zone-label is-packing">PACKING A</span><span className="ow-zone-label is-lane">LANE C2</span><span className="ow-zone-label is-dock">DOCK 04</span><div className="ow-space-route" />{(Object.values(machines) as Machine[]).map((machine) => { const Icon = machineIcon(machine.id); return <button className={`ow-space-machine is-${machine.id} ${selectedMachineId === machine.id ? 'is-selected' : ''}`} type="button" key={machine.id} onClick={() => openMachineDetail(machine.id, 'space')}><span><Icon /></span><strong>{machine.name}</strong><small>{machine.health}</small></button>; })}<span className="ow-space-wait is-one"><i /> Wait for custody</span><span className="ow-space-wait is-two"><i /> Wait for package</span></div></section>
      <section className="ow-environment-stats"><article><Wifi /><div><strong>12 ms</strong><span>Agent latency</span></div></article><article><ShieldCheck /><div><strong>Clear</strong><span>Safety zones</span></div></article><article><Boxes /><div><strong>86%</strong><span>Space utilization</span></div></article></section>
    </div>}
  </section>;

  const workflowContent = activeView === 'orchestrator' && taskMode === 'session' ? <aside className="ow-workflow-pane">
    <header><div><h2>Workflow</h2><p>WF-1042 · {sessionTitle}</p></div><div className="ow-pane-actions"><span className="ow-live-status"><i /> Live</span><button type="button" aria-label="Close workflow panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <div className="ow-workflow-summary"><span>5 processes</span><span>3 machines</span><span>First-instance</span></div>
    <FlowGraph statuses={statuses} selectedProcessId={selectedProcessId} onSelect={selectProcess} />
    <footer className="ow-workflow-footer"><div><span>Selected process</span><strong>{selectedProcess.title}</strong><p>{selectedProcess.detail}</p></div><dl><div><dt>Machine</dt><dd>{processMachine.name}</dd></div><div><dt>Live status</dt><dd>{machineIsWorking ? 'Working' : selectedStatus === 'success' ? 'Success' : 'Waiting'}</dd></div><div><dt>Vision validation</dt><dd className={selectedStatus === 'success' ? 'is-success' : ''}>{selectedStatus === 'success' ? 'Success' : 'Pending'}</dd></div></dl></footer>
  </aside> : activeView === 'orchestrator' ? <aside className="ow-workflow-pane ow-empty-workflow"><header><div><h2>Workflow</h2><p>Created when your task starts</p></div><button type="button" aria-label="Close workflow panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></header><div><Waypoints /><h3>No workflow yet</h3><p>Start the task and Orbis will place every machine, parallel action, wait point, and handoff here.</p></div></aside> : <aside className="ow-workflow-pane ow-context-pane">
    <header><div><h2>{activeView === 'connections' ? 'Machine sessions' : activeView === 'tasks' ? 'Status and workflow' : 'Environment status'}</h2><p>{selectedMachine.name} · {selectedMachine.location}</p></div><div className="ow-pane-actions"><span className="ow-live-status"><i /> Live</span><button type="button" aria-label="Close status panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <section className="ow-context-machine"><div className="ow-machine-avatar"><SelectedMachineIcon /></div><div><strong>{selectedMachine.name}</strong><span>{selectedMachine.model}</span></div><button type="button" onClick={() => openMachineDetail(selectedMachine.id)}>Open</button></section>
    <section className="ow-context-status"><header><span>Current coordination</span><strong>WF-1042</strong></header><div className="ow-mini-flow"><article className="is-success"><Check /><span><strong>Validate input</strong><small>Packing Arm 01</small></span></article><i /><article className="is-running"><Activity /><span><strong>Active session</strong><small>{selectedMachine.name}</small></span></article><i /><article><Clock3 /><span><strong>Next handoff</strong><small>Wait for agent proof</small></span></article></div></section>
    <section className="ow-context-sessions"><header><span>Robot sessions</span><button type="button" onClick={() => openMachineDetail(selectedMachine.id)}>View all</button></header>{selectedMachine.sessions.map((session) => <button type="button" key={session.id} onClick={() => openSession(session.title, selectedMachine.id, 'connection-detail')}><span className={`ow-session-result ${session.success === true ? 'is-success' : session.success === false ? 'is-failed' : 'is-running'}`}>{session.success === true ? <Check /> : session.success === false ? '×' : <Activity />}</span><span><strong>{session.title}</strong><small>{session.id} · {session.time}</small></span></button>)}</section>
    <footer className="ow-context-footer"><dl><div><dt>Connection</dt><dd>{selectedMachine.protocol}</dd></div><div><dt>Daily validation</dt><dd className="is-success">Success</dd></div><div><dt>Vision stream</dt><dd>Live · 30 fps</dd></div></dl></footer>
  </aside>;

  return (
    <main className={`ow-app ${sidebarOpen ? '' : 'is-sidebar-closed'}`}>
      {sidebarOpen && <aside className="ow-sidebar">
        <header className="ow-sidebar-brand"><a href="/" aria-label="Orbis home"><OrbisMark /></a><strong>Orbis</strong><button type="button" aria-label="Close navigation panel" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></header>
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
          <div>{demo && <span className="ow-demo">Demo</span>}<span className="ow-online"><i /> All systems operational</span><span className="ow-panel-controls"><button type="button" aria-label={sidebarOpen ? 'Close navigation panel' : 'Open navigation panel'} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button><button type="button" aria-label={workflowOpen ? 'Close workflow panel' : 'Open workflow panel'} onClick={() => setWorkflowOpen((value) => !value)}>{workflowOpen ? <PanelRightClose /> : <PanelRightOpen />}</button></span><button type="button" aria-label="Search"><Search /></button></div>
        </header>
        <ResizablePanelGroup key={workflowOpen ? 'split' : 'single'} orientation="horizontal" className="ow-panel-group">
          <ResizablePanel defaultSize={workflowOpen ? 62 : 100} minSize={workflowOpen ? 43 : 100}>{detailContent}</ResizablePanel>
          {workflowOpen && <><ResizableHandle withHandle className="ow-resize-handle" /><ResizablePanel defaultSize={38} minSize={28}>{workflowContent}</ResizablePanel></>}
        </ResizablePanelGroup>
      </section>
    </main>
  );
}
