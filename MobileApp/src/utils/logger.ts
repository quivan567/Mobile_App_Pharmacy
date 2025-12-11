/**
 * Logger utility for development and production
 * In production, only errors are logged (can be sent to error tracking service)
 * In development, all logs are shown in console
 */

const isDev = __DEV__;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (isDev) {
      console.error(...args);
    }
    // In production, send to error tracking service (Sentry, etc.)
    // Example: Sentry.captureException(args[0]);
  },
  
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args);
    }
  },
};

