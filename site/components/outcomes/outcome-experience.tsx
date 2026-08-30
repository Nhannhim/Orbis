'use client';
import type { OutcomeActionKind, OutcomePlanView, OutcomeTaskView, OutcomeView } from '@/lib/outcome-api';
import { PlanReviewView } from './plan-review-view';
import { CoordinationMedia, EvidenceImage } from './coordination-media';
import styles from './revision.module.css';

export function OutcomeExperience({ plan, outcome, busy = false, selectedTaskId, onBack, onApprovePlan, onAction, onSelectTask, onFollow, onReturnLive, onRepeat }: {
  plan?: OutcomePlanView | null; outcome?: OutcomeView | null; busy?: boolean; selectedTaskId?: string;
  onBack?: () => void; onApprovePlan?: () => void; onAction?: (action: OutcomeActionKind) => void;
  onSelectTask?: (task: OutcomeTaskView) => void; onFollow?: () => void; onReturnLive?: () => void;
  onRepeat?: () => void; onSaveTemplate?: () => void;
}) {
  if (!outcome && plan) return <PlanReviewView plan={plan} busy={busy} onBack={onBack} onApprove={onApprovePlan ?? (() => undefined)} />;
  if (!outcome) return null;
  const historical = outcome.historical;
  const completed = outcome.status === 'completed';
  const dinnerReady = outcome.status === 'dinner_ready';
  const milestone = completed ? outcome.milestoneImages.home_restored : dinnerReady ? outcome.milestoneImages.dinner_ready : undefined;
  return <section className={styles.page}>
    {historical && <div className={styles.banner}><span>History · {outcome.checkpointTime ? new Date(outcome.checkpointTime).toLocaleTimeString() : 'Saved checkpoint'}<br />Live execution continues. Controls are read-only.</span><button className={styles.secondary} onClick={onReturnLive}>Return to live</button></div>}
    <header className={styles.heading}><div><span className={styles.eyebrow}>{historical ? 'Recorded state' : completed ? 'Completed' : dinnerReady ? 'Dinner ready' : outcome.status === 'cleaning_up' ? 'Cleanup in progress' : 'Simulated execution'}</span><h1>{completed ? 'Dinner served. Home restored.' : dinnerReady ? 'Your table is ready.' : outcome.title}</h1><p>{completed ? 'The dinner and restoration workflow is complete.' : dinnerReady ? 'The meal is served and the room is ready. Cleanup waits for your confirmation.' : 'Robots coordinate across the home, warehouse and delivery.'}</p></div><span className={styles.muted}>{outcome.progress}% complete</span></header>
    {outcome.attention.map(attention => <div key={attention.id} className={styles.decision}><strong>{attention.title}</strong><p>{attention.message}</p><small>Only dependent work is blocked.</small>{!historical && <div className={styles.toolbar}>{attention.permittedActions.map(action => <button key={action} disabled={busy} onClick={() => onAction?.(action)}>{action === 'submit_vision_review' ? 'Repackaged & cleared' : action === 'retry_task' ? 'Retry inspection / execution' : action.replaceAll('_',' ')}</button>)}</div>}</div>)}
    {milestone && !selectedTaskId ? <div className={styles.heroImage}><EvidenceImage key={milestone.id} media={milestone} title={completed ? 'Home restored after cleanup' : 'Pasta dinner prepared and served for twelve'} history={historical} /></div> : <CoordinationMedia outcome={outcome} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} onFollow={onFollow} />}
    {completed && outcome.milestoneImages.dinner_ready && <details className={styles.accordion}><summary>Compare with Dinner Ready</summary><div className={styles.accordionBody}><EvidenceImage key={outcome.milestoneImages.dinner_ready.id} media={outcome.milestoneImages.dinner_ready} title="Earlier: Dinner Ready" history /></div></details>}
    {(dinnerReady || completed) && <details className={styles.accordion}><summary>{completed ? 'Readiness & restoration details' : 'Dinner readiness details'}</summary><div className={styles.accordionBody}><div className={styles.checks}>{[...outcome.dinnerReadyChecklist, ...(completed ? outcome.cleanupChecklist : [])].map(item => <span key={item.id}>{item.status === 'verified' ? '✓' : '○'} {item.label}</span>)}</div><p>Checks describe simulated workflow completion, not independent food-safety verification.</p></div></details>}
    {dinnerReady && !historical && <footer className={styles.actions}><span className={styles.muted}>Enjoy dinner. Nothing cleans up until you confirm.</span><button className={styles.primary} disabled={busy || !outcome.permittedActions.includes('begin_cleanup')} onClick={() => onAction?.('begin_cleanup')}>{busy ? 'Starting…' : 'Dinner is over · Start cleanup'}</button></footer>}
    <details className={styles.accordion}><summary>Session activity & handoffs</summary><div className={styles.accordionBody}><p>{outcome.workers.length} available workers · {outcome.custody.length} cross-space handoffs · {outcome.evidence.length} recent evidence records</p><div className={styles.historyDetails}>{outcome.custody.map(c => <article key={c.id}>{c.from} → {c.to}<br /><small>{c.objectName} · {c.status}</small></article>)}{outcome.events.slice(-12).map(event => <article key={event.sequence}>{event.message}<br /><small>{event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString() : ''}</small></article>)}</div><p>Use History in the workflow sidebar to inspect earlier checkpoints.</p></div></details>
    {completed && !historical && <button className={styles.secondary} onClick={onRepeat}>Start another task</button>}
  </section>;
}
