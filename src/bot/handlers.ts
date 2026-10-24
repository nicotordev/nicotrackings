import { Context } from 'grammy';
import { prisma } from '../db/client.js';
import { getTrackingProvider } from '../services/tracking/index.js';
import { logger } from '../utils/logger.js';

export async function handleStart(ctx: Context): Promise<void> {
  const message = [
    '👋 *Welcome to Package Tracker Bot!*',
    '',
    'Track your packages and get notified about status changes automatically.',
    '',
    '*Available Commands:*',
    '• /track <number> [label] - Track a package',
    '• /list - View all your packages',
    '• /status <number> - Check package status',
    '• /remove <number> - Stop tracking a package',
    '• /help - Show this help message',
    '',
    'You can also send just a tracking number to register it.',
  ].join('\n');

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export async function handleHelp(ctx: Context): Promise<void> {
  const message = [
    '*📦 Package Tracker Bot - Help*',
    '',
    '*Commands:*',
    '',
    '**/track <number> [label]**',
    'Register a new package for tracking',
    'Example: `/track 1234567890 iPhone Case`',
    '',
    '**/list**',
    'Show all your tracked packages',
    '',
    '**/status <number>**',
    'Get the current status of a specific package',
    'Example: `/status 1234567890`',
    '',
    '**/remove <number>**',
    'Stop tracking a package',
    'Example: `/remove 1234567890`',
    '',
    '*Quick Track:*',
    'Send just a tracking number (without /track) to register it quickly.',
    '',
    '*Notifications:*',
    'You\'ll receive automatic notifications when your package status changes.',
  ].join('\n');

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export async function handleTrack(ctx: Context): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('❌ Unable to identify user.');
    return;
  }

  const text = ctx.message?.text || '';
  const args = text.split(/\s+/).slice(1);

  if (args.length === 0) {
    await ctx.reply('❌ Please provide a tracking number.\n\nUsage: `/track <number> [label]`', {
      parse_mode: 'Markdown',
    });
    return;
  }

  const trackingNumber = args[0];
  if (!trackingNumber) {
    await ctx.reply('❌ Invalid tracking number.');
    return;
  }

  const label = args.slice(1).join(' ') || null;

  await registerPackage(ctx, ctx.from.id, trackingNumber, label);
}

export async function handleList(ctx: Context): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('❌ Unable to identify user.');
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
      include: {
        packages: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user || user.packages.length === 0) {
      await ctx.reply('📭 You have no tracked packages.\n\nUse /track to add one!');
      return;
    }

    const packageList = user.packages.map((pkg, index) => {
      const label = pkg.label ? ` (${pkg.label})` : '';
      const status = pkg.status || 'Pending';
      const lastUpdate = pkg.lastUpdate
        ? new Date(pkg.lastUpdate).toLocaleDateString()
        : 'N/A';

      return [
        `${index + 1}. *${pkg.trackingNumber}*${label}`,
        `   Status: ${status}`,
        `   Updated: ${lastUpdate}`,
      ].join('\n');
    });

    const message = ['*📦 Your Tracked Packages*', '', ...packageList].join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error({ error, userId: ctx.from.id }, 'Failed to list packages');
    await ctx.reply('❌ Failed to retrieve your packages. Please try again later.');
  }
}

export async function handleStatus(ctx: Context): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('❌ Unable to identify user.');
    return;
  }

  const text = ctx.message?.text || '';
  const args = text.split(/\s+/).slice(1);

  if (args.length === 0) {
    await ctx.reply('❌ Please provide a tracking number.\n\nUsage: `/status <number>`', {
      parse_mode: 'Markdown',
    });
    return;
  }

  const trackingNumber = args[0];
  if (!trackingNumber) {
    await ctx.reply('❌ Invalid tracking number.');
    return;
  }

  await getPackageStatus(ctx, ctx.from.id, trackingNumber);
}

export async function handleRemove(ctx: Context): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('❌ Unable to identify user.');
    return;
  }

  const text = ctx.message?.text || '';
  const args = text.split(/\s+/).slice(1);

  if (args.length === 0) {
    await ctx.reply('❌ Please provide a tracking number.\n\nUsage: `/remove <number>`', {
      parse_mode: 'Markdown',
    });
    return;
  }

  const trackingNumber = args[0];
  if (!trackingNumber) {
    await ctx.reply('❌ Invalid tracking number.');
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
    });

    if (!user) {
      await ctx.reply('❌ You have no tracked packages.');
      return;
    }

    const result = await prisma.package.deleteMany({
      where: {
        userId: user.id,
        trackingNumber,
      },
    });

    if (result.count === 0) {
      await ctx.reply(`❌ Package \`${trackingNumber}\` not found in your tracked packages.`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    await ctx.reply(`✅ Stopped tracking package \`${trackingNumber}\``, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    logger.error({ error, userId: ctx.from.id, trackingNumber }, 'Failed to remove package');
    await ctx.reply('❌ Failed to remove package. Please try again later.');
  }
}

export async function handleTrackingNumber(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.message?.text) {
    return;
  }

  const text = ctx.message.text.trim();
  const trackingNumberRegex = /^[A-Z0-9]{8,30}$/i;

  if (trackingNumberRegex.test(text)) {
    await registerPackage(ctx, ctx.from.id, text, null);
  }
}

