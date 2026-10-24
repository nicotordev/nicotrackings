import { describe, expect, it } from "bun:test";
import {
  getStatusBadge,
  escapeHtml,
  formatPackageCard,
  formatPackageList,
} from "../src/services/notifier.js";

describe("Notifier Service & Formatter", () => {
  it("should return correct emoji badge for statuses", () => {
    expect(getStatusBadge("Delivered").emoji).toBe("✅");
    expect(getStatusBadge("InTransit").emoji).toBe("🚚");
    expect(getStatusBadge("OutForDelivery").emoji).toBe("🛵");
    expect(getStatusBadge("Exception").emoji).toBe("⚠️");
    expect(getStatusBadge("NotFound").emoji).toBe("❓");
    expect(getStatusBadge(null).emoji).toBe("⏳");
  });

  it("should escape HTML characters safely", () => {
    const raw = `<script>alert("xss & evil")</script>`;
    const escaped = escapeHtml(raw);
    expect(escaped).toBe("&lt;script&gt;alert(\"xss &amp; evil\")&lt;/script&gt;");
  });

  it("should format a single package card with details", () => {
    const card = formatPackageCard({
      id: "pkg1",
      trackingNumber: "RR123456789CN",
      friendlyName: "Custom Keyboard",
      status: "InTransit",
      carrier: "China Post",
      lastEvent: "Departed from transit facility",
      lastUpdate: new Date("2026-10-24T12:00:00Z"),
    });

    expect(card).toContain("Custom Keyboard");
    expect(card).toContain("RR123456789CN");
    expect(card).toContain("China Post");
    expect(card).toContain("Departed from transit facility");
  });

  it("should format package list with empty placeholder when list is empty", () => {
    const listMessage = formatPackageList([]);
    expect(listMessage).toContain("You don't have any tracked packages yet");
  });

  it("should format package list with items", () => {
    const listMessage = formatPackageList([
      {
        id: "1",
        trackingNumber: "TRACK123",
        friendlyName: "Book",
        status: "Delivered",
        lastEvent: "Delivered at front porch",
      },
    ]);

    expect(listMessage).toContain("Book");
    expect(listMessage).toContain("TRACK123");
    expect(listMessage).toContain("Delivered");
  });
});
