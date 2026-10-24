import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import {
  ParcelsService,
  mapCarrierStatus,
  parseParcelsWebhook,
  shipmentToResult,
  verifyParcelsSignature,
} from "../src/services/tracking.js";

const deliveredShipment = {
  trackingId: "9400111206213785678901",
  status: "delivered",
  originCode: "US",
  destinationCode: "US",
  detectedCarrier: { slug: "usps", name: "USPS" },
  states: [
    {
      state: "Delivered, In/At Mailbox",
      location: "Austin, TX, United States",
      date: "2026-06-25T18:42:00.000Z",
    },
    {
      state: "Out for Delivery",
      location: "Austin, TX, United States",
      date: "2026-06-25T12:15:00.000Z",
    },
  ],
};

describe("Parcels tracking", () => {
  it("maps carrier statuses onto the package enum", () => {
    expect(mapCarrierStatus("delivered")).toBe("Delivered");
    expect(mapCarrierStatus("in_transit")).toBe("InTransit");
    expect(mapCarrierStatus("out_for_delivery")).toBe("OutForDelivery");
  });

  it("reads the newest checkpoint from a shipment", () => {
    const result = shipmentToResult("9400111206213785678901", deliveredShipment);
    expect(result.carrier).toBe("USPS");
    expect(result.status).toBe("Delivered");
    expect(result.lastEvent).toBe("Delivered, In/At Mailbox");
    expect(result.originCountry).toBe("US");
    expect(result.events).toHaveLength(2);
  });

  it("parses a batch_completed webhook", () => {
    const notice = parseParcelsWebhook({
      event: "batch_completed",
      request_id: "66f4f2c0e16b4c13bb7e0001",
      timestamp: "2026-06-25T18:43:20.000Z",
      done: true,
      results: [
        {
          tracking_number: "9400111206213785678901",
          state: "completed",
          from_cache: true,
          shipment: deliveredShipment,
        },
      ],
    });
    expect(notice.requestId).toBe("66f4f2c0e16b4c13bb7e0001");
    expect(notice.results[0]?.status).toBe("Delivered");
  });

  it("verifies the Parcels-Signature header", () => {
    const body = '{"event":"batch_completed"}';
    const secret = "whsec_test";
    const timestamp = 1_782_941_000;
    const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const header = `t=${timestamp},v1=${digest}`;
    expect(verifyParcelsSignature(body, header, secret, timestamp * 1000)).toBe(true);
    expect(verifyParcelsSignature(body, header, "other", timestamp * 1000)).toBe(false);
    expect(verifyParcelsSignature(body, header, secret, timestamp * 1000 + 6 * 60 * 1000)).toBe(false);
  });

  it("stores a completed lookup and a rejection from one response", async () => {
    const fetchImpl = async () =>
      Response.json({
        request_id: "req-1",
        status: "completed",
        done: true,
        expires_at: "2026-06-25T19:13:20.000Z",
        webhook: { secret: "whsec_abc" },
        results: [
          {
            tracking_number: "9400111206213785678901",
            state: "completed",
            from_cache: true,
            shipment: deliveredShipment,
          },
        ],
        rejected: [
          {
            tracking_number: "BAD",
            code: "DESTINATION_COUNTRY_REQUIRED",
            message: "destination_country is required",
          },
        ],
      });

    const service = new ParcelsService("parcels-key", fetchImpl);
    const batch = await service.getBatchTracking([
      { number: "9400111206213785678901", destinationCountry: "US" },
      { number: "BAD" },
    ]);
    expect(batch.get("9400111206213785678901")?.carrier).toBe("USPS");
    expect(batch.get("9400111206213785678901")?.webhookSecret).toBe("whsec_abc");
    expect(batch.get("BAD")?.status).toBe("NotFound");
    expect(batch.get("BAD")?.lastEvent).toBe("destination_country is required");
  });
});
