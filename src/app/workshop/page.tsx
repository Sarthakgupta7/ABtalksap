import type { Metadata } from "next";
import WorkshopHeader from "@/components/workshop/Header";
import { DashboardFooter } from "@/components/dashboard-hub/dashboard-footer";
import WorkshopHero from "@/components/workshop/WorkshopHero";
import WorkshopComingSoon from "@/components/workshop/WorkshopComingSoon";
import RegistrationModal from "@/components/workshop/RegistrationModal";
import TopicsSection from "@/components/workshop/TopicsSection";
import CommunityStats from "@/components/workshop/CommunityStats";
import EventsCalendar from "@/components/workshop/EventsCalendar";
import WorkshopThemeStyles from "@/components/workshop/WorkshopThemeStyles";
import { WorkshopShell } from "@/components/workshop/WorkshopShell";
import { auth } from "@/auth";
import {
  eventStartMs,
  fullDate,
  getRegistrableEvent,
} from "@/components/workshop/events-data";
import { getWorkshopPrefill } from "@/features/workshop/get-prefill";
import { getMyRegistration } from "@/features/workshop/registration-status";
import { getWorkshopConfig } from "@/lib/workshop-supabase";
import { listPublicEvents } from "@/repositories/workshop";

/*
 * Track-neutral on purpose.
 *
 * This used to name one specific session — "FREE 1-Hour Live LinkedIn
 * Workshop" — with a keyword list to match. That workshop ran on 21 August and
 * is archived, so every search result and link preview advertised a workshop
 * that is over: the same phantom as the hero's hardcoded title, just in the
 * <head> where it is easier to miss. Plan 163 phase 1c.
 *
 * Phase 2 can make this `generateMetadata` and describe whichever workshop is
 * actually published.
 */
export const metadata: Metadata = {
  title: "ABTalks | Live Workshops",
  description:
    "Free live workshops from ABTalks, most Saturdays on YouTube. Practical AI, career and build sessions — see what is coming up and catch the past recordings.",
  openGraph: {
    title: "ABTalks | Live Workshops",
    description:
      "Free live workshops from ABTalks, most Saturdays on YouTube.",
    type: "website",
  },
};

export default async function AIWorkshopPage() {
  // This page stays PUBLIC — the marketing content, countdown and calendar must
  // render for logged-out cold traffic. Only the form overlay is gated.
  const [config, session, events] = await Promise.all([
    getWorkshopConfig(),
    auth(),
    listPublicEvents(),
  ]);

  const event = getRegistrableEvent(events);
  const userId = session?.user?.id ?? null;

  const [alreadyRegistered, prefill] = userId
    ? await Promise.all([
        event
          ? getMyRegistration(userId, event.id).then((r) => r !== null)
          : Promise.resolve(false),
        getWorkshopPrefill(userId),
      ])
    : [false, null];

  const shellUser = {
    name: session?.user?.name ?? "",
    email: session?.user?.email ?? "",
    image: session?.user?.image ?? null,
  };

  return (
    <WorkshopShell user={shellUser} isAuthed={Boolean(userId)}>
      <div
        className="wk-root relative min-h-screen"
        style={{
          color: "var(--wk-text)",
          overflowX: "clip",
        }}
      >
        <WorkshopThemeStyles />
        <style>{`html { scroll-behavior: smooth; }`}</style>

        <WorkshopHeader isSignedIn={Boolean(userId)} />

        {/*
          No eligible workshop means no hero.

          `event` is `getRegistrableEvent(events)` over the published,
          unarchived list, so this branch is the single definition of "is there
          an active public workshop". The page used to have no branch at all:
          the hero, the topics and the countdown each carried their own
          fallback, and together they advertised a workshop that existed
          nowhere. Plan 163 phase 1c.

          The hero, the topics and the registration form all describe the SAME
          workshop. Passing primitives keeps that true and keeps the event's
          fields off the Server→Client boundary.
        */}
        {event ? (
          <>
            {/*
              Date, time and countdown come from the EVENT, not the Supabase
              config row. They used to come from `config`, so a workshop
              published for the 30th showed the config's 12th in the hero
              while the card and the calendar showed the 30th — two sources of
              truth for "when is the workshop", disagreeing on the largest
              thing on the page.

              `eventStartMs` parses date + time against a fixed +05:30 (IST has
              no daylight saving) and is what `openWorkshops` and `eventStatus`
              already use, so the hero, the sidebar and the registration gate
              now agree on one instant.
            */}
            <WorkshopHero
              webinarDate={fullDate(event.date)}
              webinarTime={event.time}
              webinarTargetUtc={new Date(eventStartMs(event)).toISOString()}
              eventTitle={event.title}
              eventAccents={event.titleAccents ?? []}
              eventDesc={event.desc}
              eventPoster={event.posterSrc ?? null}
            />

            <div id="curriculum" className="scroll-mt-16">
              <TopicsSection topics={event.topics ?? []} />
            </div>

            <CommunityStats />
          </>
        ) : (
          <WorkshopComingSoon />
        )}

        {/* `scroll-mt-16` clears the 54px sticky header so the calendar's
          heading is not hidden under it when "Discover events" jumps here. */}
        <div id="events" className="scroll-mt-16">
          <EventsCalendar events={events} />
        </div>

        {/* The same footer /marketplace and /dashboard render, rather than the
          charcoal --wk-bar-* one this page used to carry, so the bottom of the
          app is identical wherever you are. */}
        <DashboardFooter />

        {/* Opened by the `#register` hash — see RegistrationModal. Primitives
          only across the Server→Client boundary: never the session object or
          a WorkshopEvent (it carries a LucideIcon). */}
        <RegistrationModal
          whatsappLink={config.whatsappLink}
          isSignedIn={Boolean(userId)}
          sessionEmail={session?.user?.email ?? null}
          sessionName={session?.user?.name ?? null}
          registrationOpen={Boolean(event)}
          alreadyRegistered={alreadyRegistered}
          prefillName={prefill?.name ?? null}
          prefillPhone={prefill?.phone ?? null}
          prefillOrganization={prefill?.organization ?? null}
          prefillGraduationYear={prefill?.graduationYear ?? null}
          prefillRole={prefill?.role ?? null}
          isExistingMember={prefill?.isExistingMember ?? false}
        />
      </div>
    </WorkshopShell>
  );
}
