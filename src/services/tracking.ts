import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SEVENTEEN_TRACK_BASE_URL = "https://api.17track.net/track/v2.4";
export const SEVENTEEN_TRACK_BATCH_LIMIT = 40;

export const SeventeenTrackErrorCode = {
  InvalidFormat: -18010012,
  AlreadyRegistered: -18019901,
  NotRegistered: -18019902,
  CarrierNotDetected: -18019903,
  QuotaExceeded: -18019908,
  NoTrackingInfo: -18019909,
} as const;

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
export type MainStatus = Exclude<PackageStatus, "Pending">;

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
  finalCarrierCode?: number;
  status: PackageStatus;
  subStatus?: string;
  subStatusDescr?: string;
  lastEvent?: string;
  lastEventLocation?: string;
  lastUpdate?: Date;
  originCountry?: string;
  destinationCountry?: string;
  destinationCity?: string;
  destinationPostalCode?: string;
  shipDate?: string;
  estimatedFrom?: Date;
  estimatedTo?: Date;
  daysOfTransit?: number;
  daysAfterLastUpdate?: number;
  serviceType?: string;
  weightRaw?: string;
  pieces?: string;
  localNumber?: string;
  localProvider?: string;
  providerTips?: string;
  eventsHash?: number;
  events: TrackingEvent[];
  milestones: TrackingMilestone[];
  errorCode?: number;
  raw?: unknown;
}

export interface TrackQuery {
  number: string;
  carrier?: number;
}

export interface RegisterInput {
  number: string;
  carrier?: number;
  finalCarrier?: number;
  lang?: string;
  tag?: string;
  email?: string;
  orderNo?: string;
  originCountry?: string;
  destinationCountry?: string;
  destinationPostalCode?: string;
  destinationCity?: string;
  shipDate?: string;
  phoneNumber?: string;
  phoneNumberLast4?: string;
  remark?: string;
}

export interface RegisterResult {
  ok: boolean;
  number: string;
  carrierCode?: number;
  alreadyRegistered: boolean;
  errorCode?: number;
  message?: string;
}

export type WebhookNotice =
  | { event: "TRACKING_UPDATED"; result: TrackingResult }
  | { event: "TRACKING_STOPPED"; number: string; carrierCode?: number }
  | { event: "IGNORED"; reason: string };

export class SeventeenTrackApiError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "SeventeenTrackApiError";
    this.code = code;
  }
}

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const addressSchema = z
  .object({
    country: nullableString,
    state: nullableString,
    city: nullableString,
    street: nullableString,
    postal_code: nullableString,
  })
  .loose();

