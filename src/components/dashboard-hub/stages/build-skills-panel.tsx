import Link from "next/link";
import type { Domain } from "@prisma/client";
import { ArrowRight, BarChart3, Check, Code2, Network, Sparkles, Star } from "lucide-react";
import { isClaudeEnabled, isProgramEnabled } from "@/lib/feature-flags";
import { PROGRAM_AI_COHORT_BASE } from "@/features/program/constants";
import type { HubEnrollment } from "@/features/dashboard/get-hub-data";
import type { ActivityStreak } from "@/features/dashboard/compute-activity-streak";
import type { ActivityHeatmap as HeatmapData } from "@/features/dashboard/get-activity-heatmap";
import type { SixtyDay } from "@/features/dashboard/get-stage-data";
import { ContinueLearning, ProgressCard } from "./build-progress";
import { Library, type LibraryArt, type LibraryItem } from "./library";
import {
  ArrowLink,
  StageHeader,
} from "./stage-ui";

const TRACKS: {
  domain: Domain;
  name: string;
  blurb: string;
  path: string;
  Icon: typeof Code2;
}[] = [
  { domain: "SE", name: "Software Engineering", blurb: "Ship real software, one task a day", path: "/se", Icon: Code2 },
  { domain: "AI", name: "AI", blurb: "Build with models, agents and data", path: "/ai", Icon: Network },
  { domain: "DS", name: "Data Science", blurb: "Raw data into real insight", path: "/ds", Icon: BarChart3 },
  { domain: "CLAUDE", name: "Claude", blurb: "Master Claude AI in 60 days", path: "/claude", Icon: Sparkles },
];


type BuildSkillsPanelProps = {
  sixty: SixtyDay[];
  /** Primary track page (or /challenges) — Continue / Start again target. */
  trackHref: string;
  enrollments: HubEnrollment[];
  joinedDomains: Domain[];
  abandonedDomains: Domain[];
  streak: ActivityStreak;
  heatmap: HeatmapData;
  todayKey: string;
  hasProgramMembership: boolean;
  showDatabricks: boolean;
  showDsArchitect: boolean;
  showPowerBi: boolean;
  showSnowflake: boolean;
  showDatabricksAi: boolean;
};


export function BuildSkillsPanel(props: BuildSkillsPanelProps) {
  const { enrollments, streak } = props;
  const primary = enrollments.find((e) => e.status === "ACTIVE") ?? enrollments[0] ?? null;

  return (
    <div className="space-y-6">
      <StageHeader
        title={primary ? "Learn by" : "Learn by doing."}
        accent={primary ? "doing." : "Start your first track."}
        sub="One task a day for 60 days, shared on GitHub and LinkedIn. Every square you fill is proof of work."
        aside={primary ? <ArrowLink href="#test-skills">Next: Test skills</ArrowLink> : undefined}
        wide={!primary}
      />

      {primary ? (
        <>
          <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
            <ContinueLearning enrollments={enrollments} />
            <ProgressCard
              sixty={props.sixty}
              primary={primary}
              totalSubmissions={props.heatmap.totalSubmissionsInWindow}
              streak={streak}
            />
          </div>
        </>
      ) : (
        <FeaturedTrack removed={props.abandonedDomains.includes("AI")} />
      )}

      <MoreWays {...props} />
    </div>
  );
}

/* Who the featured track is for — the middle column of its body. */
/* Filled two-tone glyphs (same language as the stage illustrations). */
function PeopleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <circle cx="16.5" cy="8" r="3" fill="#2BB39A" />
      <path d="M12 19a4.5 4.5 0 0 1 9 0v1h-9z" fill="#2BB39A" />
      <circle cx="9" cy="8.5" r="3.5" fill="#03535F" />
      <path d="M3 20a6 6 0 0 1 12 0v.5H3z" fill="#03535F" />
    </svg>
  );
}

const AI_AUDIENCE: { title: string; body: string }[] = [
  { title: "Students", body: "1st year to final year, starting out in AI" },
  { title: "Recent graduates", body: "Building a portfolio for AI and ML roles" },
  { title: "Developers", body: "Adding models, agents and data to their stack" },
];

