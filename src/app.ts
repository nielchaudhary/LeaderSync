import express from "express";
import { Logger } from "./utils/logger";
import { scoreRouter } from "./router";
const app = express();

const logger = new Logger("app");

app.use(express.json());
app.use(scoreRouter[0], scoreRouter[1]);

app.listen(8090, () => {
  logger.info("LEADERBOARD SERVICE LIVE ON PORT 8090");
});

process.on("uncaughtException", (error) => {
  logger.error(
    `Could not initialise server due to ${
      error instanceof Error ? error.message : "Unknown Error"
    }`,
    error
  );
  process.exit(1);
});
