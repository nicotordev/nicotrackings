import type { CommandContext, Context } from "grammy";
import { deletePackage, findPackage, findUserByChat, otherPackageCount } from "../../db/packages.js";
import { escapeHtml } from "../../services/notifier.js";
import { trackingService } from "../../services/tracking.js";

export async function handleRemove(ctx: CommandContext<Context>) {
  const chatId = String(ctx.chat.id);
  let trackingNumber = ctx.match?.trim() || "";

  // If command was triggered as /remove_TRACKINGNUMBER
  if (!trackingNumber && ctx.message?.text?.startsWith("/remove_")) {
    trackingNumber = ctx.message.text.replace("/remove_", "").trim();
  }

  if (!trackingNumber) {
    return ctx.reply(
      `⚠️ <b>Missing tracking number!</b>\n\nUsage:\n<code>/remove &lt;tracking_number&gt;</code>\n\nExample:\n<code>/remove RR123456789CN</code>`,
      { parse_mode: "HTML" }
    );
  }

  trackingNumber = trackingNumber.toUpperCase();

  const user = await findUserByChat(chatId);

  if (!user) {
    return ctx.reply("❌ You do not have any tracked packages.", { parse_mode: "HTML" });
  }

  const pkg = await findPackage(user.id, trackingNumber);

  if (!pkg) {
    return ctx.reply(
      `❌ Package <code>${escapeHtml(trackingNumber)}</code> was not found in your tracking list.`,
      { parse_mode: "HTML" }
    );
  }

  const remaining = await otherPackageCount(pkg.trackingNumber, pkg.id);
  await deletePackage(pkg.id);
  if (remaining === 0 && trackingService.hasApiKey()) {
    const removed = await trackingService.deleteTracking(pkg.trackingNumber, pkg.carrierCode ?? undefined);
    if (!removed) {
      console.warn(`[17TRACK] Local package ${pkg.trackingNumber} was removed, but deletetrack did not accept it.`);
    }
  }

  const displayName = pkg.friendlyName ? `"${escapeHtml(pkg.friendlyName)}" (<code>${escapeHtml(trackingNumber)}</code>)` : `<code>${escapeHtml(trackingNumber)}</code>`;

  await ctx.reply(`🗑️ Package ${displayName} has been removed from your tracking list.`, {
    parse_mode: "HTML",
  });
}
