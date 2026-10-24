import type { Api } from "grammy";
import type { TrackingResult } from "./tracking.js";

export interface PackageData {
  id: string;
  trackingNumber: string;
  carrier?: string | null;
  friendlyName?: string | null;
  status?: string | null;
  subStatus?: string | null;
  lastEvent?: string | null;
  lastUpdate?: Date | null;
}

export function getStatusBadge(status?: string | null): { emoji: string; label: string } {
  if (!status) return { emoji: "⏳", label: "Pending" };
  const s = status.toLowerCase();
  if (s.includes("delivered")) return { emoji: "✅", label: "Delivered" };
  if (s.includes("outfordelivery") || s.includes("out_for_delivery")) return { emoji: "🛵", label: "Out for Delivery" };
  if (s.includes("intransit") || s.includes("in_transit") || s.includes("transit")) return { emoji: "🚚", label: "In Transit" };
  if (s.includes("pickup")) return { emoji: "🏢", label: "Ready for Pickup" };
  if (s.includes("inforeceived") || s.includes("info_received")) return { emoji: "📝", label: "Info Received" };
  if (s.includes("deliveryfailure") || s.includes("delivery_failure")) return { emoji: "🚫", label: "Delivery Failure" };
  if (s.includes("exception") || s.includes("delay")) return { emoji: "⚠️", label: "Exception / Alert" };
  if (s.includes("expired")) return { emoji: "⌛", label: "Expired" };
  if (s.includes("notfound") || s.includes("not_found")) return { emoji: "❓", label: "Not Found Yet" };
  return { emoji: "📦", label: status };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatPackageCard(pkg: PackageData, details?: TrackingResult): string {
  const badge = getStatusBadge(details?.status || pkg.status);
  const nameHeader = pkg.friendlyName
    ? `<b>📦 ${escapeHtml(pkg.friendlyName)}</b>\n`
    : `<b>📦 Package</b>\n`;

  const trackingLine = `🔢 Tracking: <code>${escapeHtml(pkg.trackingNumber)}</code>`;
  const carrierLine = (details?.carrier || pkg.carrier)
    ? `\n🏢 Carrier: <b>${escapeHtml(details?.carrier || pkg.carrier || "")}</b>`
    : "";
  const statusLine = `\n📊 Status: ${badge.emoji} <b>${escapeHtml(badge.label)}</b>`;
  const subStatus = details?.subStatus || pkg.subStatus;
  const subStatusLine = subStatus ? `\n🏷️ Detail: <i>${escapeHtml(subStatus)}</i>` : "";

  const eventText = details?.lastEvent || pkg.lastEvent;
  const eventLine = eventText
    ? `\n📍 Latest Event: <i>${escapeHtml(eventText)}</i>`
    : "";

  const updateDate = details?.lastUpdate || pkg.lastUpdate;
  const dateLine = updateDate
    ? `\n🕒 Updated: <code>${updateDate.toISOString().replace("T", " ").substring(0, 19)} UTC</code>`
    : "";

  return `${nameHeader}${trackingLine}${carrierLine}${statusLine}${subStatusLine}${eventLine}${dateLine}`;
}

export function formatPackageList(packages: PackageData[]): string {
  if (packages.length === 0) {
    return "📭 <b>You don't have any tracked packages yet.</b>\n\nUse <code>/track &lt;number&gt; [name]</code> to start tracking!";
  }

  let text = `📦 <b>Your Tracked Packages (${packages.length})</b>\n\n`;

  packages.forEach((pkg, index) => {
    const badge = getStatusBadge(pkg.status);
    const title = pkg.friendlyName
      ? `<b>${escapeHtml(pkg.friendlyName)}</b> (<code>${escapeHtml(pkg.trackingNumber)}</code>)`
      : `<code>${escapeHtml(pkg.trackingNumber)}</code>`;

    text += `${index + 1}. ${badge.emoji} ${title}\n`;
    text += `   Status: <b>${escapeHtml(badge.label)}</b>`;
    if (pkg.lastEvent) {
      const truncated = pkg.lastEvent.length > 50 ? `${pkg.lastEvent.substring(0, 47)}...` : pkg.lastEvent;
      text += `\n   📍 <i>${escapeHtml(truncated)}</i>`;
    }
    text += `\n   🔍 Details: /status_${escapeHtml(pkg.trackingNumber)}\n\n`;
  });

  text += `💡 <i>Tip: Send /status &lt;number&gt; or /remove &lt;number&gt; to manage individual packages.</i>`;
  return text;
}

export class NotifierService {
  /**
   * Sends an automated notification to the user when a package status or milestone changes.
   */
  async notifyStatusChange(
    api: Api,
    chatId: string,
    pkg: PackageData,
    oldStatus: string | null,
    newStatus: string,
    newEvent?: string | null
  ): Promise<boolean> {
    try {
      const badge = getStatusBadge(newStatus);
      const pkgName = pkg.friendlyName
        ? `<b>${escapeHtml(pkg.friendlyName)}</b> (<code>${escapeHtml(pkg.trackingNumber)}</code>)`
        : `<code>${escapeHtml(pkg.trackingNumber)}</code>`;

      let message = `🔔 <b>Tracking Update Alert!</b>\n\n`;
      message += `Package: ${pkgName}\n`;
      message += `New Status: ${badge.emoji} <b>${escapeHtml(badge.label)}</b>\n`;

      if (oldStatus && oldStatus !== newStatus) {
        const oldBadge = getStatusBadge(oldStatus);
        message += `Previous Status: ${oldBadge.emoji} ${escapeHtml(oldBadge.label)}\n`;
      }

      if (newEvent) {
        message += `\n📍 <b>Latest Checkpoint:</b>\n<i>${escapeHtml(newEvent)}</i>\n`;
      }

      message += `\n🕒 ${new Date().toISOString().replace("T", " ").substring(0, 19)} UTC`;

      await api.sendMessage(chatId, message, {
        parse_mode: "HTML",
      });

      console.log(`[Notifier] Sent status update for ${pkg.trackingNumber} to chatId ${chatId}`);
      return true;
    } catch (error) {
      console.error(`[Notifier] Failed to send notification to chatId ${chatId}:`, error);
      return false;
    }
  }
}

export const notifierService = new NotifierService();
export default notifierService;
