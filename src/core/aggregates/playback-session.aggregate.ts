export type PlaybackStatus = 'active' | 'paused' | 'ended';

export interface PlaybackSessionAggregate {
  id: string;
  userId: string;
  movieId: string;
  fileMetaId: string | null;
  progressSecs: number;
  status: PlaybackStatus;
  startedAt: Date;
  updatedAt: Date;
}

export function isSessionActive(session: PlaybackSessionAggregate): boolean {
  return session.status === 'active' || session.status === 'paused';
}
