export interface IScoreDetails {
  user_id: string;
  game_id: string;
  score: number;
  ctime: Date; //timestamp for the score ingestion
}

export interface ILeaderboard {
  user_id: string;
  score: number;
  rank: number;
  game_id: string;
}
