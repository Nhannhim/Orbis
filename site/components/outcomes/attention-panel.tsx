'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutcomeAttentionView } from '@/lib/outcome-api';
import { displayToken } from './outcome-ui';
import styles from './outcomes.module.css';

const actionLabels: Record<string, string> = {
  approve_substitution: 'Approve substitution',
  submit_vision_review: 'Review package',
  clear_obstruction: 'Confirm path is clear',
  approve_layout_change: 'Approve new layout',
  reassign_worker: 'Reassign worker',
  assign_human: 'Assign a person',
  retry_task: 'Retry task',
  simplify_menu: 'Simplify menu',
  begin_dinner: 'Begin dinner',
  keep_warm: 'Keep food warm',
  report_issue: 'Report issue',
  begin_cleanup: 'Begin cleanup',
  cancel_outcome: 'Cancel outcome',
};

export function AttentionPanel({ attention, onAction, compact = false, busyAction }: {
  attention: OutcomeAttentionView;
  onAction?: (action: string) => void;
  compact?: boolean;
  busyAction?: string;
}) {
  return (
    <section className={`${styles.attentionPanel} ${compact ? styles.compact : ''}`}>
      <header><span><ShieldAlert /></span><div><small>{attention.lane ? `${displayToken(attention.lane)} · ` : ''}{displayToken(attention.severity)}</small><h2>{attention.title}</h2><p>{attention.message}</p></div></header>
      <div className={styles.impactGrid}>
        <article><AlertTriangle /><div><small>Affected work</small><strong>{attention.affectedTasks.length ? attention.affectedTasks.map(displayToken).join(' · ') : 'Dependent work is paused'}</strong></div></article>
        <article><CheckCircle2 /><div><small>Still continuing</small><strong>{attention.continuingTasks.length ? attention.continuingTasks.map(displayToken).join(' · ') : 'Safe parallel work continues'}</strong></div></article>
        {attention.deadlineImpact && <article><Clock3 /><div><small>Schedule effect</small><strong>{attention.deadlineImpact}</strong></div></article>}
      </div>
      {attention.permittedActions.length > 0 && <footer>{attention.permittedActions.map((action, index) => <Button variant={index === 0 ? 'default' : 'outline'} type="button" key={action} onClick={() => onAction?.(action)} disabled={!onAction || busyAction === action}>{busyAction === action ? 'Working…' : actionLabels[action] ?? displayToken(action)} {index === 0 && <ArrowRight />}</Button>)}</footer>}
    </section>
  );
}
