import Debug from "debug";
import { z } from "zod";
import { IScoreDetails } from "../types";
import { Logger } from "./logger";

const logger = new Logger("data-helpers");
//constants
export const DB_NAME = "ringgAI";
export const SCORES = "scores"; //collection name for scores

export const MAX_RPS = 10000;

export const isNullOrUndefined = (
  value: unknown
): value is null | undefined => {
  return value === null || value === undefined;
};

//queue to handle 10k RPS

export const addToQueue = (scoreDetails: IScoreDetails) => {
  const queue: IScoreDetails[] = [];

  if (queue.length >= MAX_RPS) {
    logger.info("queue is full");
    return;
  }

  queue.push(scoreDetails);
};

export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}
