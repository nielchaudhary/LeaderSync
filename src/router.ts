import { Router } from "express";
import { scoreIngestionPostHandler } from "./leaderboard-service/scoreIngestion";

const router = Router();

router.post("/score", scoreIngestionPostHandler);

export const scoreRouter: [string, Router] = ["/leaderboard/v1", router];
