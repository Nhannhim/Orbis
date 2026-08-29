'use client';

import type { OutcomeActionKind, OutcomePlanView, OutcomeTaskView, OutcomeView, OutcomeWorkerView } from '@/lib/outcome-api';
import { AttentionPanel } from './attention-panel';
import { CleanupView } from './cleanup-view';
import { CompletionView } from './completion-view';
import { DinnerReadyView } from './dinner-ready-view';
import { LiveSessionView } from './live-session-view';
import { PlanReviewView } from './plan-review-view';

export function OutcomeExperience({ plan, outcome, busy = false, selectedTaskId, onBack, onApprovePlan, onAction, onSelectTask, onSelectWorker, onRepeat, onSaveTemplate }: {
  plan?: OutcomePlanView | null;
  outcome?: OutcomeView | null;
  busy?: boolean;
  selectedTaskId?: string;
  onBack?: () => void;
  onApprovePlan?: () => void;
  onAction?: (action: OutcomeActionKind) => void;
  onSelectTask?: (task: OutcomeTaskView) => void;
  onSelectWorker?: (worker: OutcomeWorkerView) => void;
  onRepeat?: () => void;
  onSaveTemplate?: () => void;
}) {
  if (!outcome && plan) return <PlanReviewView plan={plan} busy={busy} onBack={onBack} onApprove={onApprovePlan ?? (() => undefined)} />;
  if (!outcome) return null;
  const action = (kind: string) => onAction?.(kind as OutcomeActionKind);
  if (outcome.status === 'completed' || outcome.phase === 'completed') return <CompletionView outcome={outcome} onRepeat={onRepeat} onSaveTemplate={onSaveTemplate} />;
  if (outcome.status === 'cleaning_up' || outcome.phase === 'cleanup') return <CleanupView outcome={outcome} />;
  if (outcome.status === 'dinner_ready' || outcome.phase === 'dinner_ready') return <DinnerReadyView outcome={outcome} busy={busy} onBeginCleanup={() => action('begin_cleanup')} onKeepWarm={() => action('keep_warm')} onReportIssue={() => action('report_issue')} />;
  if ((outcome.status === 'attention_required' || outcome.status === 'blocked') && outcome.attention[0]) return <section><AttentionPanel attention={outcome.attention[0]} onAction={action} /><LiveSessionView outcome={outcome} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} onSelectWorker={onSelectWorker} /></section>;
  return <LiveSessionView outcome={outcome} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} onSelectWorker={onSelectWorker} onAction={action} />;
}
