'use client';
import { useState } from 'react';
import type { OutcomeCheckpoint, OutcomeTaskView, OutcomeView } from '@/lib/outcome-api';
import { activeTask, allTasks, taskRows, taskStatus, workerName } from './coordination-utils';
import styles from './revision.module.css';

export function OutcomeWorkflowPanel({ outcome, selectedTaskId, onSelectTask, onClose, preview = false, historyMode = false, checkpoints = [], onHistory, onLive, onCheckpoint, historyLoading = false }: {
  outcome: OutcomeView; selectedTaskId?: string; onSelectTask?: (task: OutcomeTaskView) => void; onClose?: () => void;
  preview?: boolean; historyMode?: boolean; checkpoints?: OutcomeCheckpoint[]; onHistory?: () => void; onLive?: () => void; onCheckpoint?: (point: OutcomeCheckpoint) => void; historyLoading?: boolean;
}) {
  const [tab, setTab] = useState('overview');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allEvents, setAllEvents] = useState(false);
  const tasks = allTasks(outcome);
  const points = allEvents ? checkpoints : checkpoints.filter(c => /dinner.ready|outcome.completed|attention|review|custody|cleanup.started|outcome.approved/.test(c.type));
  const selected = tasks.find(t => t.id === selectedTaskId);
  const node = (task: OutcomeTaskView) => <button key={task.id} type="button" onClick={() => onSelectTask?.(task)} aria-pressed={task.id === selectedTaskId} className={[styles.robot, activeTask(task) ? styles.active : '', ['blocked','attention_required'].includes(task.status) ? styles.blocked : '', task.status === 'completed' ? styles.done : '', task.id === selectedTaskId ? styles.selected : ''].join(' ')}>
    <strong>{workerName(outcome, task)}</strong><span>{task.title}</span><em>{taskStatus(task, tasks, preview)}</em>
    {task.dependencies.length > 0 && <small className={styles.dependencies}>After {task.dependencies.map(id => tasks.find(t => t.id === id)?.title ?? id).join(' + ')}</small>}
  </button>;
  return <aside className={styles.panel}>
    <header className={styles.panelHeader}><div className={styles.panelHeading}><h2>Workflow</h2><small className={styles.eyebrow}>{preview ? 'Proposed' : historyMode ? 'History' : 'Simulated'}</small>{onClose && <button onClick={onClose} aria-label="Close workflow panel">×</button>}</div>
      <p>{outcome.title}</p>
      {!preview && <div className={styles.tabs}><button aria-pressed={!historyMode} onClick={onLive}>Live</button><button aria-pressed={historyMode} onClick={onHistory}>History</button></div>}
      <div className={styles.summary}><span>{preview ? 'Approval required' : historyMode ? 'Recorded checkpoint' : outcome.status.replaceAll('_', ' ')}</span><span>{outcome.progress}%</span><span>{tasks.length} tasks</span></div>
      <div className={styles.tabs}><button aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button><button aria-pressed={tab === 'tasks'} onClick={() => setTab('tasks')}>Tasks</button></div>
    </header>
    <div className={styles.graph}>
      {historyMode && <section><span className={styles.muted}>Session checkpoints · live work continues</span><div className={styles.checkpointList}>{points.map(c => <button key={c.sequence} aria-pressed={outcome.latestSequence === c.sequence} onClick={() => onCheckpoint?.(c)}>{c.message}<time>{new Date(c.occurredAt).toLocaleTimeString()}</time></button>)}</div><button className={styles.secondary} onClick={() => setAllEvents(!allEvents)}>{allEvents ? 'Milestones only' : 'All task transitions'}</button>{historyLoading && <output>Loading checkpoint…</output>}</section>}
      {tab === 'tasks' ? <div className={styles.groupBody}>{tasks.map(node)}</div> : <>
        {outcome.phaseGroups.map((group, i) => {
          const members = group.taskIds.map(id => tasks.find(t => t.id === id)).filter((t): t is OutcomeTaskView => !!t);
          const open = expanded[group.id] ?? (preview ? i === 0 : ['executing','attention_required'].includes(group.status) || (outcome.status === 'dinner_ready' && group.id === 'dinner'));
          return <section className={styles.group} key={group.id}><button className={styles.groupToggle} aria-expanded={open} aria-controls={'phase-' + group.id} onClick={() => setExpanded(s => ({...s, [group.id]: !open}))}><span>{i + 1} · {group.title}<small>{preview ? 'Proposed assignments' : group.completedCount + ' / ' + group.taskCount + ' done'}</small></span>{open ? '−' : '+'}</button>
            {open && <div className={styles.groupBody} id={'phase-' + group.id}>
              {group.id === 'cleanup' && <div className={styles.gate}>{members.find(t => t.id === 'cleanup_gate')?.status === 'completed' ? '✓ Host confirmed dinner is over' : 'Host decision: start cleanup or keep waiting'}</div>}
              {taskRows(members).map((row, r) => <div key={r}>{r > 0 && <div className={styles.connector} />}{row.length > 1 && <div className={styles.parallelLabel}>INDEPENDENT BRANCHES · PARALLEL WHEN READY</div>}<div className={styles.row + (row.length === 1 ? ' ' + styles.single : '')}>{row.map(node)}</div></div>)}
              {group.id === 'delivery' && <><div className={styles.decision}><strong>Package decision</strong><div className={styles.branches}><div>Clear → packing<small>Only a cleared policy releases physical work.</small></div><div>Needs review → Human Inspector<small>Correction or remediation → re-evaluate.</small></div></div></div><div className={styles.decision}><strong>Delivery candidates · simulated routing</strong><div className={styles.branches}>{outcome.routingCandidates.map(c => <div key={c.id}>{c.name}<small>{c.selected ? 'Recommended' : c.eligible ? 'Eligible' : 'Not eligible'}</small><small>{c.reasons.join(' · ')}</small></div>)}</div></div></>}
            </div>}
          </section>;
        })}
      </>}
    </div>
    <footer className={styles.panelFooter}>{selected ? 'Selected assignment' : historyMode ? 'Recorded state' : 'Current work'}<strong>{selected ? workerName(outcome, selected) + ' · ' + selected.title : outcome.status === 'completed' ? 'Dinner served. Home restored.' : outcome.status === 'dinner_ready' ? 'Dinner ready · waiting for host' : outcome.currentAction ?? (preview ? 'Nothing starts before approval' : 'Waiting for dependencies')}</strong></footer>
  </aside>;
}
