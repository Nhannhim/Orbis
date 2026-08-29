'use client';

import { ChevronRight, LockKeyhole } from 'lucide-react';
import type { OutcomeLaneView, OutcomeTaskView } from '@/lib/outcome-api';
import { displayToken, formatTime, LaneIcon, ProgressBar, StatusIcon, StatusPill } from './outcome-ui';
import styles from './outcomes.module.css';

export function TaskLane({ lane, selectedTaskId, onSelectTask }: {
  lane: OutcomeLaneView;
  selectedTaskId?: string;
  onSelectTask?: (task: OutcomeTaskView) => void;
}) {
  return (
    <section className={styles.lane} data-lane={lane.id}>
      <header className={styles.laneHeader}>
        <span className={styles.laneIcon}><LaneIcon id={lane.id} /></span>
        <div>
          <small>{displayToken(lane.status)}</small>
          <h3>{lane.label}</h3>
        </div>
        <strong>{lane.progress}%</strong>
      </header>
      <ProgressBar value={lane.progress} label={`${lane.label} ${lane.progress}% complete`} />
      {(lane.currentAction || lane.nextAction || lane.blockedBy) && <div className={styles.laneContext}>
        {lane.currentAction && <p><span>Now</span>{lane.currentAction}</p>}
        {lane.nextAction && <p><span>Next</span>{lane.nextAction}</p>}
        {lane.blockedBy && <p className={styles.blockedText}><LockKeyhole /><span>Waiting for</span>{lane.blockedBy}</p>}
        {lane.expectedCompletion && <time>{formatTime(lane.expectedCompletion)}</time>}
      </div>}
      <div className={styles.taskList}>
        {lane.tasks.map((task, index) => <TaskRow task={task} step={index + 1} selected={task.id === selectedTaskId} onSelect={onSelectTask} key={task.id} />)}
      </div>
    </section>
  );
}

function TaskRow({ task, step, selected, onSelect }: {
  task: OutcomeTaskView;
  step: number;
  selected: boolean;
  onSelect?: (task: OutcomeTaskView) => void;
}) {
  const content = <>
    <span className={`${styles.taskState} ${styles[`status_${task.status}`] ?? ''}`}><StatusIcon status={task.status} /></span>
    <span className={styles.taskCopy}>
      <small>Step {step}{task.workerName ? ` · ${task.workerName}` : ''}</small>
      <strong>{task.title}</strong>
      {task.currentAction && <em>{task.currentAction}</em>}
      {task.blockingReasons.length > 0 && <em className={styles.blockedText}>{task.blockingReasons.map(displayToken).join(' · ')}</em>}
    </span>
    <span className={styles.taskTrailing}>
      <StatusPill status={task.status} compact />
      {onSelect && <ChevronRight />}
    </span>
  </>;

  if (!onSelect) return <article className={`${styles.taskRow} ${selected ? styles.selected : ''}`}>{content}</article>;
  return <button className={`${styles.taskRow} ${selected ? styles.selected : ''}`} type="button" onClick={() => onSelect(task)}>{content}</button>;
}
