import type { CommandContext, Context } from "grammy";
import { listPackagesForChat } from "../../db/packages.js";
import { formatPackageList } from "../../services/notifier.js";

export async function handleList(ctx: CommandContext<Context>) {
  const chatId = String(ctx.chat.id);

  const packages = await listPackagesForChat(chatId);
  const message = formatPackageList(packages);

  await ctx.reply(message, { parse_mode: "HTML" });
}
