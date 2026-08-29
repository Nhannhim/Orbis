'use client';

import { ArrowLeft, Check, Clock3, CreditCard, ListChecks, ShieldCheck, ShoppingBasket, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutcomePlanView } from '@/lib/outcome-api';
import { displayToken, formatTime, OutcomeEyebrow } from './outcome-ui';
import styles from './outcomes.module.css';

export function PlanReviewView({ plan, busy = false, onBack, onApprove }: { plan: OutcomePlanView; busy?: boolean; onBack?: () => void; onApprove: () => void }) {
  const laneWorkers = plan.workers.reduce<Record<string, string[]>>((groups, worker) => {
    const key = worker.location?.toLowerCase().includes('home') || worker.id.startsWith('home-') ? 'Home' : worker.id.startsWith('delivery-') ? 'Delivery' : 'Warehouse';
    groups[key] = [...(groups[key] ?? []), worker.name];
    return groups;
  }, {});
  return (
    <section className={styles.screen}>
      <header className={styles.screenHeader}>
        <div>{onBack && <button className={styles.iconButton} type="button" onClick={onBack} aria-label="Back to task request"><ArrowLeft /></button>}<div><OutcomeEyebrow>Plan ready for review</OutcomeEyebrow><h1>{plan.title}</h1><p>{plan.objective}</p></div></div>
        <div className={styles.deadline}><Clock3 /><span><small>Ready by</small><strong>{formatTime(plan.readyBy) ?? '7:00 PM'}</strong></span></div>
      </header>

      <div className={styles.summaryStrip}>
        <span><UsersRound /><small>Guests</small><strong>{plan.guestCount}</strong></span>
        <span><ShoppingBasket /><small>Order</small><strong>{plan.orderItems.length} items</strong></span>
        <span><CreditCard /><small>Estimate</small><strong>{plan.estimatedCost ?? 'Review at checkout'}</strong></span>
        <span><Clock3 /><small>Schedule buffer</small><strong>15 minutes</strong></span>
      </div>

      <div className={styles.planGrid}>
        <section className={styles.card}>
          <header><div><small>Menu and order</small><h2>{plan.menu.join(' · ') || 'Vegetarian pasta dinner'}</h2></div><ShoppingBasket /></header>
          <div className={styles.orderList}>{plan.orderItems.map((item) => <article key={item.id}><span><strong>{item.name}</strong><small>{item.category ? displayToken(item.category) : 'Ingredient'}{item.substitution ? ` · Substitute: ${item.substitution}` : ''}</small></span><b>{item.quantity}</b></article>)}</div>
        </section>
        <section className={styles.card}>
          <header><div><small>Coordinated workers</small><h2>Three environments, one outcome</h2></div><UsersRound /></header>
          <div className={styles.workerGroups}>{Object.entries(laneWorkers).map(([lane, workers]) => <article key={lane}><strong>{lane}</strong><p>{workers.join(' · ')}</p></article>)}</div>
        </section>
        <section className={styles.card}>
          <header><div><small>Schedule</small><h2>Parallel work plan</h2></div><Clock3 /></header>
          <div className={styles.schedule}>{plan.schedule.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</div><time>{item.time ? formatTime(item.time) ?? item.time : 'Planned'}</time></article>)}</div>
        </section>
        <section className={styles.card}>
          <header><div><small>Policies and proof</small><h2>Execution guardrails</h2></div><ShieldCheck /></header>
          <ul className={styles.checkList}>{plan.policies.map((policy) => <li key={policy}><Check /> {policy}</li>)}</ul>
          {plan.assumptions.length > 0 && <div className={styles.assumptions}><strong>Assumptions</strong><p>{plan.assumptions.join(' · ')}</p></div>}
        </section>
      </div>
      <footer className={styles.stickyAction}>
        <span><ListChecks /><span><strong>Approval is a hard gate</strong><small>No purchase or robot execution starts until you approve.</small></span></span>
        <Button type="button" onClick={onApprove} disabled={busy}>{busy ? 'Approving…' : 'Approve order & start'} <Check /></Button>
      </footer>
    </section>
  );
}