async function registerPackage(
  ctx: Context,
  userId: number,
  trackingNumber: string,
  label: string | null
): Promise<void> {
  const statusMessage = await ctx.reply('⏳ Registering package...');

  try {
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(userId) },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(userId),
          username: ctx.from?.username ?? null,
          firstName: ctx.from?.first_name ?? null,
          lastName: ctx.from?.last_name ?? null,
        },
      });
      logger.info({ userId, telegramId: userId }, 'Created new user');
    }

    const existing = await prisma.package.findUnique({
      where: {
        userId_trackingNumber: {
          userId: user.id,
          trackingNumber,
        },
      },
    });

    if (existing) {
      await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        `ℹ️ You are already tracking package \`${trackingNumber}\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const provider = getTrackingProvider();
    const registerResult = await provider.register({ trackingNumber, carrier: null });

    if (!registerResult.success) {
      await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        `❌ Failed to register package: ${registerResult.error ?? 'Unknown error'}`
      );
      return;
    }

    const trackingInfo = await provider.getTrackingInfo(trackingNumber);

    const pkg = await prisma.package.create({
      data: {
        trackingNumber,
        carrier: registerResult.carrier ?? null,
        label,
        status: trackingInfo?.status ?? null,
        lastEvent: trackingInfo?.lastEvent ?? null,
        lastUpdate: trackingInfo?.lastUpdate ?? null,
        userId: user.id,
      },
    });

    if (trackingInfo?.events) {
      for (const event of trackingInfo.events) {
        await prisma.trackingEvent.create({
          data: {
            packageId: pkg.id,
            status: event.status,
            description: event.description,
            location: event.location ?? null,
            timestamp: event.timestamp,
          },
        });
      }
    }

    const labelText = label ? ` as "${label}"` : '';
    const statusText = trackingInfo && trackingInfo.status ? `\nCurrent status: ${trackingInfo.status}` : '';

    await ctx.api.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      `✅ Now tracking \`${trackingNumber}\`${labelText}${statusText}`,
      { parse_mode: 'Markdown' }
    );

    logger.info({ userId, trackingNumber, label }, 'Registered new package');
  } catch (error) {
    logger.error({ error, userId, trackingNumber }, 'Failed to register package');
    await ctx.api.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      '❌ Failed to register package. Please try again later.'
    );
  }
}

async function getPackageStatus(
  ctx: Context,
  userId: number,
  trackingNumber: string
): Promise<void> {
  const statusMessage = await ctx.reply('⏳ Fetching package status...');

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(userId) },
    });

    if (!user) {
      await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        '❌ You have no tracked packages.'
      );
      return;
    }

    const pkg = await prisma.package.findUnique({
      where: {
        userId_trackingNumber: {
          userId: user.id,
          trackingNumber,
        },
      },
      include: {
        events: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
    });

    if (!pkg) {
      await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        `❌ Package \`${trackingNumber}\` not found in your tracked packages.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const provider = getTrackingProvider();
    const trackingInfo = await provider.getTrackingInfo(trackingNumber);

    if (!trackingInfo) {
      await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        `❌ Unable to fetch current status for \`${trackingNumber}\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await prisma.package.update({
      where: { id: pkg.id },
      data: {
        status: trackingInfo.status ?? null,
        lastEvent: trackingInfo.lastEvent ?? null,
        lastUpdate: trackingInfo.lastUpdate ?? null,
        carrier: trackingInfo.carrier ?? pkg.carrier,
      },
    });

    const label = pkg.label ? ` (${pkg.label})` : '';
    const status = trackingInfo.status ?? 'Unknown';
    const lastEvent = trackingInfo.lastEvent ?? 'No event information';
    const lastUpdate = trackingInfo.lastUpdate
      ? trackingInfo.lastUpdate.toLocaleString()
      : 'Unknown';

    const recentEvents = trackingInfo.events.slice(0, 5).map((event, index) => {
      const location = event.location ? ` - ${event.location}` : '';
      return `${index + 1}. ${event.timestamp.toLocaleString()}${location}\n   ${event.description}`;
    });

    const eventsText =
      recentEvents.length > 0
        ? '\n\n*Recent Events:*\n' + recentEvents.join('\n\n')
        : '';

    const message = [
      `*📦 Package Status*${label}`,
      '',
      `*Tracking:* \`${trackingNumber}\``,
      `*Status:* ${status}`,
      `*Latest Event:* ${lastEvent}`,
      `*Updated:* ${lastUpdate}`,
      eventsText,
    ].join('\n');

    await ctx.api.editMessageText(statusMessage.chat.id, statusMessage.message_id, message, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    logger.error({ error, userId, trackingNumber }, 'Failed to get package status');
    await ctx.api.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      '❌ Failed to fetch package status. Please try again later.'
    );
  }
}
