import type { CommandContext, Context } from "grammy";
import { applyTrackingResult, findPackageWithHistory, findUserByChat } from "../../db/packages.js";
import { MISSING_API_KEY_MESSAGE, trackingService } from "../../services/tracking.js";
import { formatPackageCard, escapeHtml } from "../../services/notifier.js";

export async function handleStatus(ctx: CommandContext<Context>) {
  const chatId = String(ctx.chat.id);
  let trackingNumber = ctx.match?.trim() || "";

  // If command was triggered as /status_TRACKINGNUMBER
  if (!trackingNumber && ctx.message?.text?.startsWith("/status_")) {
    trackingNumber = ctx.message.text.replace("/status_", "").trim();
  }

  if (!trackingNumber) {
    return ctx.reply(
      `⚠️ <b>Missing tracking number!</b>\n\nUsage:\n<code>/status &lt;tracking_number&gt;</code>\n\nExample:\n<code>/status RR123456789CN</code>`,
      { parse_mode: "HTML" }
    );
  }

  trackingNumber = trackingNumber.toUpperCase();

  const user = await findUserByChat(chatId);

  if (!user) {
    return ctx.reply("❌ You do not have any tracked packages yet. Use <code>/track &lt;number&gt;</code> first.", {
      parse_mode: "HTML",
    });
  }

  const pkg = await findPackageWithHistory(user.id, trackingNumber);

  if (!pkg) {
    return ctx.reply(
      `❌ You are not tracking package <code>${escapeHtml(trackingNumber)}</code>.\nUse <code>/track ${escapeHtml(trackingNumber)}</code> to add it.`,
      { parse_mode: "HTML" }
    );
  }

  if (!trackingService.hasApiKey()) {
    let message = `${MISSING_API_KEY_MESSAGE}\n\n${formatPackageCard(pkg)}`;
    if (pkg.events.length > 0) {
      message += `\n\n📜 <b>Recent Checkpoints:</b>\n`;
      for (const event of pkg.events.slice(0, 5)) {
        const dateStr = event.timeIso ? `<code>[${escapeHtml(event.timeIso)}]</code> ` : "";
        const locStr = event.location ? ` (${escapeHtml(event.location)})` : "";
        message += `• ${dateStr}${escapeHtml(event.description)}${locStr}\n`;
      }
    }
    return ctx.reply(message, { parse_mode: "HTML" });
  }

  const waitMsg = await ctx.reply(`🔄 Fetching latest live status for <code>${escapeHtml(trackingNumber)}</code>...`, {
    parse_mode: "HTML",
  });

  try {
    const liveTracking = await trackingService.getTracking(trackingNumber, pkg.carrierCode ?? undefined);
    const { updated: updatedPkg } = await applyTrackingResult(pkg.id, liveTracking, pkg);
    const shown = updatedPkg ?? pkg;

    let message = formatPackageCard(shown, liveTracking);

    // If there is checkpoint history, show up to the latest 5 checkpoints
    if (liveTracking.events && liveTracking.events.length > 0) {
      message += `\n\n📜 <b>Recent Checkpoints:</b>\n`;
      const recent = liveTracking.events.slice(0, 5);
      for (const ev of recent) {
        const dateStr = ev.date ? `<code>[${escapeHtml(ev.date)}]</code> ` : "";
        const locStr = ev.location ? ` (${escapeHtml(ev.location)})` : "";
        message += `• ${dateStr}${escapeHtml(ev.description)}${locStr}\n`;
      }
    }

    await ctx.api.editMessageText(chatId, waitMsg.message_id, message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(`[Bot] Error fetching live status for ${trackingNumber}:`, error);
    // Fall back to showing stored database info
    let message = formatPackageCard(pkg);
    if (pkg.events.length > 0) {
      message += `\n\n📜 <b>Recent Checkpoints:</b>\n`;
      for (const event of pkg.events.slice(0, 5)) {
        const dateStr = event.timeIso ? `<code>[${escapeHtml(event.timeIso)}]</code> ` : "";
        const locStr = event.location ? ` (${escapeHtml(event.location)})` : "";
        message += `• ${dateStr}${escapeHtml(event.description)}${locStr}\n`;
      }
    }
    await ctx.api.editMessageText(
      chatId,
      waitMsg.message_id,
      `⚠️ Could not refresh live status. Showing last saved data:\n\n${message}`,
      { parse_mode: "HTML" }
    );
  }
}
