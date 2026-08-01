import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

const controlBase =
  "focus-ring w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-100 transition-colors hover:border-white/20";

export const inputClass = `${controlBase} placeholder:text-zinc-600`;

export const monoInputClass = `${inputClass} font-mono`;

export const selectClass = `${controlBase} disabled:opacity-40`;

export const buttonClass =
  "focus-ring shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-40";

export const dangerButtonClass =
  "focus-ring shrink-0 rounded-lg border border-red-500/25 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10";

/** A titled group whose contents hang off an indent-guide rail. */
export function Group({
  label,
  children,
  footnote,
}: {
  label: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</h3>
      <div className="hairline-rail space-y-3 pl-4">{children}</div>
      {footnote && (
        <p className="max-w-[68ch] pl-4 text-[12px] leading-relaxed text-zinc-500">{footnote}</p>
      )}
    </section>
  );
}

/** Label and description on the left, control on the right; stacks in a narrow pane. */
export function SettingRow({
  label,
  description,
  detail,
  control,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  detail?: string;
  control?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.012] px-4 py-3">
      <div className="flex flex-col gap-3 @md:flex-row @md:items-start @md:justify-between">
        <div className="min-w-0 flex-1">
          <Label
            {...(htmlFor ? { htmlFor } : {})}
            className="block text-[13px] font-medium text-zinc-200"
          >
            {label}
          </Label>
          {detail && (
            <span className="mt-0.5 block font-mono text-[11px] text-zinc-400">{detail}</span>
          )}
          {description && (
            <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-zinc-400">{description}</p>
          )}
        </div>
        {control && <div className="shrink-0 @md:pt-0.5">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

const fieldLabelClass = "mb-1.5 block text-[12px] font-medium text-zinc-300";

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  const body = (
    <>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-relaxed text-zinc-400">{hint}</span>}
    </>
  );
  // Without an id to point at, the label has to wrap its control to name it.
  if (!htmlFor) {
    return (
      <label className="block">
        <span className={fieldLabelClass}>{label}</span>
        {body}
      </label>
    );
  }
  return (
    <div className="block">
      <label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
      </label>
      {body}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
        checked ? "border-white/70 bg-white/80" : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
          checked ? "translate-x-4 bg-void" : "translate-x-0 bg-zinc-400"
        }`}
      />
    </button>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  id,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  label?: string;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className={selectClass}
    >
      {!known && (
        <option value={value} className="bg-[#1a1a1a]">
          {value || placeholder || "Not set"}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Slider with a monospace readout; the value is part of the control, not the label. */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format,
  id,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  format?: (value: number) => string;
  id?: string;
}) {
  const text = format ? format(value) : String(value);
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={id ? undefined : label}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-accent focus-ring min-w-0 flex-1"
      />
      <output className="w-14 shrink-0 text-right font-mono text-[12px] text-zinc-300">{text}</output>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`focus-ring rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
              active ? "bg-white/[0.1] text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function OptionCard({
  selected,
  onSelect,
  title,
  description,
  visual,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  visual?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`focus-ring flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
        selected
          ? "border-accent/50 bg-white/[0.06]"
          : "border-white/[0.06] hover:border-white/20 hover:bg-white/[0.02]"
      }`}
    >
      {visual}
      <div className="min-w-0">
        <span className={`text-[13px] font-medium ${selected ? "text-white" : "text-zinc-300"}`}>
          {title}
        </span>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{description}</p>
      </div>
    </button>
  );
}

export function Disclosure({
  open,
  onToggle,
  header,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  header: (props: { buttonProps: DisclosureButtonProps }) => ReactNode;
  children: ReactNode;
}) {
  const panelId = useId();
  const buttonProps: DisclosureButtonProps = {
    type: "button",
    "aria-expanded": open,
    "aria-controls": panelId,
    onClick: onToggle,
  };
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06]">
      {header({ buttonProps })}
      {open && (
        <motion.div
          id={panelId}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.15 }}
          className="space-y-3 border-t border-white/[0.05] bg-white/[0.012] px-4 py-4"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

export interface DisclosureButtonProps {
  type: "button";
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: () => void;
}

/** Readiness as shape plus text, not colour alone. */
export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <span
        aria-hidden
        className={`h-[7px] w-[7px] rounded-full ${
          ok ? "bg-emerald-400" : "border border-zinc-500 bg-transparent"
        }`}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LiveMessage({
  tone = "muted",
  busy,
  children,
}: {
  tone?: "muted" | "ok" | "warn" | "error";
  busy?: boolean;
  children: ReactNode;
}) {
  const color =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400/90"
        : tone === "error"
          ? "text-red-400"
          : "text-zinc-400";
  return (
    <p role="status" aria-live="polite" aria-busy={busy} className={`text-[12px] leading-relaxed ${color}`}>
      {children}
    </p>
  );
}

/** Two-step inline confirm, mirroring the file tree's delete row. */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  onConfirm,
  tone = "danger",
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: "danger" | "neutral";
}) {
  const [armed, setArmed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!armed) return;
    const focusId = requestAnimationFrame(() => confirmRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setArmed(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      cancelAnimationFrame(focusId);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={tone === "danger" ? dangerButtonClass : buttonClass}
      >
        {label}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-zinc-300">{question}</span>
      <button
        ref={confirmRef}
        type="button"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className={tone === "danger" ? dangerButtonClass : buttonClass}
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className={buttonClass}>
        Keep
      </button>
    </div>
  );
}
