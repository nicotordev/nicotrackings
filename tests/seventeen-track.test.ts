import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  SeventeenTrackErrorCode,
  SeventeenTrackService,
  parseAcceptedTrackItem,
  parseWebhookPayload,
  signSeventeenTrackBody,
  verifySeventeenTrackSignature,
} from "../src/services/tracking.js";

const sampleTrack = {
  number: "RR123465789CN",
  carrier: 100003,
  destination_postal_code: null,
  origin_country: null,
  destination_country: null,
  destination_city: null,
  ship_date: null,
  track_info: {
    shipping_info: {
      shipper_address: { country: "CN", city: "SHENZHEN" },
      recipient_address: { country: "AF", city: "KABUL" },
    },
    latest_status: {
      status: "InTransit",
      sub_status: "InTransit_CustomsProcessing",
      sub_status_descr: null,
    },
    latest_event: {
      time_iso: "2022-03-02T20:43:24-06:00",
      time_utc: "2022-03-03T02:43:24Z",
      description: "Shipment information sent to FedEx",
      description_translation: { lang: "en", description: "Shipment information sent to FedEx" },
      location: "NJ",
      stage: "InfoReceived",
      sub_status: "InfoReceived",
      address: { country: "US", city: "MARLTON" },
    },
    time_metrics: {
      days_of_transit: 7,
      days_after_last_update: 57,
      estimated_delivery_date: {
        from: "2021-09-01T08:00:54-05:00",
        to: "2021-09-01T13:00:45-05:00",
      },
    },
    milestone: [
      { key_stage: "InfoReceived", time_iso: "2023-08-14T00:00:00-05:00", time_utc: "2023-08-14T05:00:00Z" },
      { key_stage: "PickedUp", time_iso: null, time_utc: null },
    ],
    misc_info: {
      service_type: "FedEx International Priority",
      weight_raw: "1.1 KG",
      pieces: "1",
      local_number: "270434455123",
      local_provider: "Fedex",
    },
    tracking: {
      providers: [
        {
          provider: { key: 100003, name: "Fedex", alias: "Fedex" },
          provider_tips: "DLVRD_ACCPT_ZU",
          events_hash: -731027172,
          events: [
            {
              time_iso: "2023-08-14T00:00:00-05:00",
              time_utc: "2023-08-14T05:00:00Z",
              description: "At local FedEx facility",
              location: "ANCHORAGE, AK, US",
              stage: "InTransit",
              sub_status: "InTransit_Other",
              address: { country: "US", city: "ANCHORAGE" },
            },
          ],
        },
      ],
    },
  },
};

describe("17TRACK v2.4 parser", () => {
  it("reads latest status, carrier name, events and milestones from gettrackinfo", () => {
    const result = parseAcceptedTrackItem(sampleTrack);
    expect(result).toBeDefined();
    expect(result?.trackingNumber).toBe("RR123465789CN");
    expect(result?.carrier).toBe("Fedex");
    expect(result?.carrierCode).toBe(100003);
    expect(result?.status).toBe("InTransit");
    expect(result?.subStatus).toBe("InTransit_CustomsProcessing");
    expect(result?.lastEvent).toBe("Shipment information sent to FedEx");
    expect(result?.originCountry).toBe("CN");
    expect(result?.destinationCountry).toBe("AF");
    expect(result?.daysOfTransit).toBe(7);
    expect(result?.providerTips).toBe("DLVRD_ACCPT_ZU");
    expect(result?.eventsHash).toBe(-731027172);
    expect(result?.events[0]?.description).toBe("At local FedEx facility");
    expect(result?.events[0]?.city).toBe("ANCHORAGE");
    expect(result?.milestones.map((milestone) => milestone.keyStage)).toEqual(["InfoReceived", "PickedUp"]);
    expect(result?.serviceType).toBe("FedEx International Priority");
  });

  it("parses TRACKING_UPDATED and TRACKING_STOPPED webhooks", () => {
    const updated = parseWebhookPayload({ event: "TRACKING_UPDATED", data: sampleTrack });
    expect(updated.event).toBe("TRACKING_UPDATED");
    if (updated.event === "TRACKING_UPDATED") {
      expect(updated.result.status).toBe("InTransit");
    }

    const stopped = parseWebhookPayload({
      event: "TRACKING_STOPPED",
      data: { number: "RR123456789CN", carrier: 3011, tag: "" },
    });
    expect(stopped).toEqual({ event: "TRACKING_STOPPED", number: "RR123456789CN", carrierCode: 3011 });
  });

  it("verifies the webhook signature as SHA256 of body/key", () => {
    const body = `{"event":"TRACKING_UPDATED","data":{"number":"RR123456789CN","carrier":3011,"tag":null}}`;
    const key = "123456ABCDEF";
    const expected = createHash("sha256").update(`${body}/${key}`, "utf8").digest("hex");
    expect(signSeventeenTrackBody(body, key)).toBe(expected);
    expect(verifySeventeenTrackSignature(body, expected, key)).toBe(true);
    expect(verifySeventeenTrackSignature(body, "deadbeef", key)).toBe(false);
  });

  it("treats an already-registered number as success and surfaces rejection messages", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/register")) {
        return Response.json({
          code: 0,
          data: {
            accepted: [],
            rejected: [
              {
                number: "RR123456789CN",
                carrier: 3011,
                error: { code: SeventeenTrackErrorCode.AlreadyRegistered, message: "already registered" },
              },
            ],
          },
        });
      }
      return Response.json({
        code: 0,
        data: {
          accepted: [sampleTrack],
          rejected: [
            {
              number: "MISSING1",
              error: { code: SeventeenTrackErrorCode.NotRegistered, message: "please register first" },
            },
          ],
        },
      });
    };

    const service = new SeventeenTrackService("real-key", fetchImpl);
    const registered = await service.register("RR123456789CN");
    expect(registered.ok).toBe(true);
    expect(registered.alreadyRegistered).toBe(true);
    expect(registered.carrierCode).toBe(3011);

    const batch = await service.getBatchTracking([{ number: "RR123465789CN", carrier: 100003 }, { number: "MISSING1" }]);
    expect(batch.get("RR123465789CN#100003")?.carrier).toBe("Fedex");
    expect(batch.get("MISSING1")?.errorCode).toBe(SeventeenTrackErrorCode.NotRegistered);
    expect(batch.get("MISSING1")?.status).toBe("NotFound");
  });
});
