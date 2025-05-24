import { IScoreDetails } from "../types";
import { LeaderboardEngine } from "../utils/memory";
import { Logger } from "../utils/logger";
import { Request, Response } from "express";
import { isNullOrUndefined } from "../utils/data-helpers";

const logger = new Logger("scoreIngestionPostHandler");

export const scoreIngestionPostHandler = (
  req: Request,
  res: Response
): void => {
  const requestBody = req.body as IScoreDetails;

  if (
    isNullOrUndefined(requestBody.user_id) ||
    isNullOrUndefined(requestBody.game_id) ||
    isNullOrUndefined(requestBody.score)
  ) {
    res
      .status(400)
      .json({ error: "Missing required fields: user_id, game_id, score" });
    return;
  }

  try {
    const leaderboardEngine = LeaderboardEngine.getInstance(
      requestBody.game_id
    );

    const scoreDetails: IScoreDetails = {
      user_id: requestBody.user_id,
      game_id: requestBody.game_id,
      score: requestBody.score,
      ctime: new Date(),
    };

    leaderboardEngine.updateScore(scoreDetails).catch((error) => {
      logger.error(`WAL write failed for user ${requestBody.user_id}`, error);
    });
    res.status(200).end();
    return;
  } catch (error) {
    logger.error("Score ingestion error", error);
    res.status(500).end();
    return;
  }
};
