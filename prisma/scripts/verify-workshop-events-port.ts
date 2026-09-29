/**
 * Plan 163 phase 1a verification. READ ONLY.
 *
 * Compares every field of every `EVENTS` entry against its `WorkshopEvent`
 * row. This can only run while `EVENTS` still exists, which is why phase 1a
 * ends here and `EVENTS` is not removed until 1b: after it is deleted the
 * comparison is impossible and the port can never be proved again.
 *
 * Also checks the two things that make the port safe rather than merely
 * complete: every registration's `eventId` resolves to a row, and the
 * registration count is unchanged.
 *
 *   npx tsx prisma/scripts/verify-workshop-events-port.ts
 */
import { PrismaClient } from "@prisma/client";
import { EVENTS, type WorkshopEvent } from "../../src/components/workshop/events-data";

const prisma = new PrismaClient();

const EXPECTED_REGISTRATIONS = 366;

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log(`    FAIL ${label}`);
    console.log(`         db=${JSON.stringify(got)}`);
    console.log(`         ts=${JSON.stringify(want)}`);
  }
  return ok;
}

/**
 * Key-order-insensitive form, for `resources` only.
 *
 * Postgres `jsonb` normalises object key order on write, so `{label, href,
 * kind}` reads back as `{href, kind, label}`. The values are identical and
 * every consumer accesses these by property name, so the ordering carries no
 * meaning — comparing the raw stringification would fail on a correct port.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const iconNameOf = (e: WorkshopEvent) =>
  ((e.Icon as unknown as { displayName?: string; name?: string }).displayName ??
    (e.Icon as unknown as { name?: string }).name ??
    "").trim();

async function main() {
  console.log("Plan 163 phase 1a — port verification\n");

  const rows = await prisma.workshopEvent.findMany({
    select: {
      id: true, date: true, timeLabel: true, title: true, description: true,
      host: true, location: true, tag: true, accent: true, iconName: true,
      track: true, posterUrl: true, registrationOpen: true, register: true,
      externalHref: true, ctaLabel: true, youtubeId: true, duration: true,
      titleAccents: true, takeaways: true, topics: true, resources: true,
      durationMinutes: true, publishedAt: true, archivedAt: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  console.log(`1. Row count: ${rows.length} (expect ${EVENTS.length})`);
  if (rows.length !== EVENTS.length) failures++;

  console.log("\n2. Field-by-field round trip:");
  for (const e of EVENTS) {
    const r = byId.get(e.id);
    if (!r) {
      failures++;
      console.log(`  ${e.id}: FAIL — no row`);
      continue;
    }
    const before = failures;
    check("date", isoOf(r.date), e.date);
    check("timeLabel", r.timeLabel, e.time);
    check("title", r.title, e.title);
    check("description", r.description, e.desc);
    check("host", r.host, e.host);
    check("location", r.location, e.location);
    check("tag", r.tag, e.tag);
    check("accent", r.accent, e.accent);
    check("iconName", r.iconName, iconNameOf(e));
    check("track", r.track, e.track.toUpperCase());
    check("posterUrl", r.posterUrl, e.posterSrc ?? null);
    check("registrationOpen", r.registrationOpen, e.registrationOpen ?? true);
    check("register", r.register, e.register ?? false);
    check("externalHref", r.externalHref, e.href ?? null);
    check("ctaLabel", r.ctaLabel, e.ctaLabel ?? null);
    check("youtubeId", r.youtubeId, e.youtubeId ?? null);
    check("duration", r.duration, e.duration ?? null);
    check("titleAccents", r.titleAccents, e.titleAccents ?? []);
    check("takeaways", r.takeaways, e.takeaways ?? []);
    check("topics", r.topics, e.topics ?? []);
    check("resources", canonical(r.resources ?? null), canonical(e.resources ?? null));
    check("durationMinutes", r.durationMinutes, e.durationMinutes ?? null);
    console.log(
      `  ${failures === before ? "PASS" : "FAIL"}  ${e.id}  (22 fields)`,
    );
  }

  console.log("\n3. `placeholder` is not persisted:");
  const anyPlaceholder = EVENTS.some((e) => e.placeholder === true);
  console.log(
    `  ${anyPlaceholder ? "FAIL" : "PASS"}  no real event carries placeholder ` +
      `(it marks generated TBA tiles only)`,
  );
  if (anyPlaceholder) failures++;

  console.log("\n4. Historical, not public:");
  const archived = rows.filter((r) => r.archivedAt !== null).length;
  const published = rows.filter((r) => r.publishedAt !== null).length;
  console.log(`  ${archived === rows.length ? "PASS" : "FAIL"}  archived ${archived}/${rows.length}`);
  console.log(`  ${published === 0 ? "PASS" : "FAIL"}  published ${published} (expect 0)`);
  if (archived !== rows.length || published !== 0) failures++;

  console.log("\n5. Registration integrity (the roster gate):");
  const grouped = await prisma.workshopRegistration.groupBy({
    by: ["eventId"],
    _count: { _all: true },
  });
  for (const g of grouped) {
    const hit = byId.has(g.eventId);
    if (!hit) failures++;
    console.log(
      `  ${hit ? "PASS" : "FAIL"}  ${g.eventId.padEnd(26)} ${String(g._count._all).padStart(3)} registrations -> ${hit ? "matched" : "NO MATCHING EVENT"}`,
    );
  }
  const total = await prisma.workshopRegistration.count();
  const okTotal = total === EXPECTED_REGISTRATIONS;
  if (!okTotal) failures++;
  console.log(`  ${okTotal ? "PASS" : "FAIL"}  total registrations ${total} (expect ${EXPECTED_REGISTRATIONS})`);

  console.log(
    failures === 0
      ? "\nALL CHECKS PASSED — the port is proved while EVENTS still exists."
      : `\n${failures} CHECK(S) FAILED`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
