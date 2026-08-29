'use client';

import { Check, Clock3, Home, RotateCcw } from 'lucide-react';
import type { OutcomeView } from '@/lib/outcome-api';
import { EvidenceTimeline } from './evidence-timeline';
import { HomeFeedGrid } from './home-feed-grid';
import { formatTime, ProgressBar, StatusPill } from './outcome-ui';
import { WorkerCard } from './worker-card';
import styles from './outcomes.module.css';

export function CleanupView({ outcome }: { outcome: OutcomeView }) {
  const completed = outcome.cleanupChecklist.filter((item) => item.status === 'verified' || item.status === 'not_required').length;
  const progress = outcome.cleanupChecklist.length ? Math.round((completed / outcome.cleanupChecklist.length) * 100) : 0;
  const homeWorkers = outcome.workers.filter((worker) => worker.id.startsWith('home-'));
  return (
    <section className={styles.screen}>
      <header className={styles.screenHeader}><div><div><span className={styles.liveLabel}><i /> SIMULATED EXECUTION</span><h1>Restore the home</h1><p>Dinner is complete. Orbis is clearing, cleaning, and returning the room to its normal state.</p></div></div><div className={styles.deadline}><Clock3 /><span><small>Expected complete</small><strong>{formatTime(outcome.predictedCompletion) ?? 'Calculating'}</strong></span></div></header>
      <section className={styles.cleanupProgress}><div><StatusPill status={outcome.status} /><strong>{outcome.currentAction ?? 'Coordinating cleanup dependencies'}</strong></div><ProgressBar value={progress} label={`${progress}% of cleanup complete`} /></section>
      <HomeFeedGrid outcome={outcome} />
      <div className={styles.cleanupGrid}>
        {outcome.cleanupChecklist.map((item, index) => <article className={item.status === 'verified' ? styles.verified : item.status === 'attention' ? styles.needsAttention : ''} key={item.id}><span>{item.status === 'verified' ? <Check /> : <Clock3 />}</span><div><small>Step {index + 1}</small><strong>{item.label}</strong><em>{item.status === 'verified' ? 'Proof recorded' : index === completed ? 'Working now' : 'Waiting for dependency'}</em></div></article>)}
      </div>
      {homeWorkers.length > 0 && <><section className={styles.sectionHeading}><div><small>Home workers</small><h2>Cleanup assignments</h2></div><span><RotateCcw /> Ordered by dependency</span></section><div className={styles.workerGrid}>{homeWorkers.map((worker) => <WorkerCard worker={worker} key={worker.id} />)}</div></>}
      <div className={styles.singleTrust}><EvidenceTimeline evidence={outcome.evidence} events={outcome.events} /></div>
      <footer className={styles.backendTruth}><Home /><span><strong>Final completion waits for proof</strong><small>Orbis completes only after required cleanup checks and final inspection pass.</small></span></footer>
    </section>
  );
}
