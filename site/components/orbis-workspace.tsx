'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Box,
  Cable,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Command,
  Eye,
  Filter,
  ListChecks,
  Map,
  Maximize2,
  Play,
  Plus,
  QrCode,
  Radio,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
  Waypoints,
  Wifi,
  Zap,
} from 'lucide-react';
import { OrbisMark } from '@/components/orbis-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type RunState = 'ready' | 'running' | 'attention' | 'completed';
type AgentState = 'ready' | 'executing' | 'waiting' | 'verifying' | 'completed' | 'issue';
type ViewId = 'orchestrator' | 'connections' | 'machines' | 'tasks' | 'space';

type Agent = {
  id: 'packing' | 'amr' | 'loading';
  name: string;
  model: string;
  action: string;
  location: string;
  state: AgentState;
  progress: number;
  confidence: number;
};

type EventItem = {
  type: string;
  message: string;
  time: string;
  tone?: 'good' | 'warn';
};

const initialAgents: Agent[] = [
  { id: 'packing', name: 'Packing Arm 01', model: 'UR-16e · Vision', action: 'Sealing and verifying ORD-1042', location: 'Packing cell A', state: 'executing', progress: 72, confidence: 96 },
  { id: 'amr', name: 'Mobile Robot 01', model: 'AMR · LiDAR', action: 'Moving to pickup wait point', location: 'Lane C2', state: 'executing', progress: 54, confidence: 99 },
  { id: 'loading', name: 'Loading Station 01', model: 'Dock eye · PLC', action: 'Validating truck-17 at dock 04', location: 'Dock 04', state: 'verifying', progress: 88, confidence: 98 },
];

const initialEvents: EventItem[] = [
  { type: 'AGENT.DISPATCHED', message: 'Three agents started in parallel', time: '11:32:18' },
  { type: 'VEHICLE.DETECTED', message: 'truck-17 verified at dock 04', time: '11:32:20', tone: 'good' },
  { type: 'WAIT_POINT.RESERVED', message: 'AMR-01 reserved packing handoff', time: '11:32:22' },
];

