'use client';

import { Check, Clock3, PartyPopper, ShieldCheck, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutcomeView } from '@/lib/outcome-api';
import { CustodyTracker } from './custody-tracker';
import { EvidenceTimeline } from './evidence-timeline';
import { formatTime } from './outcome-ui';
import styles from './outcomes.module.css';

export function DinnerReadyView({ outcome, busy = false, onBeginCleanup, onKeepWarm, onReportIssue }: {
  outcome: OutcomeView;
  busy?: boolean;
  onBeginCleanup?: () => void;
  onKeepWarm?: () => void;
  onReportIssue?: () => void;
}) {
  return (
    <section className={styles.milestoneScreen}>
      <header className={styles.milestoneHero}><span><PartyPopper /></span><small>Dinner-ready milestone</small><h1>Dinner is ready for 12.</h1><p>The meal, dining room, delivery, and safety checks are complete. Cleanup will wait for the host.</p><div><Clock3 /> Ready at {formatTime(outcome.updatedAt) ?? formatTime(outcome.predictedCompletion) ?? 'on time'}</div></header>
      <section className={styles.readinessCard}>
        <header><div><small>Definition of ready</small><h2>Verified outcome</h2></div><ShieldCheck /></header>
        <div className={styles.readinessGrid}>{outcome.dinnerReadyChecklist.map((item) => <article className={item.status === 'verified' ? styles.verified : ''} key={item.id}><span>{item.status === 'verified' ? <Check /> : <Clock3 />}</span><div><strong>{item.label}</strong><small>{item.evidenceId ? `Evidence ${item.evidenceId}` : item.status === 'verified' ? 'Verified' : 'Awaiting proof'}</small></div></article>)}</div>
      </section>
      <div className={styles.trustGrid}><CustodyTracker custody={outcome.custody} /><EvidenceTimeline evidence={outcome.evidence} events={outcome.events} /></div>
      <footer className={styles.milestoneActions}>
        <div><UtensilsCrossed /><span><strong>Dinner ready is not task completion</strong><small>Orbis waits for you before beginning cleanup.</small></span></div>
        <span>{onReportIssue && <Button variant="ghost" onClick={onReportIssue} disabled={busy}>Report issue</Button>}{onKeepWarm && <Button variant="outline" onClick={onKeepWarm} disabled={busy}>Keep warm</Button>}<Button onClick={onBeginCleanup} disabled={busy || !onBeginCleanup}>Dinner is over — start cleanup <Sparkles /></Button></span>
      </footer>
    </section>
  );
}
