import "server-only";
import type { Prisma, WorkshopEvent as WorkshopEventRow } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  WorkshopEvent,
  WorkshopResource,
} from "@/components/workshop/events-data";

/**
 * Workshop events — the canonical read boundary. Plan 163.
 *
 * Replaces the hardcoded `EVENTS` array. Two rules live here and nowhere else,
 * so no page can invent its own:
 *
 * 1. **Public eligibility.** A row reaches the public site only when it is
 *    published and not archived. `listPublicEvents` is the only public read;
 *    everything user-facing goes through it. The ten ported events are all
 *    archived, so the public schedule is empty until an admin publishes
 *    something — and `placeholderSaturdays()` fills the calendar with TBA in
 *    the meantime.
 * 2. **Rows become the shape the helpers already speak.** `toWorkshopEvent`
 *    maps a row to the existing `WorkshopEvent` interface, so the calendar,
 *    timeline and registration logic keep their current code and only change
 *    where their data comes from.
 *
 * The icon travels as a NAME and is resolved with `iconFor` at the point of
 * render. Resolving it here would put a React component in Server->Client
 * props, which cannot be serialized - the constraint EventsCalendar's own
 * docblock used to satisfy by reading the module array directly.
 */

const SELECT = {
  id: true,
  date: true,
  timeLabel: true,
  title: true,
  description: true,
  host: true,
  location: true,
  tag: true,
  accent: true,
  iconName: true,
  track: true,
  posterUrl: true,
  registrationOpen: true,
  register: true,
  externalHref: true,
  ctaLabel: true,
  youtubeId: true,
  duration: true,
  titleAccents: true,
  takeaways: true,
  topics: true,
  resources: true,
  durationMinutes: true,
} satisfies Prisma.WorkshopEventSelect;

type Row = Pick<WorkshopEventRow, keyof typeof SELECT>;

/**
 * A row in the shape the existing helpers and components already use.
 *
 * Optional keys are omitted rather than set to null, because the interface
 * declares them optional and `exactOptionalPropertyTypes`-style consumers
 * check with `?.` and `??`. A literal null would read as "present and empty".
 */
export function toWorkshopEvent(row: Row): WorkshopEvent {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    time: row.timeLabel,
    tag: row.tag,
    accent: row.accent,
    track: row.track.toLowerCase() as WorkshopEvent["track"],
    iconName: row.iconName,
    title: row.title,
    desc: row.description,
    host: row.host,
    location: row.location,
    registrationOpen: row.registrationOpen,
    ...(row.register ? { register: true } : {}),
    ...(row.externalHref ? { href: row.externalHref } : {}),
    ...(row.ctaLabel ? { ctaLabel: row.ctaLabel } : {}),
    ...(row.youtubeId ? { youtubeId: row.youtubeId } : {}),
    ...(row.titleAccents.length ? { titleAccents: row.titleAccents } : {}),
    ...(row.posterUrl ? { posterSrc: row.posterUrl } : {}),
    ...(row.duration ? { duration: row.duration } : {}),
    ...(row.takeaways.length ? { takeaways: row.takeaways } : {}),
    ...(row.topics.length ? { topics: row.topics } : {}),
    ...(row.resources
      ? { resources: row.resources as unknown as WorkshopResource[] }
      : {}),
    ...(row.durationMinutes != null
      ? { durationMinutes: row.durationMinutes }
      : {}),
  };
}

/**
 * Everything the public may see: published, not archived.
 *
 * `registrationOpen` and "is it upcoming" are deliberately NOT filtered here.
 * They are per-surface questions the existing helpers already answer —
 * `openWorkshops` wants upcoming ones, `pastEvents` wants finished ones — and
 * pre-filtering would make the past timeline permanently empty. This boundary
 * answers only "may the public see this row at all".
 */
export async function listPublicEvents(): Promise<WorkshopEvent[]> {
  const rows = await prisma.workshopEvent.findMany({
    where: { publishedAt: { not: null }, archivedAt: null },
    orderBy: { date: "asc" },
    select: SELECT,
  });
  return rows.map(toWorkshopEvent);
}

/** Every event, archived and unpublished included. Admin surfaces only. */
export async function listAllEvents(): Promise<WorkshopEvent[]> {
  const rows = await prisma.workshopEvent.findMany({
    orderBy: { date: "desc" },
    select: SELECT,
  });
  return rows.map(toWorkshopEvent);
}

/**
 * One event by id, whatever its state.
 *
 * Used where a roster is being read: `WorkshopRegistration.eventId` points at
 * archived events and always will, so this must not apply the public filter.
 */
export async function getEventById(
  id: string,
): Promise<WorkshopEvent | null> {
  const row = await prisma.workshopEvent.findUnique({
    where: { id },
    select: SELECT,
  });
  return row ? toWorkshopEvent(row) : null;
}

/** Titles for a set of ids, for admin roster tables. Avoids N reads. */
export async function getEventTitles(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.workshopEvent.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  return new Map(rows.map((r) => [r.id, r.title]));
}