const taskColumns = [
  { id: 'available', name: 'Available', tone: 'neutral', tasks: [
    { id: 'TSK-248', title: 'Cycle count aisle D', meta: 'Unassigned · 18 min', agent: 'packing' as const },
    { id: 'TSK-251', title: 'Stage empty pallet', meta: 'Dock 02 · 6 min', agent: 'amr' as const },
  ] },
  { id: 'running', name: 'Running', tone: 'live', tasks: [
    { id: 'TSK-242', title: 'Seal and verify ORD-1042', meta: 'Packing Arm 01 · 72%', agent: 'packing' as const },
    { id: 'TSK-243', title: 'Move package to dock 04', meta: 'Mobile Robot 01 · 54%', agent: 'amr' as const },
    { id: 'TSK-244', title: 'Validate outbound vehicle', meta: 'Loading Station 01 · 88%', agent: 'loading' as const },
  ] },
  { id: 'issue', name: 'Running into issue', tone: 'warn', tasks: [
    { id: 'TSK-239', title: 'Clear lane B obstruction', meta: 'Vision confidence · 63%', agent: 'amr' as const },
  ] },
  { id: 'achieved', name: 'Achieved', tone: 'good', tasks: [
    { id: 'TSK-237', title: 'Unload inbound pallet 18', meta: 'Verified · 99%', agent: 'loading' as const },
    { id: 'TSK-235', title: 'Replenish packing cell A', meta: 'Verified · 98%', agent: 'packing' as const },
  ] },
];

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function nowTime() {
  return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function agentIcon(id: Agent['id']) {
  if (id === 'packing') return Bot;
  if (id === 'amr') return Truck;
  return Warehouse;
}

function stateLabel(state: AgentState) {
  if (state === 'executing') return 'Working';
  if (state === 'verifying') return 'Validating';
  if (state === 'completed') return 'Achieved';
  if (state === 'issue') return 'Needs attention';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function OrbisWorkspace({ displayName, demo = false }: { displayName: string; demo?: boolean }) {
  const [activeView, setActiveView] = useState<ViewId>('orchestrator');
  const [runState, setRunState] = useState<RunState>('ready');
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgentId, setSelectedAgentId] = useState<Agent['id']>('packing');
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [objective, setObjective] = useState('Fulfill ORD-1042 and load truck-17 at dock 04');
  const [faultEnabled, setFaultEnabled] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState('TSK-242');

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const shortName = displayName.includes('@') ? displayName.split('@')[0] : displayName.split(' ')[0];

  const updateAgent = (id: Agent['id'], patch: Partial<Agent>) => {
    setAgents((current) => current.map((agent) => agent.id === id ? { ...agent, ...patch } : agent));
  };

  const addEvent = (type: string, message: string, tone?: EventItem['tone']) => {
    setEvents((current) => [{ type, message, time: nowTime(), tone }, ...current].slice(0, 6));
  };

  async function runObjective() {
    if (runState === 'running') return;
    setRunState('running');
    setEvents([{ type: 'WORKFLOW.CREATED', message: objective, time: nowTime() }]);
    setAgents(initialAgents.map((agent) => ({ ...agent, state: 'executing', progress: agent.id === 'packing' ? 12 : 8 })));
    setSelectedAgentId('packing');
    addEvent('AGENTS.DISPATCHED', 'Packing, transport, and loading agents started together');
    await delay(850);

    updateAgent('packing', { state: 'verifying', progress: 86, confidence: 97 });
    updateAgent('amr', { state: 'waiting', progress: 100, action: 'At pickup wait point' });
    updateAgent('loading', { state: 'waiting', progress: 100, action: 'Truck verified · awaiting package' });
    addEvent('WAIT_POINT.REACHED', 'AMR-01 is ready for custody transfer');
    await delay(850);

    updateAgent('packing', { state: 'completed', progress: 100, confidence: 99, action: 'Package sealed and verified' });
    updateAgent('amr', { state: 'executing', progress: 42, action: 'Transporting package to dock 04' });
    setSelectedAgentId('amr');
    addEvent('HANDOFF.ACCEPTED', 'AMR-01 accepted package custody', 'good');
    await delay(900);

    updateAgent('amr', { state: 'completed', progress: 100, confidence: 98, action: 'Package staged at dock 04' });
    updateAgent('loading', { state: 'executing', progress: 48, action: 'Loading package into truck-17' });
    setSelectedAgentId('loading');
    addEvent('HANDOFF.ACCEPTED', 'Loading Station 01 accepted package custody', 'good');
    await delay(950);

    if (faultEnabled) {
      updateAgent('loading', { state: 'issue', progress: 82, confidence: 41, action: 'Placement could not be proven' });
      setRunState('attention');
      addEvent('VALIDATION.FAILED', 'Vehicle placement confidence below policy', 'warn');
      return;
    }

    updateAgent('loading', { state: 'completed', progress: 100, confidence: 98, action: 'Package secured in truck-17' });
    setRunState('completed');
    addEvent('WORKFLOW.ACHIEVED', 'ORD-1042 is ready for departure', 'good');
  }

  return (
    <main className="orbis-app dark">
      <aside className="orbis-rail" aria-label="Product navigation">
        <a href="/" className="orbis-rail-logo" aria-label="Back to Orbis home"><OrbisMark inverse /></a>
        <nav>
          <button className={`orbis-nav-button ${activeView === 'orchestrator' ? 'is-active' : ''}`} type="button" aria-label="Orchestrator" data-label="Orchestrator" onClick={() => setActiveView('orchestrator')}><Waypoints /></button>
          <button className={`orbis-nav-button ${activeView === 'connections' ? 'is-active' : ''}`} type="button" aria-label="Connections" data-label="Connections" onClick={() => setActiveView('connections')}><Cable /></button>
          <button className={`orbis-nav-button ${activeView === 'machines' ? 'is-active' : ''}`} type="button" aria-label="Machines" data-label="Machines" onClick={() => setActiveView('machines')}><Bot /></button>
          <button className={`orbis-nav-button ${activeView === 'tasks' ? 'is-active' : ''}`} type="button" aria-label="Tasks" data-label="Tasks" onClick={() => setActiveView('tasks')}><ListChecks /></button>
          <button className={`orbis-nav-button ${activeView === 'space' ? 'is-active' : ''}`} type="button" aria-label="Space" data-label="Space" onClick={() => setActiveView('space')}><Map /></button>
        </nav>
        <div className="orbis-rail-bottom">
          <button className="orbis-nav-button" type="button" aria-label="Help" data-label="Help"><CircleHelp /></button>
          <button className="orbis-nav-button" type="button" aria-label="Settings" data-label="Settings"><Settings /></button>
          <span className="orbis-user-avatar">{shortName.slice(0, 1).toUpperCase()}</span>
        </div>
      </aside>

      <section className="orbis-detail-panel">
        <header className="orbis-topbar">
          <div className="orbis-breadcrumb">
            <a href="/" aria-label="Back to marketing site"><ArrowLeft /></a>
            <span>Northstar Logistics</span><i>/</i><strong>Warehouse 01</strong><ChevronDown />
          </div>
          <div className="orbis-topbar-tools">
            {demo && <span className="orbis-demo-badge">Demo</span>}
            <button className="orbis-search" type="button"><Search /> Search <kbd><Command /> K</kbd></button>
            <span className="orbis-online"><i /> All systems online</span>
          </div>
        </header>

        <div className="orbis-page">
          {activeView === 'orchestrator' && <>
            <div className="orbis-page-heading">
              <div><p>Orchestrator</p><h1>Direct the physical world</h1><span>Agents execute together, wait safely, then transfer custody.</span></div>
              <Button variant="outline" size="lg"><Zap /> New workflow</Button>
            </div>
            <section className="orbis-command-card">
              <span className="orbis-command-icon"><Radio /></span>
              <div><label htmlFor="orbis-objective">Human objective</label><Input id="orbis-objective" value={objective} onChange={(event) => setObjective(event.target.value)} disabled={runState === 'running'} /></div>
              <Button size="lg" onClick={runObjective} disabled={runState === 'running'}>{runState === 'running' ? <Activity className="spin-soft" /> : <Play />}{runState === 'running' ? 'Orchestrating' : runState === 'attention' ? 'Run recovery' : 'Run objective'}</Button>
            </section>
            <section className="orbis-parallel-card">
              <div className="orbis-section-heading"><div><span>WF-1042 · First instance</span><h2>Parallel execution plan</h2></div><span className={`orbis-run-pill is-${runState}`}><i /> {runState}</span></div>
              <div className="orbis-parallel-note"><Waypoints /><span><strong>Three agents dispatched immediately</strong>Independent preparation runs at once. Each agent pauses only at its required handoff.</span></div>
              <div className="orbis-agent-grid">
                {agents.map((agent) => { const Icon = agentIcon(agent.id); return <button className={`orbis-agent-card is-${agent.state} ${agent.id === selectedAgentId ? 'is-selected' : ''}`} type="button" key={agent.id} onClick={() => setSelectedAgentId(agent.id)}><span className="orbis-agent-icon"><Icon /></span><span className="orbis-agent-copy"><small>{agent.model}</small><strong>{agent.name}</strong><em>{agent.action}</em></span><span className="orbis-agent-state"><i />{stateLabel(agent.state)}</span><span className="orbis-progress"><i style={{ width: `${agent.progress}%` }} /></span><span className="orbis-agent-metric">{agent.progress}%</span></button>; })}
              </div>
              <div className="orbis-handoff-row"><div><span className="is-complete"><Check /></span><strong>Pack + validate</strong><small>Packing Arm 01</small></div><i /><div><span className="is-current">02</span><strong>Custody handoff</strong><small>AMR wait point</small></div><i /><div><span>03</span><strong>Load + prove</strong><small>Dock 04</small></div></div>
            </section>
            <section className="orbis-activity-card"><div className="orbis-section-heading"><div><span>Activity log</span><h2>Coordination activity</h2></div><ShieldCheck /></div><ol>{events.map((event, index) => <li key={`${event.time}-${event.type}-${index}`}><i className={event.tone ? `is-${event.tone}` : ''} /><time>{event.time}</time><strong>{event.type}</strong><span>{event.message}</span></li>)}</ol></section>
          </>}

          {activeView === 'connections' && <>
            <div className="orbis-page-heading">
              <div><p>Connections</p><h1>Connect every machine</h1><span>Discover physical agents, pair securely, and publish capabilities.</span></div>
              <Button size="lg" onClick={() => setQrOpen((current) => !current)}><QrCode /> {qrOpen ? 'Close scanner' : 'Connect machine'}</Button>
            </div>
            {qrOpen && <section className="orbis-qr-card">
              <div><span className="orbis-qr-visual">{Array.from({ length: 81 }, (_, index) => <i className={(index % 4 === 0 || index % 7 === 0 || [1,2,9,10,70,71,79,80].includes(index)) ? 'is-dark' : ''} key={index} />)}</span></div>
              <div><span>Pairing mode · 02:00</span><h2>Scan from the Orbis edge agent</h2><p>Open Orbis Connect on the machine, scan this code, then approve the capabilities it exposes.</p><ol><li><Check /> Encrypted local handshake</li><li><Check /> Vision and sensor permission review</li><li><Check /> Capability contract published</li></ol></div>
            </section>}
            <section className="orbis-toolbar"><div><Search /><Input aria-label="Search connected machines" placeholder="Search machines, capabilities, or zones" /></div><Button variant="outline"><Filter /> Filter</Button></section>
            <section className="orbis-connection-grid">
              {agents.map((agent) => { const Icon = agentIcon(agent.id); return <article className={agent.id === selectedAgentId ? 'is-selected' : ''} key={agent.id}>
                <button type="button" onClick={() => { setSelectedAgentId(agent.id); setActiveView('machines'); }}><span className="orbis-connection-icon"><Icon /></span><span className="orbis-connection-state"><i /> Connected</span><h2>{agent.name}</h2><p>{agent.model}</p></button>
                <dl><div><dt>Location</dt><dd>{agent.location}</dd></div><div><dt>Latency</dt><dd>{agent.id === 'amr' ? '18 ms' : '12 ms'}</dd></div><div><dt>Capabilities</dt><dd>{agent.id === 'packing' ? '4' : agent.id === 'amr' ? '6' : '3'}</dd></div></dl>
                <footer><span><Eye /> Vision online</span><button type="button" aria-label={`More options for ${agent.name}`}>•••</button></footer>
              </article>; })}
              <button className="orbis-add-machine" type="button" onClick={() => setQrOpen(true)}><span><Plus /></span><strong>Add a physical agent</strong><small>QR, LAN discovery, or provisioning key</small></button>
            </section>
          </>}

          {activeView === 'machines' && <>
            <div className="orbis-page-heading">
              <div><p>Machine detail · 2.1</p><h1>{selectedAgent.name}</h1><span>{selectedAgent.model} · {selectedAgent.location}</span></div>
              <span className={`orbis-machine-health is-${selectedAgent.state}`}><i /> {stateLabel(selectedAgent.state)}</span>
            </div>
            <nav className="orbis-machine-tabs" aria-label="Connected machines">{agents.map((agent) => { const Icon = agentIcon(agent.id); return <button className={agent.id === selectedAgentId ? 'is-active' : ''} type="button" key={agent.id} onClick={() => setSelectedAgentId(agent.id)}><Icon /><span><strong>{agent.name}</strong><small>{agent.location}</small></span></button>; })}</nav>
            <section className="orbis-machine-live">
              <div className="orbis-machine-camera">
                <header><span><i /> Live · CAM-02</span><div><button type="button" aria-label="Pause live camera"><Activity /></button><button type="button" aria-label="Expand live camera"><Maximize2 /></button></div></header>
                <div className="orbis-camera-surface is-large"><span className="scan-corner scan-corner--one" /><span className="scan-corner scan-corner--two" /><ScanLine className="orbis-scan-line" />{selectedAgent.id === 'packing' ? <Bot /> : selectedAgent.id === 'amr' ? <Truck /> : <Warehouse />}<div><i /> Object lock <strong>{selectedAgent.name}</strong></div></div>
              </div>
              <aside><span>Current operation</span><h2>{selectedAgent.action}</h2><p>Orbis validates motion, object state, and environmental safety continuously.</p><div className="orbis-machine-progress"><span><i style={{ width: `${selectedAgent.progress}%` }} /></span><strong>{selectedAgent.progress}%</strong></div><dl><div><dt>Task</dt><dd>ORD-1042</dd></div><div><dt>Confidence</dt><dd>{selectedAgent.confidence}%</dd></div><div><dt>Custody</dt><dd>{selectedAgent.name}</dd></div></dl></aside>
            </section>
            <section className="orbis-telemetry-grid"><article><Camera /><span><small>Vision stream</small><strong>30 FPS · 1080p</strong></span><i>Healthy</i></article><article><Activity /><span><small>Edge inference</small><strong>12 ms latency</strong></span><i>Healthy</i></article><article><ShieldCheck /><span><small>Safety envelope</small><strong>No intrusion</strong></span><i>Clear</i></article></section>
          </>}

          {activeView === 'tasks' && <>
            <div className="orbis-page-heading">
              <div><p>Tasks</p><h1>Every physical task, visible</h1><span>Work is grouped by readiness, execution, exceptions, and proof.</span></div>
              <Button variant="outline" size="lg"><Plus /> New task</Button>
            </div>
            <section className="orbis-task-summary"><div><span>18</span><small>Today</small></div><div><span>3</span><small>Running now</small></div><div><span>1</span><small>Needs attention</small></div><div><span>98.2%</span><small>Validation rate</small></div></section>
            <section className="orbis-task-board">{taskColumns.map((column) => <div className={`orbis-task-column is-${column.tone}`} key={column.id}><header><span>{column.name}</span><i>{column.tasks.length}</i></header><div>{column.tasks.map((task) => <button className={task.id === selectedTask ? 'is-selected' : ''} type="button" key={task.id} onClick={() => { setSelectedTask(task.id); setSelectedAgentId(task.agent); }}><span>{task.id}</span><strong>{task.title}</strong><small>{task.meta}</small><footer><i /><em>{column.id === 'achieved' ? 'Evidence accepted' : column.id === 'issue' ? 'Review evidence' : column.id === 'available' ? 'Ready to assign' : 'Live execution'}</em></footer></button>)}</div></div>)}</section>
          </>}

          {activeView === 'space' && <>
            <div className="orbis-page-heading">
              <div><p>Space and environment</p><h1>Warehouse 01</h1><span>A live spatial model for machines, routes, safety zones, and handoffs.</span></div>
              <Button variant="outline" size="lg"><ScanLine /> Rescan space</Button>
            </div>
            <section className="orbis-space-layout">
              <div className="orbis-space-map">
                <header><span><i /> Live world model</span><div><button type="button">2D</button><button className="is-active" type="button">3D</button></div></header>
                <div className="orbis-floorplan"><span className="orbis-zone zone-a">Packing A</span><span className="orbis-zone zone-b">Staging</span><span className="orbis-zone zone-c">Dock 04</span><i className="orbis-route" />
                  {agents.map((agent) => { const Icon = agentIcon(agent.id); return <button className={`orbis-map-node is-${agent.id} ${selectedAgentId === agent.id ? 'is-selected' : ''}`} type="button" key={agent.id} onClick={() => setSelectedAgentId(agent.id)}><span><Icon /></span><strong>{agent.name}</strong><small>{stateLabel(agent.state)}</small></button>; })}
                  <span className="orbis-wait-point"><i /> Wait point C2</span>
                </div>
              </div>
              <aside className="orbis-space-inspector"><span>Selected agent</span><h2>{selectedAgent.name}</h2><p>{selectedAgent.location}</p><dl><div><dt>Localization</dt><dd>± 1.8 cm</dd></div><div><dt>Safety radius</dt><dd>1.2 m</dd></div><div><dt>Vision coverage</dt><dd>98%</dd></div><div><dt>Route state</dt><dd>Clear</dd></div></dl><button type="button" onClick={() => setActiveView('machines')}><Eye /> Open live machine view</button></aside>
            </section>
            <section className="orbis-environment-row"><article><Box /><span><strong>3 active agents</strong><small>All localized</small></span></article><article><Map /><span><strong>6 mapped zones</strong><small>2 wait points</small></span></article><article><AlertTriangle /><span><strong>0 safety events</strong><small>Last 24 hours</small></span></article><article><CheckCircle2 /><span><strong>Map confidence 99%</strong><small>Updated 12 sec ago</small></span></article></section>
          </>}
        </div>
      </section>

      <aside className="orbis-status-panel" aria-label="Live status and workflow">
        <header><div><span>Live control</span><strong>Status and workflow</strong></div><span className="orbis-live-pill"><i /> Live</span></header>
        <section className="orbis-live-view">
          <div className="orbis-live-meta"><span><Wifi /> {selectedAgent.location}</span><time>{nowTime()}</time></div>
          <div className="orbis-camera-surface">
            <span className="scan-corner scan-corner--one" /><span className="scan-corner scan-corner--two" /><ScanLine className="orbis-scan-line" />
            {selectedAgent.id === 'packing' ? <Bot /> : selectedAgent.id === 'amr' ? <Truck /> : <Warehouse />}
            <div><i /> Tracking <strong>{selectedAgent.name}</strong></div>
          </div>
          <div className="orbis-live-caption"><span><small>Current action</small><strong>{selectedAgent.action}</strong></span><em>{selectedAgent.confidence}%</em></div>
        </section>

        <section className="orbis-validation">
          <div className="orbis-status-heading"><span>Vision validation</span><strong>{selectedAgent.state === 'issue' ? 'Outcome uncertain' : 'Task confidence'}</strong></div>
          <div className="orbis-validation-score"><strong>{selectedAgent.confidence}<sup>%</sup></strong><span><i style={{ width: `${selectedAgent.confidence}%` }} /></span></div>
          <p><ShieldCheck /> Policy threshold 90% · continuous evidence</p>
        </section>

        <section className="orbis-workflow-status">
          <div className="orbis-status-heading"><span>WF-1042</span><strong>Outbound workflow</strong></div>
          <ol>{agents.map((agent, index) => <li className={`is-${agent.state} ${agent.id === selectedAgentId ? 'is-focused' : ''}`} key={agent.id}><span>{agent.state === 'completed' ? <Check /> : `0${index + 1}`}</span><div><strong>{agent.name}</strong><small>{stateLabel(agent.state)} · {agent.confidence}%</small></div></li>)}</ol>
        </section>

        <section className="orbis-autonomy-card"><span><Activity /></span><div><strong>No human in the loop</strong><p>Orbis advances after validated outcomes and pauses safely when evidence falls below policy.</p></div></section>
        <label className="orbis-fault-control"><Switch checked={faultEnabled} onCheckedChange={setFaultEnabled} size="sm" /> Simulate low-confidence outcome</label>
      </aside>
    </main>
  );
}
