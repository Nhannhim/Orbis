import { ArrowRight, Check, Clock3, PackageCheck, X } from 'lucide-react';
import type { OutcomeCustodyView } from '@/lib/outcome-api';
import { formatTime } from './outcome-ui';
import styles from './outcomes.module.css';

export function CustodyTracker({ custody }: { custody: OutcomeCustodyView[] }) {
  if (custody.length === 0) return null;
  return (
    <section className={styles.trustCard}>
      <header><div><span>Custody chain</span><strong>Order handoffs</strong></div><PackageCheck /></header>
      <div className={styles.custodyList}>
        {custody.map((handoff) => <article key={handoff.id}>
          <span className={`${styles.custodyState} ${styles[`custody_${handoff.status}`]}`}>{handoff.status === 'accepted' ? <Check /> : handoff.status === 'rejected' ? <X /> : <Clock3 />}</span>
          <div><small>{handoff.objectName}</small><strong>{handoff.from ?? 'Origin'} <ArrowRight /> {handoff.to}</strong></div>
          <time>{formatTime(handoff.occurredAt) ?? 'Pending'}</time>
        </article>)}
      </div>
    </section>
  );
}
