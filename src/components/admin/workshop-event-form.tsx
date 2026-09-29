"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { knownIconNames } from "@/components/workshop/events-data";
import {
  WORKSHOP_TRACKS,
  deriveWorkshopId,
} from "@/lib/validations/workshop";
import {
  createWorkshopAction,
  updateWorkshopAction,
} from "@/app/actions/admin-workshop-actions";

export type WorkshopFormValues = {
  id: string | null;
  date: string;
  timeLabel: string;
  title: string;
  description: string;
  host: string;
  location: string;
  tag: string;
  accent: string;
  iconName: string;
  track: string;
  registrationOpen: boolean;
  register: boolean;
  externalHref: string;
  ctaLabel: string;
  youtubeId: string;
  duration: string;
  titleAccents: string;
  takeaways: string;
  topics: string;
};

export const EMPTY_WORKSHOP: WorkshopFormValues = {
  id: null,
  date: "",
  timeLabel: "7:00 PM IST",
  title: "",
  description: "",
  host: "ABTalks",
  location: "Live · YouTube",
  tag: "Workshop",
  accent: "#03535F",
  iconName: "CalendarClock",
  track: "WORKSHOP",
  registrationOpen: true,
  register: true,
  externalHref: "",
  ctaLabel: "",
  youtubeId: "",
  duration: "",
  titleAccents: "",
  topics: "",
  takeaways: "",
};

/** One line per entry, which is how these read and edit most naturally. */
const lines = (value: string): string[] =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Create / edit a workshop. Plan 163 phase 2.
 *
 * One component for both, because the fields are identical — the only
 * difference is that an existing workshop shows its id, read-only.
 *
 * **The id is derived from the date on create and then never changes.** It is
 * the roster key: `WorkshopRegistration.eventId` points at it by string, 366
 * rows deep across the legacy events. Editing a workshop's date therefore moves
 * only the date; the id stays, and the registrations stay with it.
 */
export function WorkshopEventForm({
  initial,
  onDone,
}: {
  initial: WorkshopFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const isEdit = initial.id !== null;

  function set<K extends keyof WorkshopFormValues>(
    key: K,
    value: WorkshopFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit() {
    const payload = {
      ...(isEdit ? { id: initial.id } : {}),
      date: values.date,
      timeLabel: values.timeLabel,
      title: values.title,
      description: values.description,
      host: values.host,
      location: values.location,
      tag: values.tag,
      accent: values.accent,
      iconName: values.iconName,
      track: values.track,
      registrationOpen: values.registrationOpen,
      register: values.register,
      externalHref: values.externalHref,
      ctaLabel: values.ctaLabel,
      youtubeId: values.youtubeId,
      duration: values.duration,
      titleAccents: lines(values.titleAccents),
      takeaways: lines(values.takeaways),
      topics: lines(values.topics),
      resources: [],
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateWorkshopAction(payload)
        : await createWorkshopAction(payload);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(isEdit ? "Workshop saved" : "Workshop created");
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input
            type="date"
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
            disabled={pending}
          />
          {/*
            Shown live on create so the roster key is never a surprise, and
            frozen on edit so nobody expects a date change to move it.
          */}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {isEdit
              ? `id: ${initial.id} (fixed — it is the roster key)`
              : values.date
                ? `id: ${deriveWorkshopId(values.date)}`
                : "id: set a date"}
          </p>
        </Field>

        <Field label="Time">
          <Input
            value={values.timeLabel}
            onChange={(e) => set("timeLabel", e.target.value)}
            disabled={pending}
          />
        </Field>
      </div>

      <Field label="Title">
        <Input
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          disabled={pending}
        />
      </Field>

      <Field label="Description">
        <Textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          disabled={pending}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Host">
          <Input
            value={values.host}
            onChange={(e) => set("host", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Location">
          <Input
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Tag">
          <Input
            value={values.tag}
            onChange={(e) => set("tag", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Accent (hex)">
          <Input
            value={values.accent}
            onChange={(e) => set("accent", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Track">
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={values.track}
            onChange={(e) => set("track", e.target.value)}
            disabled={pending}
          >
            {WORKSHOP_TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon">
          {/*
            A list, not free text: an unknown name renders a blank card with no
            error, so it cannot be typed in the first place.
          */}
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={values.iconName}
            onChange={(e) => set("iconName", e.target.value)}
            disabled={pending}
          >
            {knownIconNames().map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-5">
        <Toggle
          label="Registration open"
          hint="Independent of publishing. A published workshop with this off stays out of the public page."
          checked={values.registrationOpen}
          onChange={(v) => set("registrationOpen", v)}
          disabled={pending}
        />
        <Toggle
          label="Links to the registration form"
          checked={values.register}
          onChange={(v) => set("register", v)}
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Topics (one per line)">
          <Textarea
            value={values.topics}
            onChange={(e) => set("topics", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Title accents (one per line)">
          <Textarea
            value={values.titleAccents}
            onChange={(e) => set("titleAccents", e.target.value)}
            disabled={pending}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving..." : isEdit ? "Save changes" : "Create workshop"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex max-w-sm items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
