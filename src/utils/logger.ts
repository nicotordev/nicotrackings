import pino from 'pino';
import { getConfig } from '../config/env.js';

let loggerInstance: pino.Logger | null = null;

export function createLogger(): pino.Logger {
  const config = getConfig();
  
  const options: pino.LoggerOptions = {
    level: config.LOG_LEVEL,
  };
  
  if (config.NODE_ENV === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };
  }
  
  loggerInstance = pino(options);
  
  return loggerInstance;
}

export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    if (!loggerInstance) {
      throw new Error('Logger not initialized. Call createLogger() first.');
    }
    return loggerInstance[prop as keyof pino.Logger];
  },
});
