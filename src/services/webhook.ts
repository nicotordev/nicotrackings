import type { Api } from "grammy";
import { packagesForRequest } from "../db/packages.js";
import { applyWebhookUpdate } from "./poller.js";
import { parseParcelsWebhook, verifyParcelsSignature } from "./tracking.js";

export async function handleParcelsWebhook(request: Request, api: Api): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("Parcels-Signature") ?? request.headers.get("parcels-signature") ?? "";

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const notice = parseParcelsWebhook(payload);
  const stored = notice.requestId ? await packagesForRequest(notice.requestId) : [];
  const secret = stored.find((row) => row.webhookSecret)?.webhookSecret;
  if (secret && !verifyParcelsSignature(rawBody, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  for (const result of notice.results) {
    if (secret) result.webhookSecret = secret;
    if (notice.requestId) result.requestId = notice.requestId;
    await applyWebhookUpdate(api, result);
  }
  return new Response("ok");
}
