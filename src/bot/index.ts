import { Bot } from 'grammy';
import { getConfig } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  handleStart,
  handleHelp,
  handleTrack,
  handleList,
  handleStatus,
  handleRemove,
  handleTrackingNumber,
} from './handlers.js';

export function createBot(): Bot {
  const config = getConfig();
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('track', handleTrack);
  bot.command('list', handleList);
  bot.command('status', handleStatus);
  bot.command('remove', handleRemove);

  bot.on('message:text', handleTrackingNumber);

  bot.catch((err) => {
    logger.error({ error: err.error, ctx: err.ctx }, 'Bot error');
  });

  return bot;
}

export async function startBot(bot: Bot): Promise<void> {
  const botInfo = await bot.api.getMe();
  logger.info({ username: botInfo.username }, '✅ Bot started successfully');

  await bot.start({
    onStart: () => {
      logger.info('Bot is now polling for updates');
    },
  });
}

export async function stopBot(bot: Bot): Promise<void> {
  logger.info('Stopping bot...');
  await bot.stop();
  logger.info('Bot stopped');
}
