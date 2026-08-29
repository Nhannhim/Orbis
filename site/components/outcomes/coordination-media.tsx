'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { OutcomeMedia, OutcomeTaskView, OutcomeView } from '@/lib/outcome-api';
import { activeTask, allTasks, taskStatus, workerName } from './coordination-utils';
import styles from './revision.module.css';

export function EvidenceImage({ media, title, playing = false, history = false }: { media?: OutcomeMedia; title: string; playing?: boolean; history?: boolean }) {
  const [failed, setFailed] = useState(false);
  const available = media?.imageUrl && media.kind !== 'unavailable' && !failed;
  const label = history ? 'History' : media?.kind === 'synthetic_illustration' ? 'Synthetic illustration' : 'Simulated feed';
  return <figure className={styles.mediaCard}><div className={styles.mediaFrame}>
    {!available ? <div className={styles.unavailable}><strong>Matching media unavailable</strong><span>{media?.reason ?? 'No image is available for this assignment.'}</span></div>
      : playing && media.videoUrl && !history ? <video key={media.videoUrl} src={media.videoUrl} poster={media.imageUrl} autoPlay muted loop playsInline onError={() => setFailed(true)} aria-label={title} />
      : <Image src={media.imageUrl} alt={title} width={1536} height={1024} onError={() => setFailed(true)} />}
    {available && <span className={styles.mediaLabel}>{label}</span>}
  </div><figcaption><strong>{title}</strong>{available && <small>{media.kind === 'synthetic_illustration' ? 'Synthetic illustration' : 'Simulated video frame · ' + media.sourceClip + ' · ' + media.offsetSeconds + 's'}{media.checkpointTime ? ' · Checkpoint ' + new Date(media.checkpointTime).toLocaleTimeString() : ''}</small>}</figcaption></figure>;
}

export function CoordinationMedia({ outcome, selectedTaskId, onSelectTask, onFollow }: { outcome: OutcomeView; selectedTaskId?: string; onSelectTask?: (task: OutcomeTaskView) => void; onFollow?: () => void }) {
  const [allCameras, setAllCameras] = useState(false);
  const tasks = allTasks(outcome);
  const selected = tasks.find(t => t.id === selectedTaskId);
  const active = tasks.filter(activeTask);
  const attention = tasks.find(t => t.status === 'attention_required');
  const cleanup = outcome.status === 'cleaning_up' || outcome.status === 'completed';
  const stageTasks = tasks.filter(t => cleanup ? t.id.startsWith('cleanup_') : !t.id.startsWith('cleanup_'));
  const cameras = outcome.workers.filter(w => w.id.startsWith('home-')).map(worker => {
    const assignments = stageTasks.filter(t => t.workerId === worker.id);
    return assignments.find(activeTask) ?? assignments.filter(t => t.status === 'completed').at(-1) ?? assignments.find(t => t.status === 'ready') ?? assignments[0];
  }).filter((t): t is OutcomeTaskView => !!t);
  const preferred = [...active.filter(t => outcome.media[t.id]?.imageUrl), ...active.filter(t => !outcome.media[t.id]?.imageUrl)];
  const fallback = attention ?? stageTasks.filter(t => t.status === 'completed').at(-1) ?? stageTasks.find(t => t.status === 'ready');
  const visible = allCameras ? cameras : selected ? [selected] : preferred.length ? preferred.slice(0, 3) : fallback ? [fallback] : [];
  return <section>
    <div className={styles.heading}><div><span className={styles.eyebrow}>{outcome.historical ? 'Recorded activity' : selected ? 'Selected assignment' : 'Following current work'}</span><h2>{selected ? workerName(outcome, selected) : active.length > 1 ? active.length + ' workers active in parallel' : active.length === 1 ? workerName(outcome, active[0]) : outcome.status === 'dinner_ready' ? 'Ready for dinner' : 'Waiting for the next handoff'}</h2></div></div>
    <div className={styles.mediaGrid}>{visible.map(task => {
      const waiting = ['queued', 'ready', 'blocked'].includes(task.status);
      return <div key={task.id}>{waiting ? <div className={styles.waiting}><strong>{workerName(outcome, task)} · {task.title}</strong><small>{taskStatus(task, tasks)}</small><small>No feed playback while waiting.</small></div> : <EvidenceImage key={outcome.media[task.id]?.id ?? task.id} media={outcome.media[task.id]} title={workerName(outcome, task) + ' · ' + task.title + ' · ' + taskStatus(task, tasks)} playing={activeTask(task)} history={outcome.historical} />}</div>;
    })}</div>
    <div className={styles.strip}>{active.filter(t => !visible.some(v => v.id === t.id)).map(task => <button key={task.id} onClick={() => { setAllCameras(false); onSelectTask?.(task); }}>{workerName(outcome, task)}<small>{task.title} · Active</small></button>)}</div>
    <div className={styles.toolbar}><button aria-pressed={allCameras} onClick={() => setAllCameras(!allCameras)}>{allCameras ? 'Focused view' : 'All cameras'}</button>{selected && <button onClick={() => { setAllCameras(false); onFollow?.(); }}>Follow current work</button>}</div>
    <p className={styles.muted}>Illustrative media only. Workflow state comes from the backend; images do not independently verify physical conditions or food safety.</p>
    {selected && <details className={styles.accordion}><summary>Assignment details</summary><div className={styles.accordionBody}><p>{taskStatus(selected, tasks)}</p><p>Depends on: {selected.dependencies.map(id => tasks.find(t => t.id === id)?.title ?? id).join(' · ') || 'No prerequisites'}</p><p>Evidence records: {selected.evidenceIds.length}</p></div></details>}
  </section>;
}
