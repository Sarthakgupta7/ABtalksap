"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAudit } from "@/features/admin/audit";
import { writeClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  createWorkshopSchema,
  deriveWorkshopId,
  updateWorkshopSchema,
  workshopIdSchema,
  workshopReasonSchema,
  type WorkshopEventInput,
} from "@/lib/validations/workshop";
import {
  createEvent,
  deleteEventIfEmpty,
  getEventForAdmin,
  setLifecycle,
  updateEvent,
  type WorkshopWriteFields,
} from "@/repositories/workshop";

/**
 * Admin workshop management. Plan 163 phase 2.
 *
 * Every action authenticates with `requireAdmin`, validates with Zod, returns
 * the house result envelope, and writes an `AdminAction` row. A workshop can
 * be created, edited and taken through its whole lifecycle from the console
 * with no deploy, which is the point of the phase.
 *
 * **Lifecycle and content are separate.** Publishing never touches the poster
 * or any field; archiving never clears one. The four controls in plan 163 stay
 * independent, and this file only owns the lifecycle.
 */

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; message: string };

const GENERIC = "Could not save this workshop.";

/** Public page included: it is a Server Component reading the same table. */
function revalidateWorkshopViews() {
  revalidatePath("/admin/workshop");
  revalidatePath("/workshop");
  revalidatePath("/workshop/events");
}

/** Validated input -> the columns. `id`, lifecycle and poster are not here. */
function toWriteFields(input: WorkshopEventInput): WorkshopWriteFields {
  return {
    // The port's convention, so a stored date round-trips to the same
    // YYYY-MM-DD string the admin typed.
    date: new Date(`${input.date}T00:00:00Z`),
    timeLabel: input.timeLabel,
    title: input.title,
    description: input.description,
    host: input.host,
    location: input.location,
    tag: input.tag,
    accent: input.accent,
    iconName: input.iconName,
    track: input.track,
    registrationOpen: input.registrationOpen,
    register: input.register,
    externalHref: input.externalHref,
    ctaLabel: input.ctaLabel,
    youtubeId: input.youtubeId,
    duration: input.duration,
    durationMinutes: input.durationMinutes ?? null,
    titleAccents: input.titleAccents,
    takeaways: input.takeaways,
    topics: input.topics,
    resources: input.resources.length > 0 ? input.resources : Prisma.DbNull,
  };
}

export async function createWorkshopAction(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = createWorkshopSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? GENERIC };
  }

  // Derived once, here, and never again. From the string as typed — a Date
  // round-trip is what shifts a chosen day across a timezone boundary.
  const id = deriveWorkshopId(parsed.data.date);

  try {
    await createEvent(id, toWriteFields(parsed.data));
  } catch (error) {
    // The unique constraint is the arbiter, not a pre-check: two admins on the
    // same date would both pass a check and the second would overwrite the
    // first, merging two rosters under one id.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: `A workshop already exists on ${parsed.data.date}. Edit that one, or pick another date.`,
      };
    }
    logger.error("[admin] createWorkshopAction", { error: String(error) });
    return { ok: false, message: GENERIC };
  }

  await writeClient().$transaction(async (tx) => {
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      entityType: "WorkshopEvent",
      entityId: id,
      actionType: "WORKSHOP_CREATE",
      reason: `Created workshop "${parsed.data.title}".`,
      newState: { id, title: parsed.data.title, date: parsed.data.date },
    });
  });

  revalidateWorkshopViews();
  return { ok: true, data: { id } };
}

export async function updateWorkshopAction(raw: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = updateWorkshopSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? GENERIC };
  }

  const before = await getEventForAdmin(parsed.data.id);
  if (!before) return { ok: false, message: "That workshop no longer exists." };

  try {
    // Note what is NOT passed: the id. A date edit moves the `date` column and
    // leaves the roster key alone, so a session pushed back a week keeps its
    // registrations.
    await updateEvent(parsed.data.id, toWriteFields(parsed.data));
    await writeClient().$transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        entityType: "WorkshopEvent",
        entityId: parsed.data.id,
        actionType: "WORKSHOP_UPDATE",
        reason: `Updated workshop "${parsed.data.title}".`,
        previousState: {
          title: before.title,
          date: before.date.toISOString().slice(0, 10),
        },
        newState: { title: parsed.data.title, date: parsed.data.date },
      });
    });
  } catch (error) {
    logger.error("[admin] updateWorkshopAction", { error: String(error) });
    return { ok: false, message: GENERIC };
  }

  revalidateWorkshopViews();
  return { ok: true };
}

