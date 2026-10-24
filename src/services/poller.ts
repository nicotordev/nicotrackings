import cron, { type ScheduledTask } from "node-cron";
import type { Api } from "grammy";
import { applyTrackingResult, packagesDueForPoll, packagesForNumber } from "../db/packages.js";
import { toPackageStatus, trackKey, trackingService, type TrackingResult } from "./tracking.js";
import { notifierService } from "./notifier.js";

export class PollerService {
  private cronTask: ScheduledTask | null = null;
  private isPolling = false;

  start(api: Api, cronExpression = process.env.POLL_INTERVAL_CRON || "*/15 * * * *") {
    if (!cron.validate(cronExpression)) {
      console.error(`[Poller] Invalid cron expression: "${cronExpression}". Falling back to "*/15 * * * *"`);
      cronExpression = "*/15 * * * *";
    }

    console.log(`[Poller] Initializing tracking poller with schedule: ${cronExpression}`);
    this.cronTask = cron.schedule(cronExpression, async () => {
      await this.poll(api);
    });
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      console.log("[Poller] Poller cron stopped.");
    }
  }

  async poll(api: Api): Promise<number> {
    if (this.isPolling) {
      console.log("[Poller] Polling cycle already in progress. Skipping duplicate tick.");
      return 0;
    }

    if (!trackingService.hasApiKey()) {
      console.warn("[Poller] TRACKING_API_KEY is missing. Skipping this cycle.");
      return 0;
    }

    this.isPolling = true;
    let updatedCount = 0;

    try {
      const packages = await packagesDueForPoll();
      if (packages.length === 0) return 0;

      console.log(`[Poller] Starting status check for ${packages.length} active package records...`);
      const queries = new Map<string, { number: string; carrier?: number }>();
      for (const pkg of packages) {
        const carrier = pkg.carrierCode ?? undefined;
        queries.set(trackKey(pkg.trackingNumber, carrier), {
          number: pkg.trackingNumber,
          ...(carrier != null ? { carrier } : {}),
        });
      }

      const trackingMap = await trackingService.getBatchTracking([...queries.values()]);
      for (const pkg of packages) {
        const tracking =
          trackingMap.get(trackKey(pkg.trackingNumber, pkg.carrierCode ?? undefined)) ??
          trackingMap.get(pkg.trackingNumber);
        if (!tracking) continue;
        const notified = await notifyPackageChange(api, pkg, tracking);
        if (notified) updatedCount++;
      }

      console.log(`[Poller] Cycle complete. Updated ${updatedCount} packages.`);
    } catch (error) {
      console.error("[Poller] Error during polling cycle:", error);
    } finally {
      this.isPolling = false;
    }

    return updatedCount;
  }
}

export async function notifyPackageChange(
  api: Api,
  pkg: {
    id: string;
    trackingNumber: string;
    carrier: string | null;
    friendlyName: string | null;
    status: string;
    subStatus: string | null;
    lastEvent: string | null;
    lastUpdate: Date | null;
    deliveredAt: Date | null;
    eventsHash: number | null;
    user: { chatId: string };
  },
  tracking: TrackingResult,
): Promise<boolean> {
  const { updated, changed } = await applyTrackingResult(pkg.id, tracking, {
    ...pkg,
    status: toPackageStatus(pkg.status),
  });
  if (!changed || !updated) return false;

  console.log(
    `[Tracking] Update for ${pkg.trackingNumber}: [${pkg.status}] -> [${tracking.status}] | "${tracking.lastEvent ?? ""}"`,
  );
  await notifierService.notifyStatusChange(api, pkg.user.chatId, updated, pkg.status, tracking.status, tracking.lastEvent);
  return true;
}

export async function applyWebhookUpdate(api: Api, tracking: TrackingResult): Promise<number> {
  const packages = await packagesForNumber(tracking.trackingNumber, tracking.carrierCode);
  let updatedCount = 0;
  for (const pkg of packages) {
    const notified = await notifyPackageChange(api, pkg, tracking);
    if (notified) updatedCount++;
  }
  return updatedCount;
}

export const pollerService = new PollerService();
export default pollerService;
