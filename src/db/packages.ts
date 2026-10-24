import { db } from "./client.js";
import type { PackageStatus, TrackingResult } from "../services/tracking.js";

const DELIVERED_QUIET_MS = 15 * 24 * 60 * 60 * 1000;

export async function ensureUser(chatId: string) {
  return db.orm.public.User.upsert({
    create: { chatId },
    update: { chatId },
    conflictOn: { chatId },
  });
}

export async function findUserByChat(chatId: string) {
  return db.orm.public.User.where({ chatId }).first();
}

export async function findPackage(userId: string, trackingNumber: string) {
  return db.orm.public.Package.where({ userId, trackingNumber }).first();
}

export async function listPackagesForChat(chatId: string) {
  const user = await db.orm.public.User.where({ chatId })
    .include("packages", (packages) => packages.orderBy((pkg) => pkg.createdAt.desc()))
    .first();
  return user?.packages ?? [];
}

export async function findPackageWithHistory(userId: string, trackingNumber: string) {
  return db.orm.public.Package.where({ userId, trackingNumber })
    .include("events", (events) => events.orderBy((event) => event.sortIndex.asc()))
    .include("milestones", (milestones) => milestones.orderBy((milestone) => milestone.sortIndex.asc()))
    .first();
}

export function packageWrite(result: TrackingResult, extras: { friendlyName?: string; userId: string; lang?: string; tag?: string }) {
  return {
    trackingNumber: result.trackingNumber,
    userId: extras.userId,
    status: result.status,
    carrier: result.carrier ?? null,
    carrierCode: result.carrierCode ?? null,
    friendlyName: extras.friendlyName ?? null,
    lang: extras.lang ?? "en",
    tag: extras.tag ?? null,
    subStatus: result.subStatus ?? null,
    subStatusDescr: result.subStatusDescr ?? null,
    lastEvent: result.lastEvent ?? null,
    lastEventLocation: result.lastEventLocation ?? null,
    lastUpdate: result.lastUpdate ?? null,
    originCountry: result.originCountry ?? null,
    destinationCountry: result.destinationCountry ?? null,
    serviceType: result.serviceType ?? null,
    weightRaw: result.weightRaw ?? null,
    pieces: result.pieces ?? null,
    eventsHash: result.eventsHash ?? null,
    parcelsRequestId: result.requestId ?? null,
    webhookSecret: result.webhookSecret ?? null,
    deliveredAt: result.status === "Delivered" ? (result.lastUpdate ?? new Date()) : null,
  };
}

export async function createPackage(
  result: TrackingResult,
  extras: { friendlyName?: string; userId: string; lang?: string; tag?: string },
) {
  const created = await db.orm.public.Package.create(packageWrite(result, extras));
  await replaceHistory(created.id, result);
  return created;
}

export async function applyTrackingResult(
  packageId: string,
  result: TrackingResult,
  current: { status: PackageStatus; deliveredAt: Date | null; eventsHash: number | null; lastEvent: string | null },
) {
  if (result.refreshOnly) {
    const updated = await db.orm.public.Package.where({ id: packageId }).update({
      ...(result.requestId ? { parcelsRequestId: result.requestId } : {}),
      ...(result.webhookSecret ? { webhookSecret: result.webhookSecret } : {}),
      ...(result.destinationCountry ? { destinationCountry: result.destinationCountry } : {}),
    });
    return { updated, changed: false };
  }

  const changed =
    current.status !== result.status ||
    current.lastEvent !== (result.lastEvent ?? null) ||
    current.eventsHash !== (result.eventsHash ?? null);

  const deliveredAt =
    result.status === "Delivered" ? (current.deliveredAt ?? result.lastUpdate ?? new Date()) : current.deliveredAt;

  const updated = await db.orm.public.Package.where({ id: packageId }).update({
    status: result.status,
    carrier: result.carrier ?? undefined,
    carrierCode: result.carrierCode ?? undefined,
    subStatus: result.subStatus ?? null,
    subStatusDescr: result.subStatusDescr ?? null,
    lastEvent: result.lastEvent ?? null,
    lastEventLocation: result.lastEventLocation ?? null,
    lastUpdate: result.lastUpdate ?? new Date(),
    originCountry: result.originCountry ?? null,
    destinationCountry: result.destinationCountry ?? null,
    serviceType: result.serviceType ?? null,
    weightRaw: result.weightRaw ?? null,
    pieces: result.pieces ?? null,
    eventsHash: result.eventsHash ?? null,
    ...(result.requestId ? { parcelsRequestId: result.requestId } : {}),
    ...(result.webhookSecret ? { webhookSecret: result.webhookSecret } : {}),
    deliveredAt,
  });

  if (changed) await replaceHistory(packageId, result);
  return { updated, changed };
}

export async function packagesDueForPoll() {
  const rows = await db.orm.public.Package.where((pkg) => pkg.trackingState.eq("Tracking")).include("user").all();
  const cutoff = Date.now() - DELIVERED_QUIET_MS;
  return rows.filter((pkg) => {
    if (pkg.status === "Delivered" && pkg.deliveredAt && pkg.deliveredAt.getTime() < cutoff) return false;
    return true;
  });
}

export async function packagesForRequest(parcelsRequestId: string) {
  return db.orm.public.Package.where({ parcelsRequestId }).include("user").all();
}

export async function packagesForNumber(trackingNumber: string, carrierCode?: number) {
  const rows = await db.orm.public.Package.where({ trackingNumber }).include("user").all();
  return rows.filter((row) => carrierCode == null || row.carrierCode == null || row.carrierCode === carrierCode);
}

export async function otherPackageCount(trackingNumber: string, exceptId: string): Promise<number> {
  const rows = await db.orm.public.Package.where({ trackingNumber }).all();
  return rows.filter((row) => row.id !== exceptId).length;
}

export async function deletePackage(id: string) {
  return db.orm.public.Package.where({ id }).delete();
}

export async function renamePackage(id: string, friendlyName: string) {
  return db.orm.public.Package.where({ id }).update({ friendlyName });
}

async function replaceHistory(packageId: string, result: TrackingResult): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.orm.public.TrackingEvent.where({ packageId }).deleteAll();
    await tx.orm.public.Milestone.where({ packageId }).deleteAll();

    if (result.events.length > 0) {
      await tx.orm.public.TrackingEvent.createAll(
        result.events.map((event, sortIndex) => ({
          packageId,
          sortIndex,
          description: event.description,
          occurredAt: event.timeUtc ?? null,
          timeIso: event.date ?? null,
          location: event.location ?? null,
          stage: event.stage ?? null,
          subStatus: event.subStatus ?? null,
          country: event.country ?? null,
          city: event.city ?? null,
          providerKey: event.providerKey ?? null,
          providerName: event.providerName ?? null,
        })),
      );
    }

    const milestoneRows = result.milestones.filter((milestone, index, all) => {
      return all.findIndex((item) => item.keyStage === milestone.keyStage) === index;
    });
    if (milestoneRows.length > 0) {
      await tx.orm.public.Milestone.createAll(
        milestoneRows.map((milestone, sortIndex) => ({
          packageId,
          keyStage: milestone.keyStage,
          sortIndex,
          timeUtc: milestone.timeUtc ?? null,
          timeIso: milestone.timeIso ?? null,
        })),
      );
    }
  });
}
