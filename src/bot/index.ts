import { Bot, Context, GrammyError, HttpError } from "grammy";
import { registerCommands } from "./commands/index.js";

export function createBot(token = process.env.BOT_TOKEN): Bot<Context> {
  if (!token || token.trim().length === 0 || token.includes("your_telegram_bot_token")) {
    throw new Error(
      "Missing or invalid BOT_TOKEN! Please configure your Telegram Bot Token in .env file (get it from @BotFather)."
    );
  }

  const bot = new Bot(token);

  // Catch errors in bot handlers to prevent crashing
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Bot] Error while handling update ${ctx.update.update_id}:`, err.error);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("[Bot] Grammy error in request:", e.description);
    } else if (e instanceof HttpError) {
      console.error("[Bot] Could not contact Telegram:", e);
    } else {
      console.error("[Bot] Unknown error:", e);
    }
  });

  // Register command and message handlers
  registerCommands(bot);

  return bot;
}

export async function setupBotCommands(bot: Bot<Context>) {
  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Start the bot & show help menu" },
      { command: "track", description: "Track a package (/track <number> [country] [name])" },
      { command: "list", description: "List all your tracked packages" },
      { command: "status", description: "Check detailed status of a package" },
      { command: "remove", description: "Stop tracking and remove a package" },
      { command: "help", description: "Show help and usage guide" },
    ]);
    console.log("[Bot] Successfully registered bot commands menu with Telegram.");
  } catch (error) {
    console.warn("[Bot] Warning: Could not register Telegram commands menu:", error);
  }
}
