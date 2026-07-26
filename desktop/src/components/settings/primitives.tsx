import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-accent/60";

export const monoInputClass = `${inputClass} font-mono`;

export const selectClass =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-accent/60 disabled:opacity-40";

export const buttonClass =
  "shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-40";

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white/90">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent/80" : "bg-white/[0.12]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
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
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <select
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

export function StatusDot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-600"}`}
    />
  );
}
