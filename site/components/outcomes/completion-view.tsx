'use client';

import { Check, Clock3, Copy, FileCheck2, RotateCcw, ShieldCheck, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutcomeView } from '@/lib/outcome-api';
import { CustodyTracker } from './custody-tracker';
import { EvidenceTimeline } from './evidence-timeline';
import { displayToken, formatTime } from './outcome-ui';
import styles from './outcomes.module.css';

export function CompletionView({ outcome, onRepeat, onSaveTemplate }: { outcome: OutcomeView; onRepeat?: () => void; onSaveTemplate?: () => void }) {
  const interventionCount = outcome.evidence.filter((item) => item.actorKind === 'human').length;
  return (
    <section className={styles.milestoneScreen}>
      <header className={`${styles.milestoneHero} ${styles.completeHero}`}><span><Check /></span><small>Outcome complete</small><h1>Dinner served. Home restored.</h1><p>Orbis coordinated the order, delivery, preparation, dinner milestone, and cleanup as one outcome.</p></header>
      <div className={styles.completionStats}>
        <article><Clock3 /><span><small>Completed</small><strong>{formatTime(outcome.updatedAt) ?? 'On schedule'}</strong></span></article>
        <article><UsersRound /><span><small>Workers used</small><strong>{outcome.workers.length}</strong></span></article>
        <article><ShieldCheck /><span><small>Required checks</small><strong>{[...outcome.dinnerReadyChecklist, ...outcome.cleanupChecklist].filter((item) => item.status === 'verified').length} verified</strong></span></article>
        <article><FileCheck2 /><span><small>Human interventions</small><strong>{interventionCount}</strong></span></article>
      </div>
      <section className={styles.outcomeSummary}>
        <header><div><small>Final outcome</small><h2>{outcome.title}</h2></div><span>100%</span></header>
        <div>{['Meal prepared and served', 'Dining room prepared for 12', 'Dietary policy satisfied', 'Order reconciled across custody', 'Home returned to its normal state'].map((label) => <p key={label}><Check /> {label}</p>)}</div>
        <footer><span>Final phase</span><strong>{displayToken(outcome.phase)}</strong></footer>
      </section>
      <div className={styles.trustGrid}><CustodyTracker custody={outcome.custody} /><EvidenceTimeline evidence={outcome.evidence} events={outcome.events} /></div>
      <footer className={styles.milestoneActions}><div><Check /><span><strong>Everything required is complete</strong><small>The full history remains available for review.</small></span></div><span>{onSaveTemplate && <Button variant="outline" onClick={onSaveTemplate}><Copy /> Save as template</Button>}{onRepeat && <Button onClick={onRepeat}><RotateCcw /> Repeat dinner</Button>}</span></footer>
    </section>
  );
}
