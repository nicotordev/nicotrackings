import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PARCELS_BASE_URL = "https://parcelsapp.com/api/v4";
export const PARCELS_BATCH_LIMIT = 10;

export const PACKAGE_STATUSES = [
  "Pending",
  "NotFound",
  "InfoReceived",
  "InTransit",
  "Expired",
  "AvailableForPickup",
  "OutForDelivery",
  "DeliveryFailure",
  "Delivered",
  "Exception",
] as const;

export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export interface TrackingEvent {
  date?: string;
  timeUtc?: Date;
  description: string;
  location?: string;
  stage?: string;
  subStatus?: string;
  country?: string;
  city?: string;
  providerKey?: number;
  providerName?: string;
}

export interface TrackingMilestone {
  keyStage: string;
  timeUtc?: Date;
  timeIso?: string;
}

export interface TrackingResult {
  trackingNumber: string;
  carrier?: string;
  carrierCode?: number;
  status: PackageStatus;
  subStatus?: string;
  subStatusDescr?: string;
  lastEvent?: string;
  lastEventLocation?: string;
  lastUpdate?: Date;
  originCountry?: string;
  destinationCountry?: string;
  serviceType?: string;
  weightRaw?: string;
  pieces?: string;
  events: TrackingEvent[];
  milestones: TrackingMilestone[];
  eventsHash?: number;
  requestId?: string;
  webhookSecret?: string;
  /** Carrier check is still running. Do not replace a known status with Pending. */
  refreshOnly?: boolean;
  errorCode?: number;
}

export interface TrackQuery {
  number: string;
  destinationCountry?: string;
  carrier?: number;
}

export class ParcelsApiError extends Error {
  readonly code: string | number | undefined;

  constructor(message: string, code?: string | number) {
    super(message);
    this.name = "ParcelsApiError";
    this.code = code;
  }
}

const nullableString = z.string().nullable().optional();

const eventSchema = z
  .object({
    state: nullableString,
    location: nullableString,
    date: nullableString,
  })
  .loose();

const shipmentSchema = z
  .object({
    trackingId: nullableString,
    status: nullableString,
    error: nullableString,
    origin: nullableString,
    destination: nullableString,
    originCode: nullableString,
    destinationCode: nullableString,
    transportMode: nullableString,
    pieces: z.number().nullable().optional(),
    weight: z.number().nullable().optional(),
    weight_unit: nullableString,
    states: z.array(eventSchema).nullable().optional(),
    detectedCarrier: z
      .object({ slug: nullableString, name: nullableString })
      .loose()
      .nullable()
      .optional(),
    services: z
      .array(z.object({ slug: nullableString, name: nullableString }).loose())
      .nullable()
      .optional(),
  })
  .loose();

const resultSchema = z
  .object({
    tracking_number: z.string(),
    state: z.string().optional(),
    from_cache: z.boolean().optional(),
    shipment: shipmentSchema.nullable().optional(),
  })
  .loose();

