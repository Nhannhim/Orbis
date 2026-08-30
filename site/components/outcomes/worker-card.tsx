'use client';

import { Activity, Bot, BrainCircuit, MapPin, UserRound } from 'lucide-react';
import type { OutcomeWorkerView } from '@/lib/outcome-api';
import { displayToken, StatusPill } from './outcome-ui';
import styles from './outcomes.module.css';

const videoFallbacks: Record<string, string> = {
  'home-roomba-01': '/videos/home-cleanliness.mp4',
  'home-humanoid-cook-01': '/videos/home-decoration.mp4',
  'home-loader-01': '/videos/home-table-tasks.mp4',
  'home-furniture-01': '/videos/home-layout.mp4',
  'home-lamp-agent-01': '/videos/home-lights.mp4',
};

export function WorkerCard({ worker, featured = false, onSelect }: {
  worker: OutcomeWorkerView;
  featured?: boolean;
  onSelect?: (worker: OutcomeWorkerView) => void;
}) {
  const WorkerIcon = worker.kind === 'ai' ? BrainCircuit : worker.kind === 'human' ? UserRound : Bot;
  const video = worker.videoUrl ?? videoFallbacks[worker.id];
  const body = <>
    <header className={styles.workerHeader}>
      <span className={styles.workerIcon}><WorkerIcon /></span>
      <div><small>{displayToken(worker.kind)} · {worker.subtype ?? 'Connected worker'}</small><strong>{worker.name}</strong></div>
      <StatusPill status={worker.status} compact />
    </header>
    {featured && video && <div className={styles.workerFeed}>
      <video src={video} muted autoPlay loop playsInline preload="metadata" />
      <span><i /> SIMULATED FEED</span>
      <small>{worker.name}</small>
    </div>}
    <div className={styles.workerDetails}>
      <p><Activity /> <span>{worker.activeAssignment ?? 'Awaiting assignment'}</span></p>
      {worker.location && <p><MapPin /> <span>{worker.location}</span></p>}
      <div className={styles.capabilities}>{worker.capabilities.slice(0, 3).map((capability) => <span key={capability}>{displayToken(capability)}</span>)}</div>
    </div>
  </>;
  if (!onSelect) return <article className={`${styles.workerCard} ${featured ? styles.featured : ''}`}>{body}</article>;
  return <button className={`${styles.workerCard} ${featured ? styles.featured : ''}`} type="button" onClick={() => onSelect(worker)}>{body}</button>;
}
