import { describe, expect, it, afterAll } from "bun:test";
import { db } from "../src/db/client.js";
import { createPackage, ensureUser, findPackage } from "../src/db/packages.js";

describe("Database Models & Constraints", () => {
  const testChatId = `test_chat_${Date.now()}`;
  const testTracking = `TESTPKG${Date.now()}`;

  afterAll(async () => {
    const user = await db.orm.public.User.where({ chatId: testChatId }).first();
    if (user) {
      await db.orm.public.Package.where({ userId: user.id }).deleteAll();
      await db.orm.public.User.where({ id: user.id }).delete();
    }
    await db.close();
  });

  it("should create or upsert a user", async () => {
    const user = await ensureUser(testChatId);
    expect(user.id).toBeDefined();
    expect(user.chatId).toBe(testChatId);
  });

  it("should create a package for the user", async () => {
    const user = await db.orm.public.User.where({ chatId: testChatId }).first();
    expect(user).not.toBeNull();

    const pkg = await createPackage(
      {
        trackingNumber: testTracking,
        status: "InTransit",
        subStatus: "InTransit_Other",
        lastEvent: "Picked up by courier",
        carrier: "FedEx",
        carrierCode: 100003,
        events: [],
        milestones: [],
      },
      { userId: user!.id, friendlyName: "Test Item" },
    );

    expect(pkg.id).toBeDefined();
    expect(pkg.trackingNumber).toBe(testTracking);
    expect(pkg.friendlyName).toBe("Test Item");
    expect(pkg.userId).toBe(user!.id);
    expect(pkg.subStatus).toBe("InTransit_Other");
  });

  it("should prevent duplicate tracking number for the same user", async () => {
    const user = await db.orm.public.User.where({ chatId: testChatId }).first();
    expect(user).not.toBeNull();

    const existing = await findPackage(user!.id, testTracking);
    expect(existing).not.toBeNull();

    let threwError = false;
    try {
      await db.orm.public.Package.create({
        trackingNumber: testTracking,
        friendlyName: "Duplicate Item",
        userId: user!.id,
        status: "Pending",
      });
    } catch {
      threwError = true;
    }

    expect(threwError).toBe(true);
  });
});