const eventSchema = z
  .object({
    time_iso: nullableString,
    time_utc: nullableString,
    description: nullableString,
    description_translation: z
      .object({
        lang: nullableString,
        description: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
    location: nullableString,
    stage: nullableString,
    sub_status: nullableString,
    address: addressSchema.nullable().optional(),
  })
  .loose();

const providerSchema = z
  .object({
    provider: z
      .object({
        key: z.union([z.number(), z.string()]).nullable().optional(),
        name: nullableString,
        alias: nullableString,
        homepage: nullableString,
        country: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
    provider_tips: nullableString,
    events_hash: nullableNumber,
    events: z.array(eventSchema).nullable().optional(),
    latest_sync_status: nullableString,
  })
  .loose();

const trackInfoSchema = z
  .object({
    shipping_info: z
      .object({
        shipper_address: addressSchema.nullable().optional(),
        recipient_address: addressSchema.nullable().optional(),
      })
      .loose()
      .nullable()
      .optional(),
    latest_status: z
      .object({
        status: nullableString,
        sub_status: nullableString,
        sub_status_descr: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
    latest_event: eventSchema.nullable().optional(),
    time_metrics: z
      .object({
        days_of_transit: nullableNumber,
        days_after_last_update: nullableNumber,
        estimated_delivery_date: z
          .object({
            from: nullableString,
            to: nullableString,
          })
          .loose()
          .nullable()
          .optional(),
      })
      .loose()
      .nullable()
      .optional(),
    milestone: z
      .array(
        z
          .object({
            key_stage: nullableString,
            time_iso: nullableString,
            time_utc: nullableString,
          })
          .loose(),
      )
      .nullable()
      .optional(),
    misc_info: z
      .object({
        service_type: nullableString,
        weight_raw: nullableString,
        pieces: nullableString,
        local_number: nullableString,
        local_provider: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
    tracking: z
      .object({
        providers: z.array(providerSchema).nullable().optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

const acceptedItemSchema = z
  .object({
    number: z.string(),
    carrier: z.union([z.number(), z.string()]).nullable().optional(),
    tag: nullableString,
    destination_postal_code: nullableString,
    origin_country: nullableString,
    destination_country: nullableString,
    destination_city: nullableString,
    ship_date: nullableString,
    track_info: trackInfoSchema.nullable().optional(),
  })
  .loose();

const rejectedItemSchema = z
  .object({
    number: z.string(),
    carrier: z.union([z.number(), z.string()]).nullable().optional(),
    error: z
      .object({
        code: z.number().optional(),
        message: nullableString,
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

const envelopeSchema = z
  .object({
    code: z.number(),
    data: z
      .object({
        accepted: z.array(z.unknown()).optional(),
        rejected: z.array(z.unknown()).optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

const webhookSchema = z
  .object({
    event: z.string(),
    data: z.unknown().optional(),
  })
  .loose();

const MAIN_STATUS_SET = new Set<string>(PACKAGE_STATUSES.filter((status) => status !== "Pending"));

export function isMainStatus(value: string): value is MainStatus {
  return MAIN_STATUS_SET.has(value);
}

export function toPackageStatus(value: string | null | undefined): PackageStatus {
  if (value && isMainStatus(value)) return value;
  return "Pending";
}

export function signSeventeenTrackBody(rawBody: string, apiKey: string): string {
  return createHash("sha256").update(`${rawBody}/${apiKey}`, "utf8").digest("hex");
}

export function verifySeventeenTrackSignature(rawBody: string, signature: string, apiKey: string): boolean {
  const expected = signSeventeenTrackBody(rawBody, apiKey);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function cleanText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function parseCarrier(value: number | string | null | undefined): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return undefined;
}

function parseDate(value: string | null | undefined): Date | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toInt32(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isInteger(value)) return undefined;
  if (value > 2_147_483_647 || value < -2_147_483_648) return undefined;
  return value;
}

function eventDescription(event: z.infer<typeof eventSchema>): string | undefined {
  return cleanText(event.description_translation?.description) ?? cleanText(event.description);
}

function toTrackingEvent(
  event: z.infer<typeof eventSchema>,
  provider?: { key?: number; name?: string },
): TrackingEvent | undefined {
  const description = eventDescription(event) ?? cleanText(event.sub_status) ?? cleanText(event.stage);
  if (!description) return undefined;
  const timeUtc = parseDate(event.time_utc) ?? parseDate(event.time_iso);
  return {
    date: cleanText(event.time_iso) ?? timeUtc?.toISOString(),
    ...(timeUtc ? { timeUtc } : {}),
    description,
    ...(cleanText(event.location) ? { location: cleanText(event.location) } : {}),
    ...(cleanText(event.stage) ? { stage: cleanText(event.stage) } : {}),
    ...(cleanText(event.sub_status) ? { subStatus: cleanText(event.sub_status) } : {}),
    ...(cleanText(event.address?.country) ? { country: cleanText(event.address?.country) } : {}),
    ...(cleanText(event.address?.city) ? { city: cleanText(event.address?.city) } : {}),
    ...(provider?.key != null ? { providerKey: provider.key } : {}),
    ...(provider?.name ? { providerName: provider.name } : {}),
  };
}

export function parseAcceptedTrackItem(input: unknown): TrackingResult | undefined {
  const parsed = acceptedItemSchema.safeParse(input);
  if (!parsed.success) return undefined;

  const item = parsed.data;
  const info = item.track_info;
  const providers = info?.tracking?.providers ?? [];
  const events: TrackingEvent[] = [];
  let providerTips: string | undefined;
  let eventsHash: number | undefined;
  let carrierName: string | undefined;

  for (const provider of providers) {
    const key = parseCarrier(provider.provider?.key);
    const name = cleanText(provider.provider?.name) ?? cleanText(provider.provider?.alias);
    if (!carrierName && name) carrierName = name;
    providerTips ??= cleanText(provider.provider_tips);
    eventsHash ??= toInt32(provider.events_hash);
    for (const event of provider.events ?? []) {
      const mapped = toTrackingEvent(event, {
        ...(key != null ? { key } : {}),
        ...(name ? { name } : {}),
      });
      if (mapped) events.push(mapped);
    }
  }

  events.sort((left, right) => {
    const leftTime = left.timeUtc?.getTime() ?? 0;
    const rightTime = right.timeUtc?.getTime() ?? 0;
    return rightTime - leftTime;
  });

  const latest = info?.latest_event ? toTrackingEvent(info.latest_event) : undefined;
  const status = toPackageStatus(info?.latest_status?.status);
  const metrics = info?.time_metrics;
  const misc = info?.misc_info;
  const milestones: TrackingMilestone[] = [];
  for (const milestone of info?.milestone ?? []) {
    const keyStage = cleanText(milestone.key_stage);
    if (!keyStage) continue;
    const timeUtc = parseDate(milestone.time_utc) ?? parseDate(milestone.time_iso);
    milestones.push({
      keyStage,
      ...(timeUtc ? { timeUtc } : {}),
      ...(cleanText(milestone.time_iso) ? { timeIso: cleanText(milestone.time_iso) } : {}),
    });
  }

  const carrierCode = parseCarrier(item.carrier);
  return {
    trackingNumber: item.number.trim(),
    ...(carrierName ? { carrier: carrierName } : {}),
    ...(carrierCode != null ? { carrierCode } : {}),
    status: info?.latest_status?.status ? status : "NotFound",
    ...(cleanText(info?.latest_status?.sub_status)
      ? { subStatus: cleanText(info?.latest_status?.sub_status) }
      : {}),
    ...(cleanText(info?.latest_status?.sub_status_descr)
      ? { subStatusDescr: cleanText(info?.latest_status?.sub_status_descr) }
      : {}),
    ...(latest?.description ? { lastEvent: latest.description } : {}),
    ...(latest?.location ? { lastEventLocation: latest.location } : {}),
    ...(latest?.timeUtc ? { lastUpdate: latest.timeUtc } : {}),
    ...(cleanText(info?.shipping_info?.shipper_address?.country) || cleanText(item.origin_country)
      ? {
          originCountry:
            cleanText(info?.shipping_info?.shipper_address?.country) ?? cleanText(item.origin_country),
        }
      : {}),
    ...(cleanText(info?.shipping_info?.recipient_address?.country) || cleanText(item.destination_country)
      ? {
          destinationCountry:
            cleanText(info?.shipping_info?.recipient_address?.country) ?? cleanText(item.destination_country),
        }
      : {}),
    ...(cleanText(info?.shipping_info?.recipient_address?.city) || cleanText(item.destination_city)
      ? {
          destinationCity:
            cleanText(info?.shipping_info?.recipient_address?.city) ?? cleanText(item.destination_city),
        }
      : {}),
    ...(cleanText(item.destination_postal_code)
      ? { destinationPostalCode: cleanText(item.destination_postal_code) }
      : {}),
    ...(cleanText(item.ship_date) ? { shipDate: cleanText(item.ship_date) } : {}),
    ...(parseDate(metrics?.estimated_delivery_date?.from)
      ? { estimatedFrom: parseDate(metrics?.estimated_delivery_date?.from) }
      : {}),
    ...(parseDate(metrics?.estimated_delivery_date?.to)
      ? { estimatedTo: parseDate(metrics?.estimated_delivery_date?.to) }
      : {}),
    ...(toInt32(metrics?.days_of_transit) != null ? { daysOfTransit: toInt32(metrics?.days_of_transit) } : {}),
    ...(toInt32(metrics?.days_after_last_update) != null
      ? { daysAfterLastUpdate: toInt32(metrics?.days_after_last_update) }
      : {}),
    ...(cleanText(misc?.service_type) ? { serviceType: cleanText(misc?.service_type) } : {}),
    ...(cleanText(misc?.weight_raw) ? { weightRaw: cleanText(misc?.weight_raw) } : {}),
    ...(cleanText(misc?.pieces) ? { pieces: cleanText(misc?.pieces) } : {}),
    ...(cleanText(misc?.local_number) ? { localNumber: cleanText(misc?.local_number) } : {}),
    ...(cleanText(misc?.local_provider) ? { localProvider: cleanText(misc?.local_provider) } : {}),
    ...(providerTips ? { providerTips } : {}),
    ...(eventsHash != null ? { eventsHash } : {}),
    events,
    milestones,
    raw: input,
  };
}

export function parseWebhookPayload(input: unknown): WebhookNotice {
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return { event: "IGNORED", reason: "Unrecognized webhook body." };

  if (parsed.data.event === "TRACKING_STOPPED") {
    const data = z
      .object({
        number: z.string(),
        carrier: z.union([z.number(), z.string()]).nullable().optional(),
      })
      .loose()
      .safeParse(parsed.data.data);
    if (!data.success) return { event: "IGNORED", reason: "TRACKING_STOPPED is missing a tracking number." };
    const carrierCode = parseCarrier(data.data.carrier);
    return {
      event: "TRACKING_STOPPED",
      number: data.data.number.trim(),
      ...(carrierCode != null ? { carrierCode } : {}),
    };
  }

  if (parsed.data.event === "TRACKING_UPDATED") {
    const result = parseAcceptedTrackItem(parsed.data.data);
    if (!result) return { event: "IGNORED", reason: "TRACKING_UPDATED could not be parsed." };
    return { event: "TRACKING_UPDATED", result };
  }

  return { event: "IGNORED", reason: `Unsupported webhook event ${parsed.data.event}.` };
}

function mockResult(number: string): TrackingResult {
  const now = new Date();
  return {
    trackingNumber: number,
    status: "InTransit",
    subStatus: "InTransit_Other",
    carrier: "Mock Carrier",
    lastEvent: "Package in transit to distribution hub (Sandbox / Missing TRACKING_API_KEY)",
    lastEventLocation: "International Sorting Hub",
    lastUpdate: now,
    events: [
      {
        date: now.toISOString(),
        timeUtc: now,
        description: "Package received at international sorting facility",
        location: "International Sorting Hub",
        stage: "InTransit",
        subStatus: "InTransit_Other",
      },
    ],
    milestones: [{ keyStage: "InfoReceived", timeUtc: now, timeIso: now.toISOString() }],
  };
}

function rejectedResult(item: z.infer<typeof rejectedItemSchema>): TrackingResult {
  const carrierCode = parseCarrier(item.carrier);
  return {
    trackingNumber: item.number.trim(),
    status: "NotFound",
    ...(carrierCode != null ? { carrierCode } : {}),
    ...(item.error?.code != null ? { errorCode: item.error.code } : {}),
    lastEvent: cleanText(item.error?.message) ?? "Tracking number not found or not yet registered",
    lastUpdate: new Date(),
    events: [],
    milestones: [],
  };
}

export interface ITrackingProvider {
  register(input: string | RegisterInput, carrierCode?: number): Promise<RegisterResult>;
  getTracking(trackingNumber: string, carrierCode?: number): Promise<TrackingResult>;
  getBatchTracking(queries: readonly (string | TrackQuery)[]): Promise<Map<string, TrackingResult>>;
  stopTracking(number: string, carrierCode?: number): Promise<boolean>;
  deleteTracking(number: string, carrierCode?: number): Promise<boolean>;
}

export function trackKey(number: string, carrierCode?: number): string {
  return carrierCode == null ? number : `${number}#${carrierCode}`;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class SeventeenTrackService implements ITrackingProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(apiKey?: string, fetchImpl: FetchLike = fetch) {
    this.apiKey = apiKey ?? process.env.TRACKING_API_KEY ?? "";
    this.fetchImpl = fetchImpl;
  }

  hasApiKey(): boolean {
    return Boolean(this.apiKey.trim().length > 0 && !this.apiKey.startsWith("your_"));
  }

  async register(input: string | RegisterInput, carrierCode?: number): Promise<RegisterResult> {
    const request = typeof input === "string" ? { number: input, ...(carrierCode != null ? { carrier: carrierCode } : {}) } : input;
    const number = request.number.trim();
    if (!this.hasApiKey()) {
      console.warn(`[17TRACK] TRACKING_API_KEY is not configured. Mock registration for ${number}`);
      return { ok: true, number, alreadyRegistered: false, ...(request.carrier != null ? { carrierCode: request.carrier } : {}) };
    }

    const payload = this.registerPayload({ ...request, number });
    const envelope = await this.post("/register", [payload]);
    const accepted = envelope.data?.accepted?.[0];
    const acceptedParsed = accepted ? acceptedItemSchema.safeParse(accepted) : undefined;
    if (acceptedParsed?.success) {
      const detected = parseCarrier(acceptedParsed.data.carrier);
      return {
        ok: true,
        number: acceptedParsed.data.number.trim(),
        alreadyRegistered: false,
        ...(detected != null ? { carrierCode: detected } : {}),
      };
    }

    const rejected = envelope.data?.rejected?.[0];
    const rejectedParsed = rejected ? rejectedItemSchema.safeParse(rejected) : undefined;
    if (rejectedParsed?.success) {
      const errorCode = rejectedParsed.data.error?.code;
      if (errorCode === SeventeenTrackErrorCode.AlreadyRegistered) {
        const detected = parseCarrier(rejectedParsed.data.carrier) ?? request.carrier;
        return {
          ok: true,
          number,
          alreadyRegistered: true,
          ...(detected != null ? { carrierCode: detected } : {}),
          ...(errorCode != null ? { errorCode } : {}),
        };
      }
      return {
        ok: false,
        number,
        alreadyRegistered: false,
        ...(errorCode != null ? { errorCode } : {}),
        message: cleanText(rejectedParsed.data.error?.message) ?? "17TRACK rejected this tracking number.",
      };
    }

    return { ok: envelope.code === 0, number, alreadyRegistered: false };
  }

  async getTracking(trackingNumber: string, carrierCode?: number): Promise<TrackingResult> {
    const batch = await this.getBatchTracking([
      { number: trackingNumber.trim(), ...(carrierCode != null ? { carrier: carrierCode } : {}) },
    ]);
    return (
      batch.get(trackKey(trackingNumber.trim(), carrierCode)) ??
      batch.get(trackingNumber.trim()) ?? {
        trackingNumber: trackingNumber.trim(),
        status: "NotFound",
        lastEvent: "No information received yet from the carrier network.",
        lastUpdate: new Date(),
        events: [],
        milestones: [],
      }
    );
  }

  async getBatchTracking(queries: readonly (string | TrackQuery)[]): Promise<Map<string, TrackingResult>> {
    const results = new Map<string, TrackingResult>();
    const unique = new Map<string, TrackQuery>();
    for (const entry of queries) {
      const query = typeof entry === "string" ? { number: entry } : entry;
      const number = query.number.trim();
      if (!number) continue;
      unique.set(trackKey(number, query.carrier), { number, ...(query.carrier != null ? { carrier: query.carrier } : {}) });
    }
    if (unique.size === 0) return results;

    if (!this.hasApiKey()) {
      for (const query of unique.values()) {
        const result = mockResult(query.number);
        results.set(trackKey(query.number, query.carrier), result);
        if (!results.has(query.number)) results.set(query.number, result);
      }
      return results;
    }

    const list = [...unique.values()];
    for (let offset = 0; offset < list.length; offset += SEVENTEEN_TRACK_BATCH_LIMIT) {
      if (offset > 0) await delay(350);
      const chunk = list.slice(offset, offset + SEVENTEEN_TRACK_BATCH_LIMIT);
      const envelope = await this.post(
        "/gettrackinfo",
        chunk.map((query) => ({ number: query.number, ...(query.carrier != null ? { carrier: query.carrier } : {}) })),
      );
      for (const item of envelope.data?.accepted ?? []) {
        const result = parseAcceptedTrackItem(item);
        if (!result) continue;
        results.set(trackKey(result.trackingNumber, result.carrierCode), result);
        if (!results.has(result.trackingNumber)) results.set(result.trackingNumber, result);
      }
      for (const item of envelope.data?.rejected ?? []) {
        const parsed = rejectedItemSchema.safeParse(item);
        if (!parsed.success) continue;
        const result = rejectedResult(parsed.data);
        results.set(trackKey(result.trackingNumber, result.carrierCode), result);
        if (!results.has(result.trackingNumber)) results.set(result.trackingNumber, result);
      }
    }
    return results;
  }

  async stopTracking(number: string, carrierCode?: number): Promise<boolean> {
    return this.mutate("/stoptrack", number, carrierCode);
  }

  async deleteTracking(number: string, carrierCode?: number): Promise<boolean> {
    return this.mutate("/deletetrack", number, carrierCode);
  }

  private async mutate(path: "/stoptrack" | "/deletetrack", number: string, carrierCode?: number): Promise<boolean> {
    const cleanNumber = number.trim();
    if (!this.hasApiKey()) return true;
    const envelope = await this.post(path, [
      { number: cleanNumber, ...(carrierCode != null ? { carrier: carrierCode } : {}) },
    ]);
    const rejected = envelope.data?.rejected?.[0];
    if (!rejected) return envelope.code === 0;
    const parsed = rejectedItemSchema.safeParse(rejected);
    if (!parsed.success) return false;
    console.warn(`[17TRACK] ${path} rejected ${cleanNumber}: ${parsed.data.error?.message ?? "unknown error"}`);
    return false;
  }

  private registerPayload(input: RegisterInput): Record<string, unknown> {
    const payload: Record<string, unknown> = { number: input.number.trim() };
    if (input.carrier != null) payload.carrier = input.carrier;
    if (input.finalCarrier != null) payload.final_carrier = input.finalCarrier;
    if (input.lang) payload.lang = input.lang;
    if (input.tag) payload.tag = input.tag.slice(0, 100);
    if (input.email) payload.email = input.email;
    if (input.orderNo) payload.order_no = input.orderNo;
    if (input.originCountry) payload.origin_country = input.originCountry;
    if (input.destinationCountry) payload.destination_country = input.destinationCountry;
    if (input.destinationPostalCode) payload.destination_postal_code = input.destinationPostalCode;
    if (input.destinationCity) payload.destination_city = input.destinationCity;
    if (input.shipDate) payload.ship_date = input.shipDate;
    if (input.phoneNumber) payload.phone_number = input.phoneNumber;
    if (input.phoneNumberLast4) payload.phone_number_last_4 = input.phoneNumberLast4;
    if (input.remark) payload.remark = input.remark.slice(0, 1000);
    return payload;
  }

  private async post(path: string, body: unknown): Promise<z.infer<typeof envelopeSchema>> {
    const response = await this.fetchImpl(`${SEVENTEEN_TRACK_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "17token": this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (response.status === 429) {
      throw new SeventeenTrackApiError("17TRACK rate limit reached (3 requests per second).", 429);
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new SeventeenTrackApiError(
        `17TRACK ${path} failed with HTTP ${response.status}: ${errorText.slice(0, 300)}`,
        response.status,
      );
    }

    const json: unknown = await response.json();
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new SeventeenTrackApiError(`17TRACK ${path} returned an unexpected payload.`);
    }
    if (envelope.data.code !== 0) {
      throw new SeventeenTrackApiError(`17TRACK ${path} returned code ${envelope.data.code}.`, envelope.data.code);
    }
    return envelope.data;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const trackingService = new SeventeenTrackService();
export default trackingService;
