import { IScoreDetails } from "../types";
import { LeaderboardEngine } from "../utils/memory";
import { Logger } from "../utils/logger";
import { Request, Response } from "express";
import { ClientError, isNullOrUndefined } from "../utils/data-helpers";

const logger = new Logger("scoreIngestionPostHandler");

export const scoreIngestionPostHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const requestBody = req.body as IScoreDetails;
  if (
    isNullOrUndefined(requestBody.user_id) ||
    isNullOrUndefined(requestBody.game_id) ||
    isNullOrUndefined(requestBody.score)
  ) {
    throw new ClientError("Missing required fields: user_id, game_id, score");
  }

  try {
    const scoreDetails: IScoreDetails = {
      user_id: requestBody.user_id,
      game_id: requestBody.game_id,
      score: requestBody.score,
      ctime: new Date(),
    };

    const leaderboardEngine = LeaderboardEngine.getInstance(
      requestBody.game_id
    );

    await leaderboardEngine.updateScore(scoreDetails);

    res.status(202).json({
      status: "accepted",
      message: "Score is being processed",
    });
  } catch (error) {
    logger.error("Score ingestion error", error);

    if (error instanceof ClientError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(503).json({
        error: "Service temporarily unavailable",
        retryAfter: "30s",
      });
    }
  }
};