/** publish / unpublish / archive / unarchive — every move reversible. */
async function lifecycleAction(
  raw: unknown,
  op: "publish" | "unpublish" | "archive" | "unarchive",
): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = workshopIdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: GENERIC };

  const before = await getEventForAdmin(parsed.data.id);
  if (!before) return { ok: false, message: "That workshop no longer exists." };

  const now = new Date();
  const patch =
    op === "publish"
      ? { publishedAt: now }
      : op === "unpublish"
        ? { publishedAt: null }
        : op === "archive"
          ? { archivedAt: now }
          : { archivedAt: null };

  try {
    await setLifecycle(parsed.data.id, patch);
    await writeClient().$transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        entityType: "WorkshopEvent",
        entityId: parsed.data.id,
        actionType: `WORKSHOP_${op.toUpperCase()}`,
        reason: `${op} workshop "${before.title}".`,
        previousState: {
          publishedAt: before.publishedAt?.toISOString() ?? null,
          archivedAt: before.archivedAt?.toISOString() ?? null,
        },
        newState: {
          publishedAt:
            "publishedAt" in patch
              ? (patch.publishedAt?.toISOString() ?? null)
              : (before.publishedAt?.toISOString() ?? null),
          archivedAt:
            "archivedAt" in patch
              ? (patch.archivedAt?.toISOString() ?? null)
              : (before.archivedAt?.toISOString() ?? null),
        },
      });
    });
  } catch (error) {
    logger.error(`[admin] workshop ${op}`, { error: String(error) });
    return { ok: false, message: GENERIC };
  }

  revalidateWorkshopViews();
  return { ok: true };
}

export async function publishWorkshopAction(raw: unknown) {
  return lifecycleAction(raw, "publish");
}
export async function unpublishWorkshopAction(raw: unknown) {
  return lifecycleAction(raw, "unpublish");
}
export async function archiveWorkshopAction(raw: unknown) {
  return lifecycleAction(raw, "archive");
}
export async function unarchiveWorkshopAction(raw: unknown) {
  return lifecycleAction(raw, "unarchive");
}

/**
 * Delete — only with an empty roster.
 *
 * The audit row is written inside the delete's own transaction, after the
 * roster check and before the row goes, carrying the id, title and date in
 * `previousState`. `AdminAction.entityId` is a plain string with no foreign
 * key, so the record survives the event; writing it outside the transaction
 * would leave a row saying "deleted" after a failed delete. An audit trail that
 * loses the name of what was deleted is not an audit trail.
 */
export async function deleteWorkshopAction(raw: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = workshopReasonSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? GENERIC };
  }

  const before = await getEventForAdmin(parsed.data.id);
  if (!before) return { ok: false, message: "That workshop no longer exists." };

  try {
    const outcome = await deleteEventIfEmpty(parsed.data.id, async (tx) => {
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        entityType: "WorkshopEvent",
        entityId: parsed.data.id,
        actionType: "WORKSHOP_DELETE",
        reason: parsed.data.reason,
        // Everything the trail needs, copied in before the row goes. Nothing
        // may read the event back afterwards to find out what it was.
        previousState: {
          id: before.id,
          title: before.title,
          date: before.date.toISOString().slice(0, 10),
          track: before.track,
        },
      });
    });
    if (!outcome.ok) {
      return {
        ok: false,
        message:
          outcome.reason === "has-registrations"
            ? `This workshop has ${outcome.registrations} registration${outcome.registrations === 1 ? "" : "s"}. Archive it instead — deleting would destroy the roster.`
            : "That workshop no longer exists.",
      };
    }
  } catch (error) {
    logger.error("[admin] deleteWorkshopAction", { error: String(error) });
    return { ok: false, message: GENERIC };
  }

  revalidateWorkshopViews();
  return { ok: true };
}
