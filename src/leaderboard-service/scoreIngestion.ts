import { Request, Response } from "express";
import { IScoreDetails } from "../types";
import { z } from "zod";
import { scoreIngestionSchema } from "../utils/validations";
import { Logger } from "../utils/logger";

const logger = new Logger("ScoreIngestionService");

export const scoreIngestionPostHandler = async (
  req: Request,
  res: Response
) => {
  const reqBody = req.body as Omit<IScoreDetails, "ctime">;

  const validateRequest = scoreIngestionSchema.safeParse(reqBody);

  if (!validateRequest.success) {
    res.status(400).json({ message: validateRequest.error.errors[0].message });
    return;
  }

  try {
    const scoreDetails: IScoreDetails = {
      ...reqBody,
      ctime: new Date(),
    };

    res.status(200).send(`scores for user : ${reqBody.user_id} added`);
    return;
  } catch (error) {
    logger.error(
      `failed to add score due to ${
        error instanceof Error ? error.message : "Unknown Error"
      }`,
      error
    );
    res.status(500).send({ message: "Failed to add score", error });
    return;
  }
};
