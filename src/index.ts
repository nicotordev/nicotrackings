import { loadConfig } from './config/env.js';
import { createLogger, logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import { createTrackingProvider } from './services/tracking/index.js';
import { createBot, startBot, stopBot } from './bot/index.js';
import { PackageNotifier } from './services/notifier.js';

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    createLogger();

    logger.info('🚀 Starting Telegram Package Tracker Bot');
    logger.info({ nodeEnv: config.NODE_ENV }, 'Environment loaded');

    await connectDatabase();

    createTrackingProvider();
    logger.info('✅ Tracking provider initialized');

    const bot = createBot();
    const notifier = new PackageNotifier(bot);

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      notifier.stop();
      await stopBot(bot);
      await disconnectDatabase();

      logger.info('👋 Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      process.exit(1);
    });

    notifier.start();

    await startBot(bot);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

main();
