import type { CommandContext, Context } from "grammy";
import { applyTrackingResult, createPackage, ensureUser, findPackage, renamePackage } from "../../db/packages.js";
import { ParcelsApiError, toPackageStatus, trackingService } from "../../services/tracking.js";
import { formatPackageCard, escapeHtml } from "../../services/notifier.js";

export async function handleTrack(ctx: CommandContext<Context>) {
  const chatId = String(ctx.chat.id);
  const text = ctx.match?.trim() || "";

  if (!text) {
    return ctx.reply(
      `⚠️ <b>Missing tracking number!</b>\n\nUsage:\n<code>/track &lt;number&gt; [country] [name]</code>\n\nExample:\n<code>/track 1Z9999999999999999 ES My Amazon Order</code>`,
      { parse_mode: "HTML" }
    );
  }

  // Parse tracking number and optional friendly name
  // The first token is the tracking number; the rest is friendly name
  const [rawNumber, ...nameParts] = text.split(/\s+/);
  const trackingNumber = rawNumber ? rawNumber.trim().toUpperCase() : "";
  let destinationCountry = process.env.PARCELS_DESTINATION_COUNTRY?.trim().toUpperCase();
  let nameTokens = nameParts;
  if (nameTokens[0] && /^[A-Za-z]{2}$/.test(nameTokens[0])) {
    destinationCountry = nameTokens[0].toUpperCase();
    nameTokens = nameTokens.slice(1);
  }
  const friendlyName = nameTokens.length > 0 ? nameTokens.join(" ").trim() : undefined;

  if (!trackingService.hasApiKey()) {
    return ctx.reply(
      "⚠️ <b>Parcels is not configured.</b>\nSet <code>PARCELS_API_KEY</code> and try again.",
      { parse_mode: "HTML" },
    );
  }

  if (!trackingNumber || trackingNumber.length < 5 || trackingNumber.length > 50) {
    return ctx.reply(
      `⚠️ <b>Invalid tracking number format.</b>\nTracking numbers must be between 5 and 50 alphanumeric characters.`,
      { parse_mode: "HTML" }
    );
  }

  const waitMsg = await ctx.reply(`🔍 Saving <code>${escapeHtml(trackingNumber)}</code>...`, {
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

      const country = destinationCountry ?? existing.destinationCountry ?? undefined;
      const tracking = await trackingService.getTracking(trackingNumber, country);
      if (tracking.status === "NotFound" && tracking.lastEvent) {
        await ctx.api.editMessageText(
          chatId,
          waitMsg.message_id,
          `❌ <b>Parcels rejected this number.</b>\n${escapeHtml(tracking.lastEvent)}\n\nIf it asks for a destination country, use <code>/track ${escapeHtml(trackingNumber)} ES</code>.`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const stamped = { ...tracking, ...(country ? { destinationCountry: country } : {}) };
      const { updated } = await applyTrackingResult(existing.id, stamped, {
        status: toPackageStatus(existing.status),
        deliveredAt: existing.deliveredAt,
        eventsHash: existing.eventsHash,
        lastEvent: existing.lastEvent,
      });
      const card = formatPackageCard(updated ?? existing, stamped);
      const note = tracking.refreshOnly
        ? "Parcels is still checking this number. I will update the card when the result arrives."
        : "Status refreshed.";
      await ctx.api.editMessageText(
        chatId,
        waitMsg.message_id,
        `ℹ️ <b>Already tracking this package.</b>\n\n${card}\n\n<i>${escapeHtml(note)}</i>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const tracking = await trackingService.getTracking(trackingNumber, destinationCountry);
    if (tracking.status === "NotFound" && tracking.lastEvent) {
      await ctx.api.editMessageText(
        chatId,
        waitMsg.message_id,
        `❌ <b>Parcels rejected this number.</b>\n${escapeHtml(tracking.lastEvent)}\n\nIf it asks for a destination country, use <code>/track ${escapeHtml(trackingNumber)} ES</code>.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const newPkg = await createPackage(
      { ...tracking, ...(destinationCountry ? { destinationCountry } : {}) },
      {
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
    const detail = error instanceof ParcelsApiError ? `\n${escapeHtml(error.message)}` : "";
    await ctx.api.editMessageText(
      chatId,
      waitMsg.message_id,
      `❌ <b>Error:</b> Failed to register tracking. Please check the tracking number and try again.${detail}`,
      { parse_mode: "HTML" },
    );
  }
}
