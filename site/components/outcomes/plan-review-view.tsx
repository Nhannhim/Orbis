'use client';
import { ArrowLeft } from 'lucide-react';
import type { OutcomePlanView } from '@/lib/outcome-api';
import styles from './revision.module.css';

const phases = [
  ['Home preparation + warehouse fulfillment', 'Roomba, Loader, Furniture Robot and Lamp prepare the home while specialized pickers assemble the order.', 'Home preparation and warehouse picking run independently. Each robot receives one assignment at a time.'],
  ['Inspection + delivery', 'Inspect the package, then pack, move, load and deliver with an eligible robot.', 'Package uncertainty or damage goes to a human inspector. Delivery selection uses the manifest and vehicle capabilities.'],
  ['Cooking + serving', 'Loader receives → Humanoid cooks → Humanoid plates → Loader serves.', 'Dinner Ready waits for serving, the prepared room, table setup and dinner lighting.'],
  ['Cleanup + restoration', 'Clear, store, restore and clean after you confirm dinner is over.', 'Loader and Humanoid work in parallel. Furniture movement waits for clearance; final floor cleaning waits for the furniture.'],
];
export function PlanReviewView({ plan, busy = false, onBack, onApprove }: { plan: OutcomePlanView; busy?: boolean; onBack?: () => void; onApprove: () => void }) {
  return <section className={styles.page}>
    {onBack && <button className={styles.secondary} onClick={onBack}><ArrowLeft size={14} /> Back</button>}
    <header><span className={styles.eyebrow}>Plan ready for review</span><h1>{plan.title}</h1><p>{plan.objective}</p></header>
    <div className={styles.metrics}><span><small>Guests</small><b>{plan.guestCount}</b></span><span><small>Ready by</small><b>{plan.readyBy ?? 'Not specified'}</b></span><span><small>Estimated price</small><b>{plan.estimatedCost ?? 'Not available'}</b></span></div>
    {phases.map(([title, summary, detail], i) => <details className={styles.accordion} key={title}><summary>{i + 1} · {title}<small>{summary}</small></summary><div className={styles.accordionBody}><p>{detail}</p></div></details>)}
    <details className={styles.accordion}><summary>Menu & order details <small>{plan.menu.join(' · ')} · {plan.orderItems.length} items</small></summary><div className={styles.accordionBody}>{plan.orderItems.map(item => <div className={styles.orderRow} key={item.id}><span>{item.name}</span><b>{item.quantity}</b></div>)}</div></details>
    <details className={styles.accordion}><summary>Worker inventory</summary><div className={styles.accordionBody}>{plan.workers.map(worker => <div className={styles.orderRow} key={worker.id}><span>{worker.name}</span><small>{worker.kind}</small></div>)}</div></details>
    <details className={styles.accordion}><summary>Safeguards & simulation limits</summary><div className={styles.accordionBody}><ul>{[...plan.policies, ...plan.assumptions].map(p => <li key={p}>{p}</li>)}</ul><p>Images illustrate the demonstration; they do not independently verify physical conditions or food safety.</p></div></details>
    <footer className={styles.actions}><span className={styles.muted}>Approval starts simulated execution.<br />No real purchase or robot dispatch.</span><button className={styles.primary} onClick={onApprove} disabled={busy}>{busy ? 'Starting…' : 'Approve & start'}</button></footer>
  </section>;
}
