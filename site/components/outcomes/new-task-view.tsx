'use client';

import { ArrowUp, Check, House, Sparkles, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import styles from './outcomes.module.css';

export function NewTaskView({ objective, scenario = 'home', busy = false, onObjectiveChange, onScenarioChange, onCreatePlan }: {
  objective: string;
  scenario?: 'warehouse' | 'home';
  busy?: boolean;
  onObjectiveChange: (value: string) => void;
  onScenarioChange?: (value: 'warehouse' | 'home') => void;
  onCreatePlan: () => void;
}) {
  return (
    <section className={styles.newTask}>
      <header className={styles.pageIntro}><span>New task</span><h1>What should Orbis coordinate?</h1><p>Describe the outcome. Orbis will plan the workers, dependencies, safety gates, delivery, and cleanup.</p></header>
      <div className={styles.scenarioGrid}>
        <ScenarioCard icon={<Warehouse />} title="Warehouse" eyebrow="Fulfillment network" description="Coordinate picking, inspection, routing, and physical handoffs." selected={scenario === 'warehouse'} onClick={() => onScenarioChange?.('warehouse')} />
        <ScenarioCard icon={<House />} title="Home" eyebrow="Dinner preparation" description="Coordinate dinner for 12 from grocery order through cleanup." selected={scenario === 'home'} onClick={() => onScenarioChange?.('home')} />
      </div>
      <div className={styles.composer}>
        <Textarea aria-label="Outcome objective" value={objective} onChange={(event) => onObjectiveChange(event.target.value)} placeholder="Prepare a pasta dinner for 12 by 7:00 PM…" disabled={busy} />
        <div className={styles.extractedFields}>
          <span><small>Meal</small><strong>Pasta dinner</strong></span>
          <span><small>Guests</small><strong>12</strong></span>
          <span><small>Ready by</small><strong>7:00 PM</strong></span>
          <span><small>Cleanup</small><strong>After dinner</strong></span>
        </div>
        <footer><span><Sparkles /> Orbis will propose a plan before any purchase or physical work.</span><Button type="button" onClick={onCreatePlan} disabled={busy || !objective.trim()}>Create plan <ArrowUp /></Button></footer>
      </div>
    </section>
  );
}

function ScenarioCard({ icon, title, eyebrow, description, selected, onClick }: { icon: React.ReactNode; title: string; eyebrow: string; description: string; selected: boolean; onClick: () => void }) {
  return <button className={`${styles.scenarioCard} ${selected ? styles.selected : ''}`} type="button" aria-pressed={selected} onClick={onClick}>
    <span>{icon}</span><div><small>{eyebrow}</small><strong>{title}</strong><p>{description}</p></div><i>{selected ? <Check /> : <ArrowUp />}</i>
  </button>;
}
