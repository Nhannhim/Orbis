'use client';

import { Activity, Clock3 } from 'lucide-react';
import type { OutcomeTaskView, OutcomeView } from '@/lib/outcome-api';
import { displayToken } from './outcome-ui';
import styles from './outcomes.module.css';

const fallbackVideos: Record<string, string> = {
  'home-roomba-01': '/videos/home-cleanliness.mp4',
  'home-humanoid-cook-01': '/videos/home-decoration.mp4',
  'home-loader-01': '/videos/home-table-tasks.mp4',
  'home-furniture-01': '/videos/home-layout.mp4',
  'home-lamp-agent-01': '/videos/home-lights.mp4',
};

export function HomeFeedGrid({ outcome }: { outcome: OutcomeView }) {
  const tasks = outcome.lanes.flatMap((lane) => lane.tasks);
  const workers = outcome.workers.filter((worker) => worker.id.startsWith('home-'));

  return (
    <section className={styles.homeFeeds} aria-label="Home simulated camera feeds">
      <header>
        <div><small>Home camera feeds</small><h2>Parallel work, one shared outcome</h2></div>
        <span><i /> {workers.length} SIMULATED FEEDS</span>
      </header>
      <div className={styles.homeFeedGrid}>
        {workers.map((worker) => {
          const task = taskForWorker(tasks, worker.id);
          const active = Boolean(task && ['reserved', 'executing', 'verifying'].includes(task.status));
          const waiting = Boolean(task && ['queued', 'ready', 'blocked', 'attention_required'].includes(task.status));
          const video = worker.videoUrl ?? fallbackVideos[worker.id];
          return (
            <article className={`${styles.homeFeedTile} ${active ? styles.feedActive : waiting ? styles.feedWaiting : ''}`} key={worker.id}>
              <video src={video} muted autoPlay loop playsInline preload="metadata" aria-label={`${worker.name} simulated camera feed`} />
              <div className={styles.feedOverlayTop}>
                <span><i /> SIMULATED FEED</span>
                <em>{active ? <><Activity /> Working</> : waiting ? <><Clock3 /> Waiting</> : 'Available'}</em>
              </div>
              <footer>
                <span><strong>{worker.name}</strong><small>{task?.title ?? 'Awaiting assignment'}</small></span>
                {task && <b>{displayToken(task.status)}</b>}
              </footer>
            </article>
          );
        })}
      </div>
      <p className={styles.feedDisclaimer}>Illustrative video only. Backend task state controls progress, dependencies, and completion.</p>
    </section>
  );
}

function taskForWorker(tasks: OutcomeTaskView[], workerId: string) {
  const assigned = tasks.filter((task) => task.workerId === workerId);
  return assigned.find((task) => ['reserved', 'executing', 'verifying', 'attention_required'].includes(task.status))
    ?? assigned.find((task) => task.status === 'ready')
    ?? assigned.find((task) => task.status === 'queued')
    ?? assigned.at(-1);
}
