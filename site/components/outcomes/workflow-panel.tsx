'use client';

import { Activity, ArrowDown, Check, House, LockKeyhole, PackageCheck, Sparkles, Truck, UtensilsCrossed, Warehouse } from 'lucide-react';
import type { OutcomeLaneView, OutcomeTaskView, OutcomeView } from '@/lib/outcome-api';
import { displayToken, ProgressBar, StatusIcon } from './outcome-ui';
import styles from './outcomes.module.css';

export function OutcomeWorkflowPanel({ outcome, selectedTaskId, onSelectTask, onClose }: {
  outcome: OutcomeView;
  selectedTaskId?: string;
  onSelectTask?: (task: OutcomeTaskView) => void;
  onClose?: () => void;
}) {
  const warehouse = outcome.lanes.find((lane) => lane.id === 'warehouse');
  const delivery = outcome.lanes.find((lane) => lane.id === 'delivery');
  const home = outcome.lanes.find((lane) => lane.id === 'home');
  const groceriesReceived = findTask(home, /receive|grocery|delivery handoff/i);
  const cooking = findTask(home, /cook|prepare meal|plate/i);
  const cleanup = findTask(home, /clean|restore|leftover/i, true);

  return (
    <aside className={styles.workflowPanel}>
      <header><div><h2>Workflow</h2><p>{outcome.id} · {outcome.title}</p></div><span className={styles.liveLabel}><i /> {outcome.mode === 'live' ? 'LIVE' : 'SIMULATED'}</span>{onClose && <button type="button" onClick={onClose} aria-label="Close workflow panel">×</button>}</header>
      <div className={styles.panelSummary}><span>{displayToken(outcome.phase)}</span><span>{outcome.lanes.reduce((sum, lane) => sum + lane.tasks.length, 0)} tasks</span><span>{outcome.progress}%</span></div>
      <div className={styles.graphScroll}>
        <div className={styles.graphOrigin}><small>Outcome</small><strong>{outcome.title}</strong></div>
        <ArrowDown className={styles.graphArrow} />
        <div className={styles.parallelNotice}><Activity /><span><strong>Running in parallel</strong><small>Warehouse and Home advance independently</small></span></div>
        <div className={styles.parallelGraph}>
          {warehouse && <LaneGraph lane={warehouse} icon={<Warehouse />} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />}
          {home && <LaneGraph lane={home} icon={<House />} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} stopBefore={groceriesReceived?.id} />}
        </div>
        <div className={styles.joinLabel}><span>Parallel work joins at delivery</span></div>
        {delivery && <CompactNode title="Deliver groceries" detail={delivery.currentAction ?? delivery.nextAction ?? 'Waiting for package clearance'} status={laneNodeStatus(delivery)} icon={<Truck />} blockedBy={delivery.blockedBy} />}
        <ArrowDown className={styles.graphArrow} />
        <CompactNode task={groceriesReceived} title="Groceries received" detail="Loader Robot accepts manifest and custody" status={groceriesReceived?.status ?? 'queued'} icon={<PackageCheck />} selected={groceriesReceived?.id === selectedTaskId} onSelect={onSelectTask} />
        <ArrowDown className={styles.graphArrow} />
        <CompactNode task={cooking} title="Cook dinner" detail="Humanoid Cook prepares and plates the meal" status={cooking?.status ?? 'queued'} icon={<UtensilsCrossed />} selected={cooking?.id === selectedTaskId} onSelect={onSelectTask} />
        <ArrowDown className={styles.graphArrow} />
        <CompactNode title="Dinner ready" detail="Meal, room, table, and safety verified" status={outcome.status === 'dinner_ready' || ['cleaning_up', 'completed'].includes(outcome.status) ? 'completed' : 'queued'} icon={<Sparkles />} />
        <div className={styles.hostGate}><LockKeyhole /><span><strong>Host gate</strong><small>Cleanup begins only after confirmation</small></span></div>
        <ArrowDown className={styles.graphArrow} />
        <CompactNode task={cleanup} title="Cleanup and restore" detail="Clear, store, reset, clean, and verify" status={outcome.status === 'completed' ? 'completed' : cleanup?.status ?? (outcome.status === 'cleaning_up' ? 'executing' : 'blocked')} icon={<Check />} selected={cleanup?.id === selectedTaskId} onSelect={onSelectTask} />
      </div>
      <footer><div><span>Current action</span><strong>{outcome.currentAction ?? 'Evaluating dependencies'}</strong><p>{outcome.currentWorkerName ?? outcome.blockedBy ?? 'Orbis outcome coordinator'}</p></div><ProgressBar value={outcome.progress} /></footer>
    </aside>
  );
}

