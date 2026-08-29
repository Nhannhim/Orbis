import { Bot, Check, FileCheck2, UserRound } from 'lucide-react';
import type { OutcomeEvidenceView, OutcomeEventView } from '@/lib/outcome-api';
import { displayToken, formatTime } from './outcome-ui';
import styles from './outcomes.module.css';

export function EvidenceTimeline({ evidence, events = [] }: { evidence: OutcomeEvidenceView[]; events?: OutcomeEventView[] }) {
  const rows = evidence.length > 0
    ? evidence.map((item) => ({ id: item.id, type: item.type, title: item.title, detail: `${item.actor}${item.confidence !== undefined && item.confidence !== null ? ` · ${Math.round(item.confidence * 100)}% model confidence` : ''}`, occurredAt: item.occurredAt, kind: item.actorKind }))
    : events.slice(-8).reverse().map((item) => ({ id: `${item.sequence}-${item.type}`, type: item.type, title: item.message || displayToken(item.type), detail: `Event ${item.sequence}`, occurredAt: item.occurredAt, kind: undefined }));
  if (rows.length === 0) return null;
  return (
    <section className={styles.trustCard}>
      <header><div><span>Evidence and activity</span><strong>Append-only history</strong></div><FileCheck2 /></header>
      <div className={styles.timeline}>
        {rows.map((item) => {
          const Icon = item.kind === 'human' ? UserRound : item.kind === 'ai' ? Bot : Check;
          return <article key={item.id}><span><Icon /></span><div><strong>{item.title}</strong><small>{displayToken(item.type)} · {item.detail}</small></div><time>{formatTime(item.occurredAt) ?? 'Now'}</time></article>;
        })}
      </div>
    </section>
  );
}
