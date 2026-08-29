import type { OutcomeTaskView, OutcomeView } from '@/lib/outcome-api';

export const activeTask = (task: OutcomeTaskView) => ['reserved', 'executing', 'verifying'].includes(task.status);
export const allTasks = (outcome: OutcomeView) => outcome.lanes.flatMap(lane => lane.tasks);
export function workerName(outcome: OutcomeView, task: OutcomeTaskView) {
  return outcome.workers.find(worker => worker.id === task.workerId)?.name
    ?? ({ 'orbis-orchestrator': 'Orbis', 'warehouse-control': 'Warehouse Control', host: 'Host' }[task.workerId ?? ''])
    ?? task.workerName ?? 'Unassigned worker';
}
export function taskStatus(task: OutcomeTaskView, tasks: OutcomeTaskView[], preview = false) {
  if (preview) return 'Proposed';
  if (task.status === 'executing') return 'Active';
  if (task.status === 'verifying') return 'Verifying';
  if (task.status === 'completed') return 'Done';
  if (task.status === 'attention_required' || task.status === 'blocked') return 'Needs attention';
  if (task.status === 'ready') return task.id === 'cleanup_gate' ? 'Waiting for you' : 'Ready';
  const dependencies = task.dependencies.map(id => tasks.find(t => t.id === id)).filter(t => t && t.status !== 'completed');
  return dependencies.length ? 'Waiting for ' + dependencies.map(t => t!.title.toLowerCase()).join(' + ') : 'Queued';
}

/** Rank only by recorded dependencies; no ordering is inferred from array positions. */
export function taskRows(tasks: OutcomeTaskView[]) {
  const ranks = new Map<string, number>();
  const ids = new Set(tasks.map(t => t.id));
  const rank = (task: OutcomeTaskView): number => {
    if (ranks.has(task.id)) return ranks.get(task.id)!;
    const parents = task.dependencies.filter(id => ids.has(id));
    const value = parents.length ? 1 + Math.max(...parents.map(id => rank(tasks.find(t => t.id === id)!))) : 0;
    ranks.set(task.id, value);
    return value;
  };
  tasks.forEach(rank);
  return [...new Set(ranks.values())].sort((a, b) => a - b).map(r => tasks.filter(t => ranks.get(t.id) === r));
}
