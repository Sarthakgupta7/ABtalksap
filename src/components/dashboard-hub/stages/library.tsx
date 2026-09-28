"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Blocks, Bot, ChevronLeft, ChevronRight, Code2, Network, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/* Netflix-style library: two rows on a dark stage, each a horizontally
   scrolling strip of tiles with edge arrows. Data is plain so it can cross
   the server → client boundary; icons and art are picked here. */

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

/** Tile artwork. `logo` art sits on white and is shown whole; covers fill. */
const ART: Partial<Record<LibraryArt, { src: string; logo: boolean }>> = {
  snowflake: { src: "/dashboard/snowflake.png", logo: true },
  databricks: { src: "/dashboard/databricks.png", logo: true },
  cohort: { src: "/dashboard/ai-cohort.svg", logo: true },
  ai: { src: "/dashboard/ai-track.jpg", logo: false },
  se: { src: "/dashboard/track-thumb.png", logo: false },
  ds: { src: "/dashboard/track-ds.svg", logo: false },
  claude: { src: "/dashboard/track-claude.svg", logo: false },
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

const ROWS = {
  job: {
    title: "Get job-ready, fast",
    sub: "Mentor-led cohorts on the tools employers hire for — finish with a project recruiters can see.",
  },
  personal: {
    title: "Level up, one day at a time",
    sub: "Self-paced challenges and hackathons that build the habit of shipping.",
  },
} as const;

export function Library({ cohorts, challenges }: { cohorts: LibraryItem[]; challenges: LibraryItem[] }) {
  return (
    <section
      id="events"
      className="scroll-mt-24 overflow-hidden rounded-[28px] bg-[radial-gradient(120%_80%_at_0%_0%,#123238_0%,#0A1215_55%,#070B0D_100%)] py-7 text-white sm:py-9"
    >
      <div className="px-5 sm:px-8">
        <h3 className="font-heading text-2xl font-bold tracking-tight sm:text-[28px]">
          Your next <span className="text-[#2BD4A0]">binge-worthy</span> skill
        </h3>
        <p className="mt-1 text-sm text-white/65">Pick up something new — every title here is built to get you hired.</p>
      </div>
      <Row id="prep-kit" row={ROWS.job} items={cohorts} />
      <Row id="domains-library" row={ROWS.personal} items={challenges} />
    </section>
  );
}

function Row({ id, row, items }: { id: string; row: (typeof ROWS)[keyof typeof ROWS]; items: LibraryItem[] }) {
  const strip = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) =>
    strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.85, behavior: "smooth" });

  if (items.length === 0) return null;
  return (
    <div id={id} className="group/row mt-8 scroll-mt-24">
      <div className="flex items-end justify-between gap-4 px-5 sm:px-8">
        <div className="min-w-0">
          <h4 className="font-heading text-xl font-bold sm:text-2xl">{row.title}</h4>
          <p className="mt-0.5 text-sm text-white/60">{row.sub}</p>
        </div>
      </div>
      <div className="relative mt-4">
        <ul
          ref={strip}
          className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 py-3 sm:scroll-px-8 sm:px-8"
        >
          {items.map((it) => (
            <Tile key={it.key} item={it} />
          ))}
        </ul>
        <EdgeButton side="left" onClick={() => scroll(-1)} />
        <EdgeButton side="right" onClick={() => scroll(1)} />
      </div>
    </div>
  );
}

function EdgeButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={cn(
        "absolute inset-y-3 z-10 hidden w-12 items-center justify-center text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100 md:flex",
        side === "left"
          ? "left-0 bg-[linear-gradient(90deg,rgba(7,11,13,0.9),transparent)]"
          : "right-0 bg-[linear-gradient(270deg,rgba(7,11,13,0.9),transparent)]",
      )}
    >
      <Icon className="size-8" aria-hidden="true" />
    </button>
  );
}

function Tile({ item }: { item: LibraryItem }) {
  const art = ART[item.art];
  const Icon = ICON[item.art];
  const meta = [
    item.days !== null ? `${item.days} days` : null,
    item.modules !== null ? `${item.modules} modules` : null,
    item.kicker,
  ].filter(Boolean);
  return (
    <li className="w-[260px] shrink-0 snap-start sm:w-[290px]">
      <Link
        href={item.href}
        className="group/tile block overflow-hidden rounded-xl bg-[#141B1E] shadow-[0_12px_28px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/10 transition-[transform,box-shadow] duration-300 hover:z-10 hover:scale-[1.05] hover:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.9)] hover:ring-white/25 focus-visible:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2BD4A0]"
      >
        <div className={cn("relative aspect-[16/9] overflow-hidden", art?.logo ? "bg-white" : "bg-[#0A0F12]")}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- static tile art
            <img
              src={art.src}
              alt=""
              className={cn("absolute inset-0 size-full", art.logo ? "object-contain p-2" : "object-cover object-right")}
            />
          ) : (
            <GlossyArt Icon={Icon} tint={TINT[item.art]} />
          )}
          <span className="absolute left-2.5 top-2.5 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
            {item.kicker}
          </span>
        </div>
        <div className="p-3.5">
          <p className="truncate font-heading text-base font-bold">{item.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-white/60">
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-1.5">
                {i > 0 ? <span className="size-1 rounded-full bg-white/40" aria-hidden="true" /> : null}
                {m}
              </span>
            ))}
          </p>
          {/* Revealed on hover, Netflix-style */}
          <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-hover/tile:grid-rows-[1fr] group-focus-visible/tile:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <p className="mt-2 line-clamp-2 text-xs text-white/75">{item.blurb}</p>
              <span className="mt-3 inline-flex h-8 items-center gap-1 rounded-full bg-white px-3.5 text-xs font-bold text-[#0A1215]">
                {item.cta} <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
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

