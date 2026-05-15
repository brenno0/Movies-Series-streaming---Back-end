export interface MovieEntity {
  id: string;
  tmdbId: number;
  title: string;
  overview: string;
  posterPath: string;
  voteAverage: number;
  createdAt: Date;
  updatedAt: Date;
}
