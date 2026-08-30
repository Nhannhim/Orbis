import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  House,
  Package,
  Truck,
  Warehouse,
} from 'lucide-react';
import type { OutcomeLaneId } from '@/lib/outcome-api';
import styles from './outcomes.module.css';

export function displayToken(value?: string) {
  return (value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function LaneIcon({ id }: { id: OutcomeLaneId }) {
  if (id === 'warehouse') return <Warehouse />;
  if (id === 'delivery') return <Truck />;
  return <House />;
}

export function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <Check />;
  if (status === 'executing' || status === 'verifying') return <Activity />;
  if (status === 'attention_required' || status === 'blocked' || status === 'failed') return <AlertTriangle />;
  if (status === 'ready' || status === 'reserved') return <Clock3 />;
  return <Circle />;
}

export function StatusPill({ status, compact = false }: { status: string; compact?: boolean }) {
  return (
    <span className={`${styles.statusPill} ${styles[`status_${status}`] ?? ''} ${compact ? styles.compact : ''}`}>
      <StatusIcon status={status} />
      {displayToken(status)}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.progressWrap} aria-label={label ?? `${normalized}% complete`}>
      <span className={styles.progressTrack}><i style={{ width: `${normalized}%` }} /></span>
      <small>{normalized}%</small>
    </div>
  );
}

export function OutcomeEyebrow({ children }: { children: React.ReactNode }) {
  return <span className={styles.eyebrow}><CheckCircle2 /> {children}</span>;
}

export function EmptyOutcome({ message }: { message: string }) {
  return <div className={styles.empty}><Package /><p>{message}</p></div>;
}
