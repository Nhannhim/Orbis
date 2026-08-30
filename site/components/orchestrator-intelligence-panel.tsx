'use client';

import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  CircleAlert,
  GitFork,
  Home,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  Warehouse,
  Zap,
} from 'lucide-react';
import { OrbisMark } from '@/components/orbis-mark';
import {
  passedGuardrailCount,
  robotCatalog,
  stageStatus,
  uniqueRobotCount,
  type OrchestrationPhase,
  type OrchestratorPlan,
} from '@/lib/orchestrator-intelligence';

type IntelligenceTab = 'decision' | 'delegations' | 'guardrails';

function RobotStatus({ plan, robotId, phase }: { plan: OrchestratorPlan; robotId: string; phase: OrchestrationPhase }) {
  const statuses = plan.stages.filter((item) => item.robotId === robotId).map((item) => stageStatus(item, phase));
  const status = statuses.includes('working') ? 'working' : statuses.every((item) => item === 'complete') ? 'complete' : 'waiting';
  return <em className={`is-${status}`}>{status === 'complete' ? <Check /> : status === 'working' ? <Activity /> : <LockKeyhole />}{status}</em>;
}

export function OrchestratorIntelligencePanel({
  plan,
  phase,
  onOpenWorkflow,
}: {
  plan: OrchestratorPlan;
  phase: OrchestrationPhase;
  onOpenWorkflow: () => void;
}) {
  const [tab, setTab] = useState<IntelligenceTab>('decision');
  const uniqueRobots = [...new Set(plan.stages.map((item) => item.robotId))];
  const gatedCount = plan.guardrails.filter((item) => item.status === 'gated').length;
  const parallelCount = plan.stages.filter((item) => item.wave === 'parallel').length;
  const ExternalIcon = plan.lanes.some((item) => item.environment === 'warehouse') ? Warehouse : Home;

  return <section className="oi-panel">
    <header className="oi-header">
      <div className="oi-identity"><span><OrbisMark /></span><div><small>ORBIS INTELLIGENCE LAYER</small><strong>{plan.scenarioTitle}</strong><p>Interpreted the end state, selected qualified robots, and compiled a proof-gated execution graph.</p></div></div>
      <em className={phase === 'complete' ? 'is-complete' : 'is-live'}><i /> {phase === 'complete' ? 'Outcome proven' : 'Orchestrating'}</em>
    </header>

    <div className="oi-outcome">
      <span><Sparkles /></span>
      <div><small>INFERRED END STATE · {Math.round(plan.confidence * 100)}% MATCH</small><strong>{plan.endState}</strong></div>
    </div>

    <div className="oi-compile-rail" aria-label="Orchestrator decision pipeline">
      <span className="is-complete"><BrainCircuit /><small>01</small><strong>Interpret</strong><em>Outcome + constraints</em></span><ArrowRight />
      <span className="is-complete"><ShieldCheck /><small>02</small><strong>Guard</strong><em>{plan.guardrails.length} policy checks</em></span><ArrowRight />
      <span className="is-complete"><GitFork /><small>03</small><strong>Delegate</strong><em>{uniqueRobotCount(plan)} qualified robots</em></span><ArrowRight />
      <span className={phase === 'complete' ? 'is-complete' : 'is-live'}><Network /><small>04</small><strong>Coordinate</strong><em>{parallelCount} tasks in wave 1</em></span>
    </div>

    <div className="oi-stats">
      <span><strong>{plan.lanes.length}</strong><small>workflows</small></span>
      <span><strong>{uniqueRobotCount(plan)}</strong><small>robots selected</small></span>
      <span><strong>{plan.waves.filter((item) => item.phase !== 'complete').length}</strong><small>execution waves</small></span>
      <span><strong>{passedGuardrailCount(plan)}</strong><small>checks passed</small></span>
      <span className={gatedCount ? 'is-gated' : ''}><strong>{gatedCount}</strong><small>gated conditions</small></span>
    </div>

    <nav className="oi-tabs" aria-label="Intelligence details">
      <button className={tab === 'decision' ? 'is-active' : ''} type="button" onClick={() => setTab('decision')}><BrainCircuit /> Decision</button>
      <button className={tab === 'delegations' ? 'is-active' : ''} type="button" onClick={() => setTab('delegations')}><Bot /> Delegations <small>{uniqueRobots.length}</small></button>
      <button className={tab === 'guardrails' ? 'is-active' : ''} type="button" onClick={() => setTab('guardrails')}><ShieldCheck /> Guardrails <small>{plan.guardrails.length}</small></button>
    </nav>

    {tab === 'decision' && <div className="oi-decision-grid">
      <section>
        <header><BrainCircuit /><span><small>WHY THIS PLAN</small><strong>Reasoning trace</strong></span></header>
        <ol>{plan.reasoning.map((reason, index) => <li key={reason}><span>{index + 1}</span><p>{reason}</p></li>)}</ol>
      </section>
      <section>
        <header><Zap /><span><small>EXECUTION STRATEGY</small><strong>{parallelCount > 1 ? 'Parallelize first; gate only real dependencies' : 'Proof-gated sequence'}</strong></span></header>
        <div className="oi-wave-preview">{plan.waves.filter((item) => item.phase !== 'complete').map((wave, index) => {
          const count = plan.stages.filter((item) => item.wave === wave.phase).length;
          return <span className={wave.phase === phase ? 'is-active' : ''} key={wave.phase}><i>{index + 1}</i><strong>{wave.label}</strong><small>{count || 'Proof'} {count === 1 ? 'task' : 'tasks'}</small></span>;
        })}</div>
        <p className="oi-assumption"><CircleAlert /> {plan.assumptions[0]}</p>
      </section>
    </div>}

    {tab === 'delegations' && <div className="oi-delegation-grid">{uniqueRobots.map((robotId) => {
      const robot = robotCatalog[robotId];
      const assignments = plan.stages.filter((item) => item.robotId === robotId);
      const Icon = robot.environment === 'warehouse' ? ExternalIcon : Home;
      return <article key={robotId}>
        <header><span><Icon /></span><div><small>{robot.shortName} · {robot.environment}</small><strong>{robot.name}</strong></div><RobotStatus plan={plan} robotId={robotId} phase={phase} /></header>
        <div>{assignments.map((item) => <span key={item.id}><i><Check /></i><p><strong>{item.title}</strong><small>{item.rationale}</small></p></span>)}</div>
        <footer><LockKeyhole /><span><small>HARD LIMIT</small><strong>{robot.constraints[0]}</strong></span></footer>
      </article>;
    })}</div>}

    {tab === 'guardrails' && <div className="oi-guardrail-grid">{plan.guardrails.map((guardrail) => <article className={`is-${guardrail.status}`} key={guardrail.id}>
      <span>{guardrail.status === 'passed' ? <ShieldCheck /> : <CircleAlert />}</span>
      <div><small>{guardrail.status}</small><strong>{guardrail.title}</strong><p>{guardrail.detail}</p></div>
    </article>)}</div>}

    <footer className="oi-footer">
      <div><span>{plan.sharedDependency ? <GitFork /> : <Check />}</span><p><small>{plan.sharedDependency ? 'CROSS-WORKFLOW RELEASE RULE' : 'WORKFLOW ISOLATION'}</small><strong>{plan.sharedDependency?.title ?? 'No external dependency'}</strong><em>{plan.sharedDependency?.detail ?? 'All tasks remain inside independently reserved home zones.'}</em></p></div>
      <button type="button" onClick={onOpenWorkflow}>Open execution graph <ArrowRight /></button>
    </footer>
  </section>;
}