function TrackAudience() {
  return (
    <div className="lg:border-l lg:border-[#E9EDED] lg:pl-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">Who this course is for:</p>
      <ul className="mt-3 space-y-2.5">
        {AI_AUDIENCE.map(({ title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#03535F]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#1F1F1F]">{title}</span>
              <span className="block text-xs text-[#6B7280]">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Social proof on the featured track.
   TODO: placeholder figures from the design — replace with real counts. */
const AI_RATING = { score: 4.8, ratings: 203806, learners: 659313 };

function TrackStats() {
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <div className="flex items-center gap-5 self-start rounded-2xl border border-[#E3EBEB] bg-[linear-gradient(180deg,#FBFDFD_0%,#F2F7F7_100%)] px-5 py-3 md:self-end">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#FFF4E2]" aria-hidden="true">
          <Star className="size-5 fill-[#E08A12] text-[#E08A12]" />
        </span>
        <div>
          <p className="flex items-center gap-2 leading-none">
            <span className="font-heading text-xl font-bold text-[#1F1F1F]">{AI_RATING.score}</span>
            <span className="flex gap-px" aria-label={`Rated ${AI_RATING.score} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="size-3 fill-[#E08A12] text-[#E08A12]" aria-hidden="true" />
              ))}
            </span>
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">{fmt(AI_RATING.ratings)} ratings</p>
        </div>
      </div>
      <span className="h-9 w-px bg-[#D9E2E2]" aria-hidden="true" />
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#E4F2F2]" aria-hidden="true">
          <PeopleGlyph />
        </span>
        <div>
          <p className="font-heading text-xl font-bold leading-none text-[#1F1F1F]">{fmt(AI_RATING.learners)}</p>
          <p className="mt-1 text-xs text-[#6B7280]">learners</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Featured track (the one open pathway) ─────────────────── */

const AI_SKILLS = ["Playwright", "Postman", "CI/CD", "SQL", "Selenium"];
const AI_OUTCOMES = [
  "Build and maintain clean, reliable end-to-end test suites",
  "Manage test execution pipelines and CI/CD workflows",
  "Validate production-ready services and ensure quality at scale",
];

function FeaturedTrack({ removed }: { removed: boolean }) {
  return (
    <article id="domains" className="scroll-mt-24 overflow-hidden rounded-3xl border border-[#E6E9E9] bg-white shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)]">
      <div className="relative overflow-hidden bg-[#050A12] px-6 py-10 sm:px-10">
        {/* Artwork on the right, fading into the dark banner. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[58%] bg-cover bg-right sm:w-[48%]"
          style={{ backgroundImage: "url('/dashboard/ai-track.jpg')" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[58%] bg-[linear-gradient(90deg,#050A12_0%,rgba(5,10,18,0.55)_35%,rgba(5,10,18,0)_70%)] sm:w-[48%]"
          aria-hidden="true"
        />
        <div className="relative max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">01 / Career track</p>
          <h4 className="mt-2 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Artificial Intelligence
          </h4>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#1FB6C9]">
            Automation &amp; performance
          </p>
          <p className="mt-2 text-sm text-white/80">Build with models, agents and data.</p>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 sm:px-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] lg:gap-10">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">What you learn:</p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {AI_SKILLS.map((k) => (
              <li key={k} className="rounded-md border border-[#E3E7E7] bg-[#F7F8F8] px-3 py-1.5 text-xs text-[#1F1F1F]">
                {k}
              </li>
            ))}
          </ul>
          <ul className="mt-5 space-y-3">
            {AI_OUTCOMES.map((o) => (
              <li key={o} className="flex items-start gap-3 text-sm text-[#1F1F1F]">
                <Check className="mt-0.5 size-4 shrink-0 text-[#6B7280]" aria-hidden="true" />
                {o}
              </li>
            ))}
          </ul>
        </div>
        <TrackAudience />
        <div className="flex shrink-0 flex-col justify-between gap-6 lg:items-end">
          <TrackStats />
        <div className="flex shrink-0 flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Link href="/ai" className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[#03535F] hover:underline">
            Syllabus &amp; Projects <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href={removed ? "/ai" : "/register?domain=AI"}
            className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl bg-[linear-gradient(180deg,#0E6B76_0%,#03535F_100%)] px-8 text-sm font-semibold text-white shadow-[inset_0_-4px_12px_rgba(0,0,0,0.25),0_8px_18px_-10px_rgba(3,83,95,0.8)] transition-colors hover:bg-[#076573]"
          >
            {removed ? "View status" : "Enroll Now"}
          </Link>
        </div>
        </div>
      </div>
    </article>
  );
}

/* ─── More ways to build skills (events + programs) ────────── */

function cohortItems(p: BuildSkillsPanelProps): LibraryItem[] {
  const list: LibraryItem[] = [];
  const cohort = (x: Omit<LibraryItem, "kicker" | "daysLabel" | "cta"> & { cta?: string }): LibraryItem => ({
    kicker: "Cohort",
    daysLabel: "Cohort",
    cta: "View details",
    ...x,
  });
  if (p.showSnowflake) list.push(cohort({ key: "snowflake", title: "Snowflake Data & AI", blurb: "Build a governed Data + AI lakehouse on Snowflake in 15 days.", href: "/program/snowflake", art: "snowflake", days: 15, modules: 6 }));
  if (p.showDatabricksAi) list.push(cohort({ key: "databricks-ai", title: "Databricks Data & AI", blurb: "Build a governed Data + AI lakehouse on Databricks in 15 days.", href: "/program/databricks-ai", art: "databricks", days: 15, modules: 9 }));
  if (p.showDatabricks) list.push(cohort({ key: "databricks", title: "Databricks Lakehouse", blurb: "Build a healthcare-claims Lakehouse on Databricks in 31 days.", href: "/program/databricks", art: "databricks", days: 31, modules: 3 }));
  if (isProgramEnabled()) {
    list.push(cohort({
      key: "ai-cohort",
      title: "AI Cohort",
      blurb: "Build and deploy a production-grade enterprise AI chatbot in 31 days.",
      href: p.hasProgramMembership ? `${PROGRAM_AI_COHORT_BASE}/dashboard` : `${PROGRAM_AI_COHORT_BASE}/apply`,
      cta: p.hasProgramMembership ? "Continue" : "View details",
      art: "cohort",
      days: 31,
      modules: null,
    }));
  }
  if (p.showDsArchitect) list.push(cohort({ key: "ds-architect", title: "Data Solutions Architect", blurb: "Design AWS-first data and AI platforms in 10 days.", href: "/program/ds-architect", art: "cohort", days: 10, modules: null }));
  if (p.showPowerBi) list.push(cohort({ key: "powerbi", title: "Power BI & Analytics", blurb: "Ship recruiter-grade Power BI dashboards in 7 days.", href: "/program/powerbi", art: "ds", days: 7, modules: null }));
  return list;
}

function challengeItems(p: BuildSkillsPanelProps): LibraryItem[] {
  const joined = new Set(p.joinedDomains);
  const art: Record<Domain, LibraryArt> = { AI: "ai", SE: "se", DS: "ds", CLAUDE: "claude" };
  const tracks = TRACKS.filter((t) => t.domain !== "CLAUDE" || isClaudeEnabled()).map((t): LibraryItem => ({
    key: t.domain,
    kicker: "Challenge",
    title: t.name === "AI" ? "Artificial Intelligence" : t.name,
    blurb: t.blurb,
    href: joined.has(t.domain) ? t.path : `/register?domain=${t.domain}`,
    cta: joined.has(t.domain) ? "Continue" : "View details",
    art: art[t.domain],
    days: 60,
    daysLabel: "Challenge",
    modules: null,
  }));
  tracks.push({
    key: "hackathon",
    kicker: "Hackathon",
    title: "Vibe Code Hackathon",
    blurb: "48 hours, solo or in a team, building with AI against a real brief.",
    href: "/hackathon",
    cta: "View details",
    art: "hackathon",
    days: 2,
    daysLabel: "Event",
    modules: null,
  });
  return tracks;
}


function MoreWays(props: BuildSkillsPanelProps) {
  return <Library cohorts={cohortItems(props)} challenges={challengeItems(props)} />;
}