function LaneGraph({ lane, icon, selectedTaskId, onSelectTask, stopBefore }: { lane: OutcomeLaneView; icon: React.ReactNode; selectedTaskId?: string; onSelectTask?: (task: OutcomeTaskView) => void; stopBefore?: string }) {
  const tasks = stopBefore ? lane.tasks.slice(0, Math.max(0, lane.tasks.findIndex((task) => task.id === stopBefore))) : lane.tasks;
  const active = tasks.filter((task) => ['reserved', 'executing', 'verifying', 'attention_required'].includes(task.status));
  const focus = active[0] ?? tasks.find((task) => task.status === 'ready') ?? tasks.find((task) => task.status === 'queued') ?? tasks.at(-1);
  const completed = tasks.filter((task) => ['completed', 'skipped'].includes(task.status)).length;
  return <section className={styles.graphLane}><header><span>{icon}</span><div><small>{displayToken(lane.status)}</small><strong>{lane.label}</strong></div><em>{lane.progress}%</em></header><div>{focus && <CompactNode task={focus} title={focus.title} detail={focus.currentAction ?? focus.workerName ?? 'Waiting for release'} status={focus.status} blockedBy={focus.blockingReasons[0]} selected={focus.id === selectedTaskId} onSelect={onSelectTask} />}<footer className={styles.laneSummaryMeta}><span>{completed} of {tasks.length} complete</span>{active.length > 1 && <strong>+{active.length - 1} also working</strong>}</footer></div></section>;
}

function CompactNode({ task, title, detail, status, icon, blockedBy, selected, onSelect }: { task?: OutcomeTaskView; title: string; detail: string; status: string; icon?: React.ReactNode; blockedBy?: string; selected?: boolean; onSelect?: (task: OutcomeTaskView) => void }) {
  const content = <><span className={styles.graphNodeIcon}>{icon ?? <StatusIcon status={status} />}</span><span><strong>{title}</strong><small>{detail}</small>{blockedBy && <em><LockKeyhole /> {displayToken(blockedBy)}</em>}</span><i className={`${styles.nodeStatus} ${styles[`status_${status}`] ?? ''}`}><StatusIcon status={status} /></i></>;
  if (task && onSelect) return <button className={`${styles.graphNode} ${selected ? styles.selected : ''}`} type="button" onClick={() => onSelect(task)}>{content}</button>;
  return <article className={`${styles.graphNode} ${selected ? styles.selected : ''}`}>{content}</article>;
}

function findTask(lane: OutcomeLaneView | undefined, pattern: RegExp, last = false) {
  if (!lane) return undefined;
  const matches = lane.tasks.filter((task) => pattern.test(`${task.id} ${task.title} ${task.description ?? ''}`));
  return last ? matches.at(-1) : matches[0];
}

function laneNodeStatus(lane: OutcomeLaneView): string {
  if (lane.status === 'completed') return 'completed';
  if (lane.blockedBy || ['blocked', 'attention_required'].includes(lane.status)) return 'blocked';
  if (['executing', 'in_transit', 'arrived'].includes(lane.status)) return 'executing';
  return 'queued';
}
