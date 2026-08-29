'use client';

import { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Box,
  Boxes,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  FileClock,
  Gauge,
  GitBranch,
  Play,
  Plus,
  Radio,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
  Waypoints,
} from 'lucide-react';
import { OrbisMark } from '@/components/orbis-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type StepState = 'waiting' | 'reserved' | 'executing' | 'verifying' | 'completed' | 'failed';
type RunState = 'ready' | 'running' | 'attention' | 'completed';

type WorkflowStep = {
  name: string;
  agent: string;
  state: StepState;
  confidence?: number;
};

type LogEvent = {
  type: string;
  message: string;
  time: string;
  tone?: 'good' | 'warn';
};

const completedSteps: WorkflowStep[] = [
  { name: 'Pack & verify', agent: 'Packing Arm 01', state: 'completed', confidence: 99 },
  { name: 'Move to staging', agent: 'Mobile Robot 01', state: 'completed', confidence: 97 },
  { name: 'Load vehicle', agent: 'Loading Station 01', state: 'completed', confidence: 98 },
];

const initialEvents: LogEvent[] = [
  { type: 'WORKFLOW.COMPLETE', message: 'Package loaded and ready for transport', time: '11:32:39', tone: 'good' },
  { type: 'EVIDENCE.ACCEPTED', message: 'Vehicle placement verified at 98%', time: '11:32:38', tone: 'good' },
  { type: 'HANDOFF.ACCEPTED', message: 'Loading Station 01 accepted custody', time: '11:32:37' },
  { type: 'AGENT.RELEASED', message: 'Mobile Robot 01 returned to fleet', time: '11:32:36' },
];

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function nowTime() {
  return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function OrbisWorkspace({
  displayName,
  demo = false,
}: {
  displayName: string;
  demo?: boolean;
}) {
  const [runState, setRunState] = useState<RunState>('completed');
  const [steps, setSteps] = useState<WorkflowStep[]>(completedSteps);
  const [events, setEvents] = useState<LogEvent[]>(initialEvents);
  const [objective, setObjective] = useState('Move ORD-1042 to the outbound vehicle at dock 04');
  const [faultEnabled, setFaultEnabled] = useState(false);
  const [packageState, setPackageState] = useState({ status: 'Loaded', location: 'truck-17 / cargo bay', custodian: 'Loading Station 01', version: 7 });

  const updateStep = (index: number, state: StepState, confidence?: number) => {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, state, confidence } : step));
  };

  const addEvent = (type: string, message: string, tone?: 'good' | 'warn') => {
    setEvents((current) => [{ type, message, time: nowTime(), tone }, ...current].slice(0, 8));
  };

  async function executeFrom(startIndex: number) {
    setRunState('running');
    for (let index = startIndex; index < 3; index += 1) {
      updateStep(index, 'reserved');
      addEvent('STEP.RESERVED', `${completedSteps[index].agent} reserved ${completedSteps[index].name}`);
      await delay(550);
      updateStep(index, 'executing');
      addEvent('STEP.EXECUTING', `${completedSteps[index].agent} is executing locally`);
      await delay(720);
      updateStep(index, 'verifying');
      addEvent('EVIDENCE.RECEIVED', `Validating sensor evidence from ${completedSteps[index].agent}`);
      await delay(620);

      if (index === 2 && faultEnabled) {
        updateStep(index, 'failed', 41);
        setRunState('attention');
        addEvent('VERIFICATION.FAILED', 'Expected vehicle placement could not be proven', 'warn');
        return;
      }

      const confidence = [99, 97, 98][index];
      updateStep(index, 'completed', confidence);
      addEvent('STEP.COMPLETE', `${completedSteps[index].name} verified at ${confidence}%`, 'good');
      if (index === 0) setPackageState({ status: 'Packed', location: 'packing cell', custodian: 'Packing Arm 01', version: 3 });
      if (index === 1) setPackageState({ status: 'Staged', location: 'dock 04 / staging', custodian: 'Mobile Robot 01', version: 5 });
      if (index === 2) setPackageState({ status: 'Loaded', location: 'truck-17 / cargo bay', custodian: 'Loading Station 01', version: 7 });
      await delay(320);
    }
    setRunState('completed');
    addEvent('WORKFLOW.COMPLETE', 'Package loaded and ready for transport', 'good');
  }

  async function runObjective() {
    if (runState === 'running') return;
    setSteps(completedSteps.map((step) => ({ ...step, state: 'waiting', confidence: undefined })));
    setEvents([{ type: 'WORKFLOW.CREATED', message: objective, time: nowTime() }]);
    setPackageState({ status: 'Registered', location: 'packing cell', custodian: 'Warehouse Control', version: 1 });
    await executeFrom(0);
  }

  async function retryFailedStep() {
    setFaultEnabled(false);
    updateStep(2, 'waiting');
    addEvent('RECOVERY.APPROVED', 'Operator approved a fresh loading verification');
    await delay(220);
    await executeFrom(2);
  }

  const shortName = displayName.includes('@') ? displayName.split('@')[0] : displayName.split(' ')[0];

  return (
    <main className="workspace-shell dark">
      <aside className="workspace-sidebar" aria-label="Product navigation">
        <a href="/" className="workspace-logo" aria-label="Back to Orbis home"><OrbisMark inverse /></a>
        <nav>
          <Button variant="ghost" size="icon" className="is-selected" aria-label="Orchestration"><Waypoints /></Button>
          <Button variant="ghost" size="icon" aria-label="Fleet"><Boxes /></Button>
          <Button variant="ghost" size="icon" aria-label="World model"><GitBranch /></Button>
          <Button variant="ghost" size="icon" aria-label="Evidence"><ShieldCheck /></Button>
          <Button variant="ghost" size="icon" aria-label="History"><FileClock /></Button>
        </nav>
        <div className="workspace-sidebar-bottom">
          <Button variant="ghost" size="icon" aria-label="Help"><CircleHelp /></Button>
          <Button variant="ghost" size="icon" aria-label="Settings"><Settings /></Button>
          <span className="user-avatar">{shortName.slice(0, 1).toUpperCase()}</span>
        </div>
      </aside>

      <section className="workspace-content">
        <header className="workspace-header">
          <div className="workspace-context">
            <a href="/" aria-label="Back to marketing site"><ArrowLeft size={15} /></a>
            <span>northstar logistics</span><i>/</i><strong>fulfillment</strong><ChevronDown size={14} />
          </div>
          <div className="workspace-tools">
            {demo && <span className="demo-badge">DEMO WORKSPACE</span>}
            <button className="command-search" type="button"><Search size={14} /> Search <kbd><Command size={10} /> K</kbd></button>
            <span className="network-health"><i /> Network healthy</span>
          </div>
        </header>

        <div className="workspace-main">
          <section className="workspace-title-row">
            <div>
              <p>WAREHOUSE 01 / OUTBOUND</p>
              <h1>Orchestration</h1>
            </div>
            <div className="title-actions">
              <label className="fault-switch"><Switch checked={faultEnabled} onCheckedChange={setFaultEnabled} size="sm" /> Inject verification fault</label>
              <Button variant="outline" size="lg"><Plus /> New workflow</Button>
            </div>
          </section>

          <section className="objective-composer">
            <div className="objective-icon"><Radio /></div>
            <div className="objective-input">
              <label htmlFor="objective">Objective</label>
              <Input id="objective" value={objective} onChange={(event) => setObjective(event.target.value)} disabled={runState === 'running'} />
            </div>
            <Button size="lg" onClick={runState === 'attention' ? retryFailedStep : runObjective} disabled={runState === 'running'}>
              {runState === 'running' ? <Activity className="spin-soft" /> : <Play />}
              {runState === 'attention' ? 'Retry verification' : runState === 'running' ? 'Orchestrating' : 'Run objective'}
            </Button>
          </section>

          {runState === 'attention' && (
            <section className="attention-banner" role="alert">
              <ScanLine />
              <div><strong>Physical outcome not verified</strong><span>The loading station retained custody, but vehicle placement confidence was below policy.</span></div>
              <span>41% CONFIDENCE</span>
            </section>
          )}

          <div className="operations-grid">
            <section className="operations-panel flow-panel">
              <div className="panel-heading">
                <div><span>WF-1042</span><h2>Outbound fulfillment</h2></div>
                <span className={`run-status run-status--${runState}`}><i /> {runState.replace('_', ' ')}</span>
              </div>

              <div className="package-strip">
                <div><Box /><span><small>TRACKED OBJECT</small><strong>PKG-1042 · v{packageState.version}</strong></span></div>
                <dl>
                  <div><dt>State</dt><dd>{packageState.status}</dd></div>
                  <div><dt>Location</dt><dd>{packageState.location}</dd></div>
                  <div><dt>Custody</dt><dd>{packageState.custodian}</dd></div>
                </dl>
              </div>

              <ol className="workspace-steps">
                {steps.map((step, index) => (
                  <li className={`workspace-step workspace-step--${step.state}`} key={step.name}>
                    <div className="workspace-step-track">
                      <span>{step.state === 'completed' ? '✓' : index + 1}</span>
                      {index < steps.length - 1 && <i />}
                    </div>
                    <div className="workspace-step-copy">
                      <small>STEP 0{index + 1}</small>
                      <h3>{step.name}</h3>
                      <p>{step.agent}</p>
                    </div>
                    <div className="workspace-step-state">
                      <span>{step.state}</span>
                      {step.confidence !== undefined && <em>{step.confidence}% evidence</em>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <aside className="operations-panel fleet-panel">
              <div className="panel-heading"><div><span>EDGE FLEET</span><h2>Agents</h2></div><Gauge size={18} /></div>
              <div className="fleet-list">
                {[
                  { icon: Box, id: 'packing-arm-01', name: 'Packing Arm', capability: 'pack_and_verify', index: 0 },
                  { icon: Truck, id: 'amr-01', name: 'Mobile Robot', capability: 'move_package', index: 1 },
                  { icon: Warehouse, id: 'loading-station-01', name: 'Loading Station', capability: 'load_vehicle', index: 2 },
                ].map((agent) => {
                  const Icon = agent.icon;
                  const busy = ['reserved', 'executing', 'verifying'].includes(steps[agent.index].state);
                  return (
                    <article key={agent.id} className={busy ? 'is-busy' : ''}>
                      <span className="fleet-icon"><Icon /></span>
                      <div><strong>{agent.name}</strong><small>{agent.capability}</small></div>
                      <span className="fleet-state"><i /> {busy ? steps[agent.index].state : 'available'}</span>
                    </article>
                  );
                })}
              </div>
            </aside>

            <aside className="operations-panel evidence-panel">
              <div className="panel-heading"><div><span>APPEND-ONLY</span><h2>Evidence stream</h2></div><Clock3 size={18} /></div>
              <ol>
                {events.map((event, index) => (
                  <li key={`${event.time}-${event.type}-${index}`}>
                    <i className={event.tone ? `is-${event.tone}` : ''} />
                    <div><span>{event.type}</span><p>{event.message}</p><time>{event.time}</time></div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
