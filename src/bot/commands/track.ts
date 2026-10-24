import type { CommandContext, Context } from "grammy";
import { createPackage, ensureUser, findPackage, renamePackage } from "../../db/packages.js";
import { SeventeenTrackApiError, trackingService } from "../../services/tracking.js";
import { formatPackageCard, escapeHtml } from "../../services/notifier.js";

export async function handleTrack(ctx: CommandContext<Context>) {
  const chatId = String(ctx.chat.id);
  const text = ctx.match?.trim() || "";

  if (!text) {
    return ctx.reply(
      `⚠️ <b>Missing tracking number!</b>\n\nUsage:\n<code>/track &lt;number&gt; [optional name]</code>\n\nExample:\n<code>/track 1Z9999999999999999 My Amazon Order</code>`,
      { parse_mode: "HTML" }
    );
  }

  // Parse tracking number and optional friendly name
  // The first token is the tracking number; the rest is friendly name
  const [rawNumber, ...nameParts] = text.split(/\s+/);
  const trackingNumber = rawNumber ? rawNumber.trim().toUpperCase() : "";
  const friendlyName = nameParts.length > 0 ? nameParts.join(" ").trim() : undefined;

  if (!trackingNumber || trackingNumber.length < 5 || trackingNumber.length > 50) {
    return ctx.reply(
      `⚠️ <b>Invalid tracking number format.</b>\nTracking numbers must be between 5 and 50 alphanumeric characters.`,
      { parse_mode: "HTML" }
    );
  }

  const waitMsg = await ctx.reply(`🔍 Registering tracking <code>${escapeHtml(trackingNumber)}</code>...`, {
    parse_mode: "HTML",
  });

  try {
    const user = await ensureUser(chatId);
    const existing = await findPackage(user.id, trackingNumber);

    if (existing) {
      if (friendlyName && existing.friendlyName !== friendlyName) {
        await renamePackage(existing.id, friendlyName);
        existing.friendlyName = friendlyName;
      }

      await ctx.api.editMessageText(
        chatId,
        waitMsg.message_id,
        `ℹ️ <b>You are already tracking this package!</b>\n\n${formatPackageCard(existing)}`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const registration = await trackingService.register({
      number: trackingNumber,
      lang: "en",
      tag: chatId.slice(0, 100),
      ...(friendlyName ? { remark: friendlyName } : {}),
    });
    if (!registration.ok) {
      await ctx.api.editMessageText(
        chatId,
        waitMsg.message_id,
        `❌ <b>17TRACK rejected this number.</b>\n${escapeHtml(registration.message ?? "Check the tracking number and try again.")}`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const tracking = await trackingService.getTracking(trackingNumber, registration.carrierCode);
    const newPkg = await createPackage(tracking, {
      userId: user.id,
      ...(friendlyName ? { friendlyName } : {}),
      tag: chatId.slice(0, 100),
    });

    const card = formatPackageCard(newPkg, tracking);
    const replyMessage = `✅ <b>Tracking added successfully!</b>\n\n${card}\n\n🔔 <i>Automated notifications are enabled. You will receive updates as soon as the status changes!</i>`;

    await ctx.api.editMessageText(chatId, waitMsg.message_id, replyMessage, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(`[Bot] Error tracking package ${trackingNumber}:`, error);
    const detail = error instanceof SeventeenTrackApiError ? `\n${escapeHtml(error.message)}` : "";
    await ctx.api.editMessageText(
      chatId,
      waitMsg.message_id,
      `❌ <b>Error:</b> Failed to register tracking. Please check the tracking number and try again.${detail}`,
      { parse_mode: "HTML" },
    );
  }
}