const responseSchema = z
  .object({
    request_id: z.string().optional(),
    status: z.string().optional(),
    done: z.boolean().optional(),
    results: z.array(resultSchema).optional(),
    rejected: z
      .array(
        z
          .object({
            tracking_number: nullableString,
            code: nullableString,
            message: nullableString,
          })
          .loose(),
      )
      .optional(),
    webhook: z
      .object({
        secret: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
    error: z
      .object({
        code: nullableString,
        message: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

const webhookSchema = z
  .object({
    event: z.string(),
    request_id: z.string().optional(),
    done: z.boolean().optional(),
    result: resultSchema.optional(),
    results: z.array(resultSchema).optional(),
  })
  .loose();

export function parcelsApiKey(): string {
  const key = process.env.PARCELS_API_KEY ?? process.env.TRACKING_API_KEY ?? "";
  if (!key.trim() || key.includes("your_")) return "";
  return key.trim();
}

export function parcelsWebhookUrl(): string | undefined {
  const explicit = process.env.PARCELS_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (!domain) return undefined;
  return `https://${domain}/webhooks/parcels`;
}

export function verifyParcelsSignature(rawBody: string, header: string, secret: string, nowMs = Date.now()): boolean {
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const index = piece.indexOf("=");
    if (index <= 0) continue;
    parts.set(piece.slice(0, index).trim(), piece.slice(index + 1).trim());
  }
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  const ageMs = Math.abs(nowMs - Number(timestamp) * 1000);
  if (ageMs > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature.toLowerCase(), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function toPackageStatus(value: string): PackageStatus {
  for (const status of PACKAGE_STATUSES) {
    if (status === value) return status;
  }
  return "Pending";
}

export function mapCarrierStatus(raw: string | null | undefined): PackageStatus {
  const status = (raw ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!status || status === "pending" || status === "processing") return "Pending";
  if (status.includes("out_for_delivery") || status.includes("outfordelivery")) return "OutForDelivery";
  if (status.includes("fail") || status.includes("undeliver")) return "DeliveryFailure";
  if (status.includes("deliver")) return "Delivered";
  if (status.includes("pickup") || status.includes("pick_up")) return "AvailableForPickup";
  if (status.includes("exception") || status.includes("alert")) return "Exception";
  if (status.includes("expired")) return "Expired";
  if (status.includes("not_found") || status.includes("notfound")) return "NotFound";
  if (status.includes("info") || status.includes("received") || status.includes("accepted")) return "InfoReceived";
  if (status.includes("transit") || status.includes("depart") || status.includes("arriv")) return "InTransit";
  return "InTransit";
}

function clean(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function parseDate(value: string | null | undefined): Date | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return hash;
}

export function shipmentToResult(
  trackingNumber: string,
  shipment: z.infer<typeof shipmentSchema> | null | undefined,
  meta?: { requestId?: string; webhookSecret?: string; destinationCountry?: string },
): TrackingResult {
  const error = clean(shipment?.error);
  if (error) {
    return {
      trackingNumber,
      status: "Exception",
      lastEvent: error,
      events: [],
      milestones: [],
      ...(meta?.requestId ? { requestId: meta.requestId } : {}),
      ...(meta?.webhookSecret ? { webhookSecret: meta.webhookSecret } : {}),
      ...(meta?.destinationCountry ? { destinationCountry: meta.destinationCountry } : {}),
    };
  }

  const events: TrackingEvent[] = [];
  for (const state of shipment?.states ?? []) {
    const description = clean(state.state);
    if (!description) continue;
    const timeUtc = parseDate(state.date);
    events.push({
      description,
      ...(clean(state.date) ? { date: clean(state.date) } : {}),
      ...(timeUtc ? { timeUtc } : {}),
      ...(clean(state.location) ? { location: clean(state.location) } : {}),
    });
  }

  const latest = events[0];
  const carrier = clean(shipment?.detectedCarrier?.name) ?? clean(shipment?.services?.[0]?.name);
  const status = mapCarrierStatus(shipment?.status);
  const weightUnit = clean(shipment?.weight_unit);
  const weightRaw = typeof shipment?.weight === "number" ? `${shipment.weight}${weightUnit ? ` ${weightUnit}` : ""}` : undefined;
  const pieces = typeof shipment?.pieces === "number" ? String(shipment.pieces) : undefined;
  const serviceType = clean(shipment?.transportMode);
  const fingerprint = `${status}|${latest?.description ?? ""}|${latest?.date ?? ""}`;
  return {
    trackingNumber,
    status,
    ...(carrier ? { carrier } : {}),
    ...(latest?.description ? { lastEvent: latest.description } : {}),
    ...(latest?.location ? { lastEventLocation: latest.location } : {}),
    ...(latest?.timeUtc ? { lastUpdate: latest.timeUtc } : {}),
    ...(clean(shipment?.originCode) || clean(shipment?.origin)
      ? { originCountry: clean(shipment?.originCode) ?? clean(shipment?.origin) }
      : {}),
    ...(clean(shipment?.destinationCode) || clean(shipment?.destination) || meta?.destinationCountry
      ? {
          destinationCountry:
            clean(shipment?.destinationCode) ?? clean(shipment?.destination) ?? meta?.destinationCountry,
        }
      : {}),
    ...(serviceType ? { serviceType } : {}),
    ...(weightRaw ? { weightRaw } : {}),
    ...(pieces ? { pieces } : {}),
    events,
    milestones: [],
    eventsHash: hashText(fingerprint),
    ...(meta?.requestId ? { requestId: meta.requestId } : {}),
    ...(meta?.webhookSecret ? { webhookSecret: meta.webhookSecret } : {}),
  };
}

export function parseParcelsWebhook(input: unknown): { requestId?: string; results: TrackingResult[] } {
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return { results: [] };
  const rows = parsed.data.results ?? (parsed.data.result ? [parsed.data.result] : []);
  const requestId = parsed.data.request_id;
  return {
    ...(requestId ? { requestId } : {}),
    results: rows.flatMap((row) => {
      if (row.state === "processing" || !row.shipment) return [];
      return [shipmentToResult(row.tracking_number, row.shipment, requestId ? { requestId } : undefined)];
    }),
  };
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ParcelsService {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(apiKey?: string, fetchImpl: FetchLike = fetch) {
    this.apiKey = (apiKey ?? parcelsApiKey()).trim();
    this.fetchImpl = fetchImpl;
  }

  hasApiKey(): boolean {
    return this.apiKey.length > 0 && !this.apiKey.startsWith("your_");
  }

  async getTracking(trackingNumber: string, destinationCountry?: string): Promise<TrackingResult> {
    const batch = await this.getBatchTracking([
      { number: trackingNumber, ...(destinationCountry ? { destinationCountry } : {}) },
    ]);
    return (
      batch.get(trackingNumber.trim()) ?? {
        trackingNumber: trackingNumber.trim(),
        status: "Pending",
        lastEvent: "Parcels has not returned a status yet.",
        events: [],
        milestones: [],
      }
    );
  }

  async getBatchTracking(queries: readonly TrackQuery[]): Promise<Map<string, TrackingResult>> {
    const results = new Map<string, TrackingResult>();
    const unique = new Map<string, TrackQuery>();
    for (const query of queries) {
      const number = query.number.trim();
      if (!number) continue;
      unique.set(number, { number, ...(query.destinationCountry ? { destinationCountry: query.destinationCountry } : {}) });
    }
    if (unique.size === 0 || !this.hasApiKey()) return results;

    const list = [...unique.values()];
    const webhookUrl = parcelsWebhookUrl();
    for (let offset = 0; offset < list.length; offset += PARCELS_BATCH_LIMIT) {
      const chunk = list.slice(offset, offset + PARCELS_BATCH_LIMIT);
      const body = await this.postTrackings(chunk, webhookUrl);
      const requestId = body.request_id;
      const secret = clean(body.webhook?.secret);
      const meta = {
        ...(requestId ? { requestId } : {}),
        ...(secret ? { webhookSecret: secret } : {}),
      };
      for (const row of body.results ?? []) {
        const destinationCountry = chunk.find((item) => item.number === row.tracking_number)?.destinationCountry;
        if (row.state === "processing" || !row.shipment) {
          results.set(row.tracking_number, {
            trackingNumber: row.tracking_number,
            status: "Pending",
            lastEvent: "Parcels is still checking this number.",
            events: [],
            milestones: [],
            refreshOnly: true,
            ...(destinationCountry ? { destinationCountry } : {}),
            ...meta,
          });
          continue;
        }
        results.set(
          row.tracking_number,
          shipmentToResult(row.tracking_number, row.shipment, { ...meta, ...(destinationCountry ? { destinationCountry } : {}) }),
        );
      }
      for (const rejected of body.rejected ?? []) {
        const number = clean(rejected.tracking_number);
        if (!number) continue;
        results.set(number, {
          trackingNumber: number,
          status: "NotFound",
          lastEvent: clean(rejected.message) ?? clean(rejected.code) ?? "Parcels rejected this tracking number.",
          events: [],
          milestones: [],
          ...meta,
        });
      }
    }
    return results;
  }

  private async postTrackings(queries: readonly TrackQuery[], webhookUrl?: string): Promise<z.infer<typeof responseSchema>> {
    const response = await this.fetchImpl(`${PARCELS_BASE_URL}/trackings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: "en",
        ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
        shipments: queries.map((query) => ({
          tracking_number: query.number,
          ...(query.destinationCountry ? { destination_country: query.destinationCountry } : {}),
        })),
      }),
      signal: AbortSignal.timeout(25_000),
    });

    const json: unknown = await response.json().catch(() => null);
    const parsed = responseSchema.safeParse(json);
    if (!response.ok) {
      const message = parsed.success
        ? (clean(parsed.data.error?.message) ?? `Parcels returned HTTP ${response.status}.`)
        : `Parcels returned HTTP ${response.status}.`;
      const code = parsed.success ? clean(parsed.data.error?.code) : undefined;
      throw new ParcelsApiError(message, code ?? response.status);
    }
    if (!parsed.success) throw new ParcelsApiError("Parcels returned an unexpected payload.");
    return parsed.data;
  }
}

export const trackingService = new ParcelsService();
export default trackingService;
