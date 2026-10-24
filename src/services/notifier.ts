import { Bot } from 'grammy';
import { prisma } from '../db/client.js';
import { getTrackingProvider } from './tracking/index.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/env.js';

export class PackageNotifier {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private bot: Bot) {}

  start(): void {
    if (this.isRunning) {
      logger.warn('Notifier is already running');
      return;
    }

    const config = getConfig();
    this.isRunning = true;

    logger.info(
      { intervalMs: config.POLL_INTERVAL_MS },
      '✅ Starting package status polling'
    );

    this.intervalId = setInterval(() => {
      this.checkAllPackages().catch(error => {
        logger.error({ error }, 'Error in polling interval');
      });
    }, config.POLL_INTERVAL_MS);

    this.checkAllPackages().catch(error => {
      logger.error({ error }, 'Error in initial check');
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Package status polling stopped');
  }

  private async checkAllPackages(): Promise<void> {
    try {
      const packages = await prisma.package.findMany({
        include: {
          user: true,
        },
      });

      if (packages.length === 0) {
        logger.debug('No packages to check');
        return;
      }

      logger.info({ count: packages.length }, 'Checking package statuses');

      const trackingNumbers = packages.map(pkg => pkg.trackingNumber);
      const provider = getTrackingProvider();
      const trackingInfos = await provider.batchGetTrackingInfo(trackingNumbers);

      for (const pkg of packages) {
        const trackingInfo = trackingInfos.get(pkg.trackingNumber);

        if (!trackingInfo) {
          logger.debug(
            { trackingNumber: pkg.trackingNumber },
            'No tracking info returned for package'
          );
          continue;
        }

        const statusChanged = trackingInfo.status !== pkg.status;
        const eventChanged = trackingInfo.lastEvent !== pkg.lastEvent;

        if (statusChanged || eventChanged) {
          logger.info(
            {
              trackingNumber: pkg.trackingNumber,
              oldStatus: pkg.status,
              newStatus: trackingInfo.status,
            },
            'Package status changed'
          );

          await prisma.package.update({
            where: { id: pkg.id },
            data: {
              status: trackingInfo.status ?? null,
              lastEvent: trackingInfo.lastEvent ?? null,
              lastUpdate: trackingInfo.lastUpdate ?? null,
              carrier: trackingInfo.carrier ?? pkg.carrier,
            },
          });

          for (const event of trackingInfo.events) {
            await prisma.trackingEvent.upsert({
              where: {
                packageId_timestamp: {
                  packageId: pkg.id,
                  timestamp: event.timestamp,
                },
              },
              create: {
                packageId: pkg.id,
                status: event.status,
                description: event.description,
                location: event.location ?? null,
                timestamp: event.timestamp,
              },
              update: {},
            });
          }

          await this.sendStatusNotification(pkg.user.telegramId, pkg, trackingInfo);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check packages');
    }
  }

  private async sendStatusNotification(
    telegramId: bigint,
    pkg: { trackingNumber: string; label: string | null },
    trackingInfo: { status: string | null; lastEvent: string | null; lastUpdate: Date | null }
  ): Promise<void> {
    try {
      const label = pkg.label ? ` (${pkg.label})` : '';
      const status = trackingInfo.status ?? 'Unknown';
      const lastEvent = trackingInfo.lastEvent ?? 'No event information';
      const lastUpdate = trackingInfo.lastUpdate
        ? trackingInfo.lastUpdate.toLocaleString()
        : 'Unknown';

      const message = [
        `📦 *Package Update*${label}`,
        '',
        `*Tracking:* \`${pkg.trackingNumber}\``,
        `*Status:* ${status}`,
        `*Latest Event:* ${lastEvent}`,
        `*Updated:* ${lastUpdate}`,
      ].join('\n');

      await this.bot.api.sendMessage(Number(telegramId), message, {
        parse_mode: 'Markdown',
      });

      logger.info(
        { telegramId: telegramId.toString(), trackingNumber: pkg.trackingNumber },
        'Sent status notification'
      );
    } catch (error) {
      logger.error(
        { error, telegramId: telegramId.toString(), trackingNumber: pkg.trackingNumber },
        'Failed to send notification'
      );
    }
  }
}
