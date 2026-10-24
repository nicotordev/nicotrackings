import type { Bot, Context } from "grammy";
import { handleStart } from "./start.js";
import { handleTrack } from "./track.js";
import { handleList } from "./list.js";
import { handleStatus } from "./status.js";
import { handleRemove } from "./remove.js";

export function registerCommands(bot: Bot<Context>) {
  // Command handlers
  bot.command("start", handleStart);
  bot.command("help", handleStart);
  bot.command("track", handleTrack);
  bot.command("list", handleList);
  bot.command("status", handleStatus);
  bot.command("remove", handleRemove);

  // Regex pattern handlers for inline commands like /status_12345 or /remove_12345
  bot.hears(/^\/status_([A-Za-z0-9_-]+)/, async (ctx) => {
    const trackingNumber = ctx.match[1];
    if (trackingNumber) {
      // Simulate status command context
      const commandCtx = Object.assign(ctx, { match: trackingNumber });
      await handleStatus(commandCtx as any);
    }
  });

  bot.hears(/^\/remove_([A-Za-z0-9_-]+)/, async (ctx) => {
    const trackingNumber = ctx.match[1];
    if (trackingNumber) {
      const commandCtx = Object.assign(ctx, { match: trackingNumber });
      await handleRemove(commandCtx as any);
    }
  });

  // Smart tracking number listener for plain messages
  // Matches common tracking numbers (UPU, UPS, FedEx, DHL, etc.)
  const trackingNumberPattern = /^(1Z[0-9A-Z]{16}|[A-Z]{2}[0-9]{9}[A-Z]{2}|[0-9]{10,24}|[A-Z0-9]{8,35})$/i;

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text.trim();

    // Skip if it's already a command
    if (text.startsWith("/")) {
      return next();
    }

    if (trackingNumberPattern.test(text)) {
      // Treat as a /track shortcut
      const commandCtx = Object.assign(ctx, { match: text });
      await handleTrack(commandCtx as any);
      return;
    }

    return next();
  });
}
