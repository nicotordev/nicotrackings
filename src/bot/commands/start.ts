import type { CommandContext, Context } from "grammy";
import { ensureUser } from "../../db/packages.js";

export async function handleStart(ctx: CommandContext<Context>) {
  const chatId = String(ctx.chat.id);

  // Ensure user is registered in database
  await ensureUser(chatId);

  const message = `
👋 <b>Welcome to NicoTrackings!</b>

I am your international package tracking assistant. I monitor packages from carriers worldwide (<b>DHL, FedEx, UPS, USPS, China Post, Correos, etc.</b>) via 17TRACK and notify you as soon as their status changes.

📋 <b>Available Commands:</b>
• <code>/track &lt;number&gt; [name]</code> - Track a new package (e.g., <code>/track RR123456789CN Keycaps</code>)
• <code>/list</code> - View all your tracked packages and current statuses
• <code>/status &lt;number&gt;</code> - Check real-time tracking details and recent events
• <code>/remove &lt;number&gt;</code> - Stop tracking a package

✨ <i>Tip: You can also simply paste any tracking number into the chat!</i>
`.trim();

  await ctx.reply(message, { parse_mode: "HTML" });
}
