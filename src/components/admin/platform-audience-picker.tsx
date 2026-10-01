"use client";

import { formatInTimeZone } from "date-fns-tz";
import { IST } from "@/lib/date-utils";

/**
 * Plan 166 — who a platform assessment goes to, and until when. Controlled:
 * the builder owns the state and sends it with Create. Rendered inside the
 * builder, so it reuses the builder's `hire-assess*` classes.
 */

export type ChallengeDomain = "AI" | "DS" | "SE" | "CLAUDE";

export type PlatformAudienceValue = {
  all: boolean;
  domains: ChallengeDomain[];
  workshopEventIds: string[];
};

export type PlatformAudienceOptions = {
  allCount: number;
  domains: { domain: ChallengeDomain; label: string; count: number }[];
  workshops: { eventId: string; label: string; count: number }[];
};

type Props = {
  options: PlatformAudienceOptions;
  audience: PlatformAudienceValue;
  onAudienceChange: (next: PlatformAudienceValue) => void;
  /** `YYYY-MM-DDTHH:mm`, read as IST. */
  deadlineLocal: string;
  onDeadlineChange: (next: string) => void;
  disabled: boolean;
  /**
   * Editing a sent assessment: the groups that already received it. They show
   * ticked and can't be unticked; more groups can be added.
   */
  lockedAudience?: PlatformAudienceValue;
};

/** A `datetime-local` value (IST wall clock) → ISO instant. */
export function istLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** An ISO instant → the `datetime-local` value for it on the IST wall clock. */
export function isoToIstLocal(iso: string): string {
  return formatInTimeZone(new Date(iso), IST, "yyyy-MM-dd'T'HH:mm");
}

/** The default deadline: 7 days from now, 11:59 PM IST. */
export function defaultDeadlineLocal(now: Date = new Date()): string {
  const day = formatInTimeZone(
    new Date(now.getTime() + 7 * 86_400_000),
    IST,
    "yyyy-MM-dd",
  );
  return `${day}T23:59`;
}

/** Upper bound on recipients; groups can overlap, so the real number may be lower. */
export function audienceEstimate(
  options: PlatformAudienceOptions,
  audience: PlatformAudienceValue,
): number {
  const workshops = options.workshops
    .filter((w) => audience.workshopEventIds.includes(w.eventId))
    .reduce((n, w) => n + w.count, 0);
  if (audience.all) return options.allCount + workshops;
  const domains = options.domains
    .filter((d) => audience.domains.includes(d.domain))
    .reduce((n, d) => n + d.count, 0);
  return domains + workshops;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function PlatformAudiencePicker({
  options,
  audience,
  onAudienceChange,
  deadlineLocal,
  onDeadlineChange,
  disabled,
  lockedAudience,
}: Props) {
  const minLocal = formatInTimeZone(new Date(), IST, "yyyy-MM-dd'T'HH:mm");
  const locked = lockedAudience ?? null;

  return (
    <section
      className="hire-assess__send"
      aria-labelledby="assess-audience-heading"
    >
      <div className="hire-assess__send-head">
        <h2 id="assess-audience-heading">Who gets this assessment</h2>
      </div>
      <p className="hire-assess-hint">
        {locked
          ? "Ticked groups already have this assessment and can't be removed. Tick more groups to send it to them too. Anyone who already has it doesn't get a second copy."
          : "Create publishes the assessment and gives it to everyone in these groups right now. People who join a group later won't receive it. It shows up in the Platform tab of their Assessments page."}
      </p>

      <fieldset className="hire-assess-assign__fieldset" disabled={disabled}>
        <legend className="sr-only">Audience</legend>
        <ul className="hire-assess-assign__list">
          <li>
            <label className="hire-assess-assign__row">
              <input
                type="checkbox"
                checked={audience.all}
                disabled={locked?.all}
                onChange={(e) =>
                  onAudienceChange({
                    ...audience,
                    all: e.target.checked,
                    // Domains a sent assessment already went to must stay.
                    domains: e.target.checked
                      ? (locked?.domains ?? [])
                      : audience.domains,
                  })
                }
              />
              <span className="hire-assess-assign__who">
                <span>All candidates</span>
                <span className="hire-assess-detail__role">
                  Everyone with a candidate profile ·{" "}
                  {options.allCount.toLocaleString("en-IN")}
                </span>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>

      <fieldset
        className="hire-assess-assign__fieldset"
        disabled={disabled || audience.all}
        aria-describedby={audience.all ? "audience-all-note" : undefined}
      >
        <legend className="hire-assess-field">
          <span>60-Day Challenge domain</span>
        </legend>
        {audience.all ? (
          <p id="audience-all-note" className="hire-assess-hint">
            Already included in All candidates.
          </p>
        ) : null}
        <ul className="hire-assess-assign__list">
          {options.domains.map((d) => (
            <li key={d.domain}>
              <label className="hire-assess-assign__row">
                <input
                  type="checkbox"
                  checked={audience.all || audience.domains.includes(d.domain)}
                  disabled={locked?.domains.includes(d.domain)}
                  onChange={() =>
                    onAudienceChange({
                      ...audience,
                      domains: toggle(audience.domains, d.domain),
                    })
                  }
                />
                <span className="hire-assess-assign__who">
                  <span>{d.label}</span>
                  <span className="hire-assess-detail__role">
                    {d.count.toLocaleString("en-IN")} enrolled
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="hire-assess-assign__fieldset" disabled={disabled}>
        <legend className="hire-assess-field">
          <span>Workshop registrants</span>
        </legend>
        {options.workshops.length === 0 ? (
          <p className="hire-assess__send-empty">
            No workshop registrations yet.
          </p>
        ) : (
          <ul className="hire-assess-assign__list">
            {options.workshops.map((w) => (
              <li key={w.eventId}>
                <label className="hire-assess-assign__row">
                  <input
                    type="checkbox"
                    checked={audience.workshopEventIds.includes(w.eventId)}
                    disabled={locked?.workshopEventIds.includes(w.eventId)}
                    onChange={() =>
                      onAudienceChange({
                        ...audience,
                        workshopEventIds: toggle(
                          audience.workshopEventIds,
                          w.eventId,
                        ),
                      })
                    }
                  />
                  <span className="hire-assess-assign__who">
                    <span>{w.label}</span>
                    <span className="hire-assess-detail__role">
                      {w.count.toLocaleString("en-IN")} registered
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label className="hire-assess-field">
        <span>Deadline (IST)</span>
        <input
          type="datetime-local"
          value={deadlineLocal}
          min={minLocal}
          disabled={disabled}
          onChange={(e) => onDeadlineChange(e.target.value)}
          required
        />
        <span className="hire-assess-hint">
          After this, the assessment closes. Anyone mid-attempt is submitted
          automatically with the answers they saved. Anyone who never started is
          marked as missed.
          {locked
            ? " Moving it later reopens the assessment for anyone who hasn't submitted yet."
            : null}
        </span>
      </label>
    </section>
  );
}
