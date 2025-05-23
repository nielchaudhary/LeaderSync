import Debug from "debug";

//logger
const globalContext = "ringgAI";

export const globalLogger = Debug(globalContext);

export class Logger {
  public static loggers: { [key: string]: Logger } = {};

  private logInfo: Debug.IDebugger;
  private logError: Debug.IDebugger;

  constructor(loggingContext: string) {
    this.logInfo = globalLogger.extend(loggingContext + " [INFO]");
    this.logError = globalLogger.extend(loggingContext + "[ERROR]");

    this.logInfo.log = this.log.bind(this);

    this.logError.log = this.log.bind(this);

    Logger.loggers[loggingContext] = this;
  }

  private log(message: string, ...args: unknown[]) {
    const logger = Logger.loggers["global"] || console;
    logger.info(message, ...args);
  }

  public info = (arg: unknown, ...args: unknown[]): void => {
    this.logInfo(arg, ...args);
  };

  public error = (arg: unknown, ...args: unknown[]): void => {
    this.logError(arg, ...args);
  };
}
