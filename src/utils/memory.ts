//custom in memory + WAL for scores
import { ILeaderboard, IScoreDetails } from "../types";
import path from "path";
import fs from "fs/promises";
import { Logger } from "./logger";
import { isNullOrUndefined } from "./data-helpers";
const logger = new Logger("memory");

class SkipListNode {
  user_id: string;
  game_id: string;
  score: number;
  created_at: Date;
  forward: (SkipListNode | null)[];

  constructor(user_id: string, game_id: string, score: number, level: number) {
    this.user_id = user_id;
    this.game_id = game_id;
    this.score = score;
    this.created_at = new Date();
    this.forward = new Array(level + 1).fill(null);
  }
}

//custom skiplist which has level, max level, probability and the header that has the entire data
class SkipList {
  private header: SkipListNode;
  private level: number;
  private maxLevel: number;
  private probability: number;

  constructor() {
    this.maxLevel = 20;
    this.probability = 0.5;
    this.header = new SkipListNode("", "", -Infinity, this.maxLevel);
    this.level = 0;
  }

  private randomLevel(): number {
    let level = 0;
    while (Math.random() < this.probability && level < this.maxLevel) {
      level++;
    }
    return level;
  }

  insertScore(scoreDetails: IScoreDetails): void {
    const update: (SkipListNode | null)[] = new Array(this.maxLevel + 1).fill(
      null
    );
    let current: SkipListNode | null = this.header;
    let next: SkipListNode | null = null;

    for (let i = this.level; i >= 0; i--) {
      while (
        !isNullOrUndefined(current.forward[i]) &&
        (current.forward[i]!.score > scoreDetails.score ||
          (current.forward[i]!.score === scoreDetails.score &&
            current.forward[i]!.user_id < scoreDetails.user_id))
      ) {
        current = current.forward[i]!;
      }
      update[i] = current;
    }

    next = current.forward[0];

    // If we found a node with the same user_id, update the score
    if (!isNullOrUndefined(next) && next.user_id === scoreDetails.user_id) {
      next.score = scoreDetails.score;
      return;
    }

    const newLevel = this.randomLevel();

    if (newLevel > this.level) {
      for (let i = this.level + 1; i <= newLevel; i++) {
        update[i] = this.header;
      }
      this.level = newLevel;
    }

    const newNode = new SkipListNode(
      scoreDetails.user_id,
      scoreDetails.game_id,
      scoreDetails.score,
      newLevel
    );

    //connect the new node at each level
    for (let i = 0; i <= newLevel; i++) {
      newNode.forward[i] = update[i]!.forward[i];
      update[i]!.forward[i] = newNode;
    }
  }

  getTopK(k: number): ILeaderboard[] {
    const result: ILeaderboard[] = [];
    let current = this.header.forward[0];
    let rank = 1;

    while (current && result.length < k) {
      result.push({
        user_id: current.user_id,
        score: current.score,
        rank,
        game_id: current.game_id,
      });

      //current is now the next node at Layer 0
      current = current.forward[0];
      rank++;
    }

    return result;
  }

  getRank(userId: string): number {
    let current = this.header.forward[0];
    let rank = 1;

    while (!isNullOrUndefined(current)) {
      if (current.user_id === userId) {
        return rank;
      }
      current = current.forward[0];
      rank++;
    }
    return -1;
  }

  getScore(userId: string): number {
    let current = this.header.forward[0];
    while (!isNullOrUndefined(current)) {
      if (current.user_id === userId) {
        return current.score;
      }
      current = current.forward[0];
    }
    return -1;
  }
}

//WAL for data persistence
class WriteAheadLog {
  private writeQueue: Promise<void> = Promise.resolve();
  private walPath: string;

  constructor(gameId: string) {
    this.walPath = path.join(process.cwd(), `data/${gameId}.wal`);
    this.ensureDirectory();
  }

  private async ensureDirectory() {
    const dataDir = path.dirname(this.walPath);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes("EEXIST")) {
        return;
      }
      console.error(
        "Failed to create directory:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  async append(entry: IScoreDetails) {
    this.writeQueue = this.writeQueue.then(async () => {
      const logLine = `${entry.user_id}, ${entry.game_id}, ${entry.score}, ${entry.ctime}\n`;
      await fs.appendFile(this.walPath, logLine);
    });

    return this.writeQueue;
  }

  async recover(): Promise<IScoreDetails[]> {
    try {
      const scoreContent = await fs.readFile(this.walPath, "utf-8");
      const entries: IScoreDetails[] = [];

      for (const line of scoreContent.trim().split("\n")) {
        if (line.trim()) {
          const [user_id, game_id, score, ctime] = line.split(",");
          entries.push({
            user_id,
            game_id,
            score: parseInt(score),
            ctime: new Date(parseInt(ctime)),
          });
        }
      }
      return entries;
    } catch (error) {
      logger.error("Failed to recover WAL", error);
      return [];
    }
  }
}

export class LeaderboardEngine {
  private static Instances = new Map<string, LeaderboardEngine>();

  private gameId: string;
  private skipList: SkipList;
  private wal: WriteAheadLog;

  static getInstance(gameId: string): LeaderboardEngine {
    if (!this.Instances.has(gameId)) {
      this.Instances.set(gameId, new LeaderboardEngine(gameId));
    }
    return this.Instances.get(gameId)!;
  }

  private constructor(gameId: string) {
    this.gameId = gameId;
    this.skipList = new SkipList();
    this.wal = new WriteAheadLog(gameId);
  }

  private async recover() {
    const entries = await this.wal.recover();

    for (const entry of entries) {
      const score: IScoreDetails = {
        user_id: entry.user_id,
        game_id: entry.game_id,
        score: entry.score,
        ctime: entry.ctime,
      };
      this.skipList.insertScore(score);
    }
  }

  async updateScore(scoreDetails: IScoreDetails) {
    await this.wal.append(scoreDetails);
    this.skipList.insertScore(scoreDetails);
  }

  getTopK(k: number): ILeaderboard[] {
    return this.skipList.getTopK(k);
  }

  getUserRank(userId: string): number {
    return this.skipList.getRank(userId);
  }

  getUserScore(userId: string): number {
    return this.skipList.getScore(userId);
  }
}
