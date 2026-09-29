/**
 * Plan 163 phase 1a: port the hardcoded workshop schedule into the database.
 *
 * Reads `EVENTS` from `src/components/workshop/events-data.ts` and writes one
 * `WorkshopEvent` row per entry. The array is the input, deliberately: hand-
 * copying ten objects is where date, `resources`, `externalHref`, `ctaLabel`
 * and `registrationOpen` bugs get in, and they stay invisible until a past
 * workshop renders wrong months later.
 *
 * Three rules this script exists to enforce:
 *
 * 1. **Ids are preserved verbatim.** `WorkshopRegistration.eventId` points at
 *    them by string, 366 rows deep. A changed id silently detaches a roster.
 * 2. **Every ported row is archived.** These are historical records. The public
 *    schedule starts empty; `placeholderSaturdays()` fills the calendar with
 *    TBA until an admin publishes something new.
 * 3. **`Icon` is a component and we store a name.** Derived from
 *    `displayName ?? name` and asserted non-empty before anything is written —
 *    an empty `iconName` would ship a blank card with no error.
 *
 * Idempotent: `upsert` by id, so re-running changes nothing. It never deletes.
 *
 *   npx tsx prisma/scripts/seed-workshop-events.ts
 */
import { PrismaClient, WorkshopTrack } from "@prisma/client";
import { EVENTS, type WorkshopEvent } from "../../src/components/workshop/events-data";

const prisma = new PrismaClient();

const TRACK: Record<WorkshopEvent["track"], WorkshopTrack> = {
  workshop: WorkshopTrack.WORKSHOP,
  hackathon: WorkshopTrack.HACKATHON,
  cohort: WorkshopTrack.COHORT,
  challenge: WorkshopTrack.CHALLENGE,
};

/**
 * The same UTC midnight `events-data.ts`'s own `utc()` helper uses, so the
 * stored instant round-trips back to the identical `YYYY-MM-DD` string.
 */
function dateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Lucide sets `displayName`; `name` is the fallback for a plain function. */
function iconNameOf(event: WorkshopEvent): string {
  const icon = event.Icon as unknown as {
    displayName?: string;
    name?: string;
  };
  const resolved = (icon?.displayName ?? icon?.name ?? "").trim();
  if (!resolved) {
    throw new Error(
      `[${event.id}] could not resolve an icon name from Icon. Refusing to ` +
        `write an empty iconName — it renders a blank card with no error.`,
    );
  }
  return resolved;
}

async function main() {
  const archivedAt = new Date();
  console.log(`Porting ${EVENTS.length} events. All will be archived.\n`);

  // Resolve every icon BEFORE writing anything: a failure halfway through
  // leaves a partial port, and this is the field most likely to fail.
  const iconNames = new Map<string, string>();
  for (const event of EVENTS) iconNames.set(event.id, iconNameOf(event));

  const seen = new Set<string>();
  for (const event of EVENTS) {
    if (seen.has(event.id)) {
      throw new Error(
        `Duplicate id "${event.id}" in EVENTS — two workshops would share one ` +
          `roster. Refusing to port.`,
      );
    }
    seen.add(event.id);
  }

  for (const event of EVENTS) {
    const data = {
      date: dateFromIso(event.date),
      timeLabel: event.time,
      title: event.title,
      description: event.desc,
      host: event.host,
      location: event.location,
      tag: event.tag,
      accent: event.accent,
      iconName: iconNames.get(event.id)!,
      track: TRACK[event.track],
      posterUrl: event.posterSrc ?? null,
      registrationOpen: event.registrationOpen ?? true,
      register: event.register ?? false,
      externalHref: event.href ?? null,
      ctaLabel: event.ctaLabel ?? null,
      youtubeId: event.youtubeId ?? null,
      duration: event.duration ?? null,
      titleAccents: event.titleAccents ?? [],
      takeaways: event.takeaways ?? [],
      topics: event.topics ?? [],
      resources: event.resources ?? undefined,
      durationMinutes: event.durationMinutes ?? null,
      // Historical records: never published, always archived.
      publishedAt: null,
      archivedAt,
    };

    await prisma.workshopEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, ...data },
      update: data,
      select: { id: true },
    });

    console.log(
      `  ${event.id.padEnd(26)} ${event.date}  ${TRACK[event.track].padEnd(9)} ` +
        `icon=${data.iconName}`,
    );
  }

  const total = await prisma.workshopEvent.count();
  const archived = await prisma.workshopEvent.count({
    where: { archivedAt: { not: null } },
  });
  const published = await prisma.workshopEvent.count({
    where: { publishedAt: { not: null } },
  });
  console.log(
    `\nWorkshopEvent rows: ${total}  archived: ${archived}  published: ${published}`,
  );
  console.log(
    `WorkshopRegistration rows: ${await prisma.workshopRegistration.count()} (untouched)`,
  );
}

main()
  .catch((error) => {
    console.error("\nPORT FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
