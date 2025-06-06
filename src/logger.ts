// src/logger.ts

export enum LogLevel {
  ERROR = 0,
  WARN  = 1,
  INFO  = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel | keyof typeof LogLevel = LogLevel.INFO) {
    if (typeof level === "string") {
      const numeric = (LogLevel as any)[level.toUpperCase()];
      this.level = numeric ?? LogLevel.INFO;
    } else {
      this.level = level;
    }
  }

  setLevel(level: LogLevel | keyof typeof LogLevel) {
    this.level = typeof level === "string"
      ? (LogLevel as any)[level.toUpperCase()] ?? this.level
      : level;
  }

  private shouldLog(msgLevel: LogLevel) {
    return msgLevel <= this.level;
  }

  error(...args: any[]) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error("[ERROR]", ...args);
    }
  }
  warn(...args: any[]) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn("[WARN]", ...args);
    }
  }
  info(...args: any[]) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info("[INFO]", ...args);
    }
  }
  debug(...args: any[]) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug("[DEBUG]", ...args);
    }
  }
  verbose(...args: any[]) {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log("[VERBOSE]", ...args);
    }
  }
}

