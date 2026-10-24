import type { Api } from "grammy";
import { markTrackingStopped } from "../db/packages.js";
import { applyWebhookUpdate } from "./poller.js";
import { parseWebhookPayload, trackingService, verifySeventeenTrackSignature } from "./tracking.js";

export async function handleSeventeenTrackWebhook(request: Request, api: Api): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("sign") ?? "";

  if (trackingService.hasApiKey()) {
    if (!signature || !verifySeventeenTrackSignature(rawBody, signature, process.env.TRACKING_API_KEY ?? "")) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const notice = parseWebhookPayload(payload);
  if (notice.event === "TRACKING_UPDATED") {
    await applyWebhookUpdate(api, notice.result);
    return new Response("ok");
  }

  if (notice.event === "TRACKING_STOPPED") {
    await markTrackingStopped(notice.number, notice.carrierCode);
    return new Response("ok");
  }

  console.warn(`[17TRACK] Ignored webhook: ${notice.reason}`);
  return new Response("ignored");
}
