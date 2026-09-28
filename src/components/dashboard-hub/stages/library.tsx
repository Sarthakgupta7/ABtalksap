"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Blocks, Bot, Code2, Network, Sparkles, Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/* "Browse through our Library": a Cohorts / Challenges toggle over
   folder-shaped cards (tab rising from the top-left). Data is plain
   so it can cross the server → client boundary; icons are picked here. */

export type LibraryArt = "snowflake" | "databricks" | "ai" | "se" | "ds" | "claude" | "hackathon" | "cohort";

export type LibraryItem = {
  key: string;
  kicker: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  art: LibraryArt;
  days: number | null;
  daysLabel: string;
  modules: number | null;
};

const IMAGE: Partial<Record<LibraryArt, string>> = {
  snowflake: "/dashboard/snowflake.png",
  databricks: "/dashboard/databricks.png",
  cohort: "/dashboard/ai-cohort.svg",
  ai: "/dashboard/ai-cohort.svg",
};

const ICON: Record<LibraryArt, typeof Code2> = {
  snowflake: Blocks,
  databricks: Blocks,
  ai: Network,
  se: Code2,
  ds: BarChart3,
  claude: Sparkles,
  hackathon: Zap,
  cohort: Bot,
};

export function Library({ cohorts, challenges }: { cohorts: LibraryItem[]; challenges: LibraryItem[] }) {
  const [tab, setTab] = useState<"cohorts" | "challenges">(cohorts.length > 0 ? "cohorts" : "challenges");
  // Cohorts shows the three most relevant; challenges show in full.
  const items = tab === "cohorts" ? cohorts.slice(0, 3) : challenges;

  return (
    <section id="events" className="scroll-mt-24 pt-4">
      {/* A white folder: the heading sits in its flap (top-left), which
          slopes down into the body with a curved, angled join. The
          Cohorts / Challenges pills sit outside the folder, on the page. */}
      <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative min-w-0 self-start lg:self-end">
          <div className="relative rounded-tl-[22px] bg-white px-5 pb-[17px] pt-6 sm:px-8">
            <h3 className="font-heading text-xl font-bold leading-tight tracking-tight text-black sm:text-2xl lg:whitespace-nowrap">
              Browse through our <span className="text-[#03535F]">Library</span> and see more{" "}
              <span className="text-[#03535F]">suggested content</span>
            </h3>
            {/* Flap edge: an S-curve from the flap's top down into the body,
                sized to the flap's own height (never sets it). */}
            <svg
              viewBox="0 0 64 100"
              preserveAspectRatio="none"
              className="absolute left-[calc(100%-1px)] top-0 h-full w-20"
              aria-hidden="true"
            >
              <path d="M0 0 H4 C 26 0, 30 100, 64 100 H0 Z" fill="#FFFFFF" />
            </svg>
          </div>
        </div>

        <div role="tablist" aria-label="Library" className="flex shrink-0 gap-3 self-end pb-3">
          {(["cohorts", "challenges"] as const).map((t) => {
            const on = tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t)}
                className={cn(
                  "h-11 min-w-[128px] rounded-full px-6 text-sm font-semibold capitalize transition-colors sm:min-w-[150px] sm:text-base",
                  on
                    ? "bg-[#03535F] text-white shadow-[inset_0_-4px_12px_rgba(0,0,0,0.25)]"
                    : "border border-[#E3E7E7] bg-white text-[#6B7280] hover:text-[#03535F]",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="-mt-px rounded-b-[28px] rounded-tr-[28px] bg-white px-5 pb-6 pt-5 sm:px-8 sm:pb-8">
        {items.length === 0 ? (
          <p className="text-sm text-[#6B7280]">Nothing here right now — check back soon.</p>
        ) : (
          <ul id="prep-kit" className="grid scroll-mt-24 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
            {items.map((it) => (
              <FolderCard key={it.key} item={it} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* Artwork for items without an image, in the same language as the
   Snowflake / Databricks art: a pale wash, soft diagonal bars, and a
   glossy 3D-looking icon with depth and a highlight. */
const TINT: Record<LibraryArt, { from: string; to: string; bar: string; glow: string }> = {
  snowflake: { from: "#7CC8FF", to: "#1E88E5", bar: "rgba(90,170,255,0.18)", glow: "rgba(30,136,229,0.35)" },
  databricks: { from: "#FF8A7A", to: "#E53935", bar: "rgba(255,120,110,0.18)", glow: "rgba(229,57,53,0.35)" },
  ai: { from: "#6FE3D8", to: "#0B8C94", bar: "rgba(30,180,180,0.10)", glow: "rgba(11,140,148,0.35)" },
  cohort: { from: "#6FE3D8", to: "#0B8C94", bar: "rgba(30,180,180,0.10)", glow: "rgba(11,140,148,0.35)" },
  se: { from: "#9FA8FF", to: "#4B55D6", bar: "rgba(110,120,255,0.16)", glow: "rgba(75,85,214,0.35)" },
  ds: { from: "#FFC870", to: "#E08A00", bar: "rgba(255,190,90,0.18)", glow: "rgba(224,138,0,0.35)" },
  claude: { from: "#FFB38A", to: "#D9652B", bar: "rgba(255,160,110,0.18)", glow: "rgba(217,101,43,0.35)" },
  hackathon: { from: "#C89BFF", to: "#7B3FE4", bar: "rgba(170,120,255,0.16)", glow: "rgba(123,63,228,0.35)" },
};

function GlossyArt({ Icon, tint }: { Icon: typeof Code2; tint: (typeof TINT)[LibraryArt] }) {
  const id = `gloss-${tint.to.slice(1)}`;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(160deg,#FFFFFF_0%,#F3F7F9_100%)]" aria-hidden="true">
      {/* Soft diagonal bars, like the stripes behind the 3D logos */}
      <span className="absolute -left-6 top-6 h-8 w-[160%] -rotate-[38deg]" style={{ background: tint.bar }} />
      <span className="absolute -left-10 bottom-8 h-6 w-[160%] -rotate-[38deg]" style={{ background: tint.bar }} />
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tint.from} />
            <stop offset="1" stopColor={tint.to} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Depth copy underneath, then the lit face with a highlight */}
        <Icon className="absolute size-[92px] translate-x-[3px] translate-y-[5px] opacity-50" style={{ color: tint.to }} strokeWidth={3.2} />
        <Icon
          className="relative size-[92px]"
          style={{ color: `url(#${id})`, stroke: `url(#${id})`, filter: `drop-shadow(0 8px 12px ${tint.glow})` }}
          strokeWidth={3.2}
        />
      </div>
    </div>
  );
}

function FolderCard({ item }: { item: LibraryItem }) {
  const img = IMAGE[item.art];
  const Icon = ICON[item.art];
  return (
    <li>
      <article className="relative flex h-full overflow-hidden rounded-2xl border border-[#E6E9E9] bg-white shadow-[0_10px_24px_-20px_rgba(0,0,0,0.35)]">
        <div className="relative w-[34%] shrink-0 overflow-hidden bg-[#FAFBFC]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element -- small static artwork
            <img src={img} alt="" className="absolute inset-0 size-full object-contain" />
          ) : (
            <GlossyArt Icon={Icon} tint={TINT[item.art]} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#03535F]">{item.kicker}</p>
          <h4 className="mt-1 font-heading text-lg font-bold leading-tight text-black">{item.title}</h4>
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-[#4B4B4B]">{item.blurb}</p>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-2 pt-3">
          <div className="flex items-center gap-3 text-black">
            {item.days !== null ? (
              <span className="flex items-center gap-1.5">
                <Timer className="size-4" aria-hidden="true" />
                <span className="leading-none">
                  <span className="block text-[8px] font-semibold uppercase text-[#6B7280]">{item.days} days</span>
                  <span className="block text-[10px] font-bold uppercase">{item.daysLabel}</span>
                </span>
              </span>
            ) : null}
            {item.modules !== null ? (
              <>
                <span className="h-5 w-px bg-[#D9DEDE]" aria-hidden="true" />
                <span className="flex items-center gap-1.5">
                  <Blocks className="size-4" aria-hidden="true" />
                  <span className="leading-none">
                    <span className="block text-[8px] font-semibold uppercase text-[#6B7280]">{item.modules}</span>
                    <span className="block text-[10px] font-bold uppercase">Modules</span>
                  </span>
                </span>
              </>
            ) : null}
          </div>

            <Link
              href={item.href}
              className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[linear-gradient(180deg,#BFE3E3_0%,#9CCFD0_100%)] px-3 text-[11px] font-semibold text-[#03535F] shadow-[inset_0_-3px_8px_rgba(3,83,95,0.18),inset_0_1px_1px_rgba(255,255,255,0.6)] transition-[filter] hover:brightness-95"
            >
              {item.cta}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}
