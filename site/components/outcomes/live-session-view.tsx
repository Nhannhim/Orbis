'use client';

import { AlertTriangle, ArrowRight, Clock3, MoreHorizontal, Radio, Route, UsersRound } from 'lucide-react';
import type { OutcomeTaskView, OutcomeView, OutcomeWorkerView } from '@/lib/outcome-api';
import { AttentionPanel } from './attention-panel';
import { CustodyTracker } from './custody-tracker';
import { EvidenceTimeline } from './evidence-timeline';
import { displayToken, formatTime, ProgressBar, StatusPill } from './outcome-ui';
import { TaskLane } from './task-lane';
import { WorkerCard } from './worker-card';
import styles from './outcomes.module.css';

export function LiveSessionView({ outcome, selectedTaskId, onSelectTask, onSelectWorker, onAction }: {
  outcome: OutcomeView;
  selectedTaskId?: string;
  onSelectTask?: (task: OutcomeTaskView) => void;
  onSelectWorker?: (worker: OutcomeWorkerView) => void;
  onAction?: (action: string) => void;
}) {
  const activeWorkers = outcome.workers.filter((worker) => worker.activeAssignment || ['working', 'executing', 'reserved'].includes(worker.status));
  return (
    <section className={styles.screen}>
      <header className={styles.sessionHeader}>
        <div><span className={styles.liveLabel}><i /> {outcome.mode === 'live' ? 'LIVE EXECUTION' : 'SIMULATED EXECUTION'}</span><h1>{outcome.title}</h1><p>{displayToken(outcome.phase)} · Updated from backend state</p></div>
        <button className={styles.iconButton} type="button" aria-label="Task actions"><MoreHorizontal /></button>
      </header>
      <section className={styles.outcomeStatus}>
        <div><StatusPill status={outcome.status} /><strong>{outcome.currentAction ?? 'Coordinating the next available work'}</strong><small>{outcome.currentWorkerName ? `${outcome.currentWorkerName} is active` : 'Orbis is evaluating task dependencies'}</small></div>
        <div className={styles.prediction}><Clock3 /><span><small>Expected ready</small><strong>{formatTime(outcome.predictedCompletion) ?? formatTime(outcome.deadline) ?? 'Calculating'}</strong></span></div>
        <div className={styles.overallProgress}><ProgressBar value={outcome.progress} label={`${outcome.progress}% of dinner outcome complete`} /></div>
      </section>

      {outcome.attention.length > 0 && <AttentionPanel attention={outcome.attention[0]} onAction={onAction} compact />}

      <section className={styles.sectionHeading}><div><small>Coordinated workflow</small><h2>Warehouse, delivery, and Home</h2></div><span><Route /> Dependencies update as work completes</span></section>
      <div className={styles.lanes}>{outcome.lanes.map((lane) => <TaskLane lane={lane} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} key={lane.id} />)}</div>

      {outcome.routingCandidates.length > 0 && <section className={styles.routingCard}>
        <header><div><small>Delivery routing</small><strong>{outcome.routingCandidates.some((candidate) => candidate.selected) ? 'Worker selected by package and route policy' : 'Waiting for package clearance'}</strong></div><Route /></header>
        <div>{outcome.routingCandidates.map((candidate) => <article className={candidate.selected ? styles.selected : ''} key={candidate.id}><span><i>{candidate.selected ? 'Selected' : candidate.eligible ? 'Eligible' : 'Not eligible'}</i><strong>{candidate.name}</strong><small>{candidate.reasons.map(displayToken).join(' · ') || 'Meets current constraints'}</small></span>{candidate.selected ? <ArrowRight /> : <AlertTriangle />}</article>)}</div>
      </section>}

      {activeWorkers.length > 0 && <><section className={styles.sectionHeading}><div><small>Active workers</small><h2>What is happening now</h2></div><span><UsersRound /> {activeWorkers.length} assigned</span></section><div className={styles.workerGrid}>{activeWorkers.slice(0, 5).map((worker, index) => <WorkerCard worker={worker} featured={index < 2} onSelect={onSelectWorker} key={worker.id} />)}</div></>}

      <div className={styles.trustGrid}><CustodyTracker custody={outcome.custody} /><EvidenceTimeline evidence={outcome.evidence} events={outcome.events} /></div>
      <footer className={styles.backendTruth}><Radio /><span><strong>Backend state is authoritative</strong><small>Videos illustrate worker activity; they never advance tasks or clear dependencies.</small></span></footer>
    </section>
  );
}
