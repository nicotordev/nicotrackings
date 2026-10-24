import "dotenv/config";
import type { Bot, Context } from "grammy";
import { db } from "./src/db/client.js";
import { createBot, setupBotCommands } from "./src/bot/index.js";
import { pollerService } from "./src/services/poller.js";
import { handleParcelsWebhook } from "./src/services/webhook.js";

async function main() {
  console.log("=========================================");
  console.log("🚀 Starting NicoTrackings Telegram Bot...");
  console.log("=========================================");

  // 1. Verify Database connection
  try {
    await db.orm.public.User.select("id").limit(1).all();
    console.log("✅ Database connected successfully (PostgreSQL).");
  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    process.exit(1);
  }

  // 2. Check environment variables
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || botToken.trim() === "" || botToken.includes("your_telegram_bot_token")) {
    console.error("❌ BOT_TOKEN is not configured in .env file!");
    console.log("\nQuick setup:");
    console.log("1. Open Telegram and talk to @BotFather");
    console.log("2. Use /newbot to create your bot and copy the API token");
    console.log("3. Add BOT_TOKEN=<your_token> into your .env file");
    console.log("4. Restart with: bun run start\n");
    process.exit(1);
  }

  if (!process.env.PARCELS_API_KEY?.trim() && !process.env.TRACKING_API_KEY?.trim()) {
    console.warn("⚠️ PARCELS_API_KEY is not set. /track cannot ask Parcels for a status.");
  } else {
    console.log("✅ Parcels API client configured.");
  }

  // 3. Initialize bot
  const bot = createBot(botToken);
  await setupBotCommands(bot);

  // 4. Start poller service for automated updates
  const cronSchedule = process.env.POLL_INTERVAL_CRON || "*/15 * * * *";
  pollerService.start(bot.api, cronSchedule);

  const listenPort = Number(process.env.PORT || process.env.WEBHOOK_PORT);
  if (Number.isInteger(listenPort) && listenPort > 0) {
    Bun.serve({
      port: listenPort,
      hostname: "0.0.0.0",
      routes: {
        "/": {
          GET: () => new Response("ok"),
        },
        "/health": {
          GET: () => new Response("ok"),
        },
        "/webhooks/parcels": {
          POST: (req) => handleParcelsWebhook(req, bot.api),
        },
      },
    });
    console.log(`✅ HTTP listening on :${listenPort} (health and Parcels webhook)`);
  }

  // 5. Setup graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    pollerService.stop();
    await bot.stop();
    await db.close();
    console.log("👋 NicoTrackings stopped cleanly.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Polling must not take the HTTP server down. A 409 means another
  // instance is still calling getUpdates during a deploy.
  console.log("🤖 NicoTrackings bot is running and listening for Telegram updates!");
  void pollTelegram(bot);
}

async function pollTelegram(bot: Bot<Context>): Promise<void> {
  for (;;) {
    try {
      await bot.start({
        onStart(botInfo) {
          console.log(`✨ Logged in as @${botInfo.username} (${botInfo.first_name})`);
        },
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("409")) {
        console.error("Fatal error starting bot:", error);
        return;
      }
      console.warn("[Bot] Another poller is active. Retrying Telegram polling in 5s.");
      await Bun.sleep(5_000);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error starting bot:", err);
  process.exit(1);
});