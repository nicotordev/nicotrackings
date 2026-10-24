import { describe, expect, it } from "bun:test";
import { SeventeenTrackService } from "../src/services/tracking.js";

describe("SeventeenTrackService", () => {
  it("should initialize properly without API key and use fallback", async () => {
    const service = new SeventeenTrackService("");
    const isRegistered = await service.register("TEST123456789");
    expect(isRegistered.ok).toBe(true);
    expect(isRegistered.number).toBe("TEST123456789");

    const result = await service.getTracking("TEST123456789");
    expect(result.trackingNumber).toBe("TEST123456789");
    expect(result.status).toBe("InTransit");
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("should handle batch tracking queries correctly", async () => {
    const service = new SeventeenTrackService("");
    const numbers = ["TRACK001", "TRACK002", "TRACK003"];
    const results = await service.getBatchTracking(numbers);

    expect(results.size).toBe(3);
    expect(results.get("TRACK001")?.trackingNumber).toBe("TRACK001");
    expect(results.get("TRACK002")?.trackingNumber).toBe("TRACK002");
    expect(results.get("TRACK003")?.trackingNumber).toBe("TRACK003");
  });

  it("should handle empty batch request without throwing", async () => {
    const service = new SeventeenTrackService("");
    const results = await service.getBatchTracking([]);
    expect(results.size).toBe(0);
  });
});
