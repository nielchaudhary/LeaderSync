import * as fs from "fs/promises";
import * as path from "path";
import { IScoreDetails } from "../types";

interface ScoreEntry {
  userId: string;
  score: number;
  timestamp: number;
}

interface LeaderboardEntry {
  user_id: string;
  score: number;
  rank: number;
  game_id: string;
}

// Custom Skip List Node for efficient ranking
class SkipListNode {
  userId: string;
  score: number;
  forward: (SkipListNode | null)[];

  constructor(userId: string, score: number, level: number) {
    this.userId = userId;
    this.score = score;
    this.forward = new Array(level + 1).fill(null);
  }
}

// Custom Skip List for O(log n) operations
class SkipList {
  private header: SkipListNode;
  private level: number;
  private maxLevel: number;
  private probability: number;

  constructor() {
    this.maxLevel = 16;
    this.probability = 0.5;
    this.level = 0;
    this.header = new SkipListNode("", -Infinity, this.maxLevel);
  }

  private randomLevel(): number {
    let level = 0;
    while (Math.random() < this.probability && level < this.maxLevel) {
      level++;
    }
    return level;
  }

  insert(userId: string, score: number): void {
    const update: (SkipListNode | null)[] = new Array(this.maxLevel + 1).fill(
      null
    );
    let current = this.header;

    // Find position to insert/update
    for (let i = this.level; i >= 0; i--) {
      while (
        current.forward[i] &&
        (current.forward[i]!.score > score ||
          (current.forward[i]!.score === score &&
            current.forward[i]!.userId < userId))
      ) {
        current = current.forward[i]!;
      }
      update[i] = current;
    }

    current = current.forward[0]!;

    // Update existing user
    if (current && current.userId === userId) {
      current.score = score;
      return;
    }

    // Insert new node
    const newLevel = this.randomLevel();
    if (newLevel > this.level) {
      for (let i = this.level + 1; i <= newLevel; i++) {
        update[i] = this.header;
      }
      this.level = newLevel;
    }

    const newNode = new SkipListNode(userId, score, newLevel);
    for (let i = 0; i <= newLevel; i++) {
      newNode.forward[i] = update[i]!.forward[i];
      update[i]!.forward[i] = newNode;
    }
  }

  getTopK(k: number): LeaderboardEntry[] {
    const result: LeaderboardEntry[] = [];
    let current = this.header.forward[0];
    let rank = 1;

    while (current && result.length < k) {
      result.push({
        user_id: current.userId,
        score: current.score,
        rank: rank,
        game_id: "", // Will be set by caller
      });
      current = current.forward[0];
      rank++;
    }

    return result;
  }

  getRank(userId: string): number {
    let current = this.header.forward[0];
    let rank = 1;

    while (current) {
      if (current.userId === userId) {
        return rank;
      }
      current = current.forward[0];
      rank++;
    }

    return -1; // User not found
  }

  getScore(userId: string): number {
    let current = this.header.forward[0];

    while (current) {
      if (current.userId === userId) {
        return current.score;
      }
      current = current.forward[0];
    }

    return -1; // User not found
  }
}

// Write-Ahead Log implementation
class WriteAheadLog {
  private walPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(gameId: string) {
    this.walPath = path.join(process.cwd(), "data", `${gameId}.wal`);
    this.ensureDataDirectory();
  }

  private async ensureDataDirectory(): Promise<void> {
    const dataDir = path.dirname(this.walPath);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async append(entry: ScoreEntry): Promise<void> {
    // Serialize operations to prevent file corruption
    this.writeQueue = this.writeQueue.then(async () => {
      const logLine = `${entry.userId},${entry.score},${entry.timestamp}\n`;
      await fs.appendFile(this.walPath, logLine, "utf8");
    });

    return this.writeQueue;
  }

  async recover(): Promise<ScoreEntry[]> {
    try {
      const content = await fs.readFile(this.walPath, "utf8");
      const entries: ScoreEntry[] = [];

      for (const line of content.trim().split("\n")) {
        if (line.trim()) {
          const [userId, scoreStr, timestampStr] = line.split(",");
          entries.push({
            userId,
            score: parseInt(scoreStr),
            timestamp: parseInt(timestampStr),
          });
        }
      }

      return entries;
    } catch (error) {
      // WAL file doesn't exist or is empty
      return [];
    }
  }

  async checkpoint(): Promise<void> {
    // Create a checkpoint file and truncate WAL
    const checkpointPath = this.walPath.replace(".wal", ".checkpoint");
    try {
      await fs.copyFile(this.walPath, checkpointPath);
      await fs.writeFile(this.walPath, "", "utf8"); // Clear WAL
    } catch (error) {
      console.error("Checkpoint failed:", error);
    }
  }
}

// Main Leaderboard Engine
export class LeaderboardEngine {
  private static instances = new Map<string, LeaderboardEngine>();

  private gameId: string;
  private skipList: SkipList;
  private userScores: Map<string, number>;
  private wal: WriteAheadLog;
  private checkpointInterval: NodeJS.Timeout;

  private constructor(gameId: string) {
    this.gameId = gameId;
    this.skipList = new SkipList();
    this.userScores = new Map();
    this.wal = new WriteAheadLog(gameId);

    // Checkpoint every 5 minutes
    this.checkpointInterval = setInterval(() => {
      this.wal.checkpoint();
    }, 5 * 60 * 1000);

    // Recover from WAL on startup
    this.recover();
  }

  static getInstance(gameId: string): LeaderboardEngine {
    if (!this.instances.has(gameId)) {
      this.instances.set(gameId, new LeaderboardEngine(gameId));
    }
    return this.instances.get(gameId)!;
  }

  private async recover(): Promise<void> {
    const entries = await this.wal.recover();

    // Replay WAL entries
    for (const entry of entries) {
      this.userScores.set(entry.userId, entry.score);
      this.skipList.insert(entry.userId, entry.score);
    }
  }

  async updateScore(
    userId: string,
    score: number,
    scoreDetails: IScoreDetails
  ): Promise<void> {
    // 1. Write to WAL first (durability)
    await this.wal.append({
      userId,
      score,
      timestamp: Date.now(),
    });

    // 2. Update in-memory structures (performance)
    this.userScores.set(userId, score);
    this.skipList.insert(userId, score);
  }

  getTopK(k: number): LeaderboardEntry[] {
    const entries = this.skipList.getTopK(k);
    return entries.map((entry) => ({ ...entry, game_id: this.gameId }));
  }

  getUserRank(userId: string): number {
    return this.skipList.getRank(userId);
  }

  getUserScore(userId: string): number {
    return this.userScores.get(userId) ?? -1;
  }

  // Cleanup method
  destroy(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }
    LeaderboardEngine.instances.delete(this.gameId);
  }
}
