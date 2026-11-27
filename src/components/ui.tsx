"use client";

import type { ReactNode } from "react";

/** The mark: a vessel holding the periods that were kept. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="RitualPot"
      fill="none"
    >
      <path
        d="M4.5 10.5 H27.5 L24.2 27.2 H7.8 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="miter"
      />
      <path d="M2 10.5 H30" stroke="currentColor" strokeWidth="1.8" />
      <rect x="10.2" y="15.4" width="3" height="7.4" fill="#35d5b4" />
      <rect x="14.6" y="12.6" width="3" height="10.2" fill="#35d5b4" />
      <rect x="19" y="17.4" width="3" height="5.4" fill="#35d5b4" />
    </svg>
  );
}

export function SectionHead({
  index,
  title,
  intro,
  aside,
}: {
  index: string;
  title: string;
  intro?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[640px]">
          <p className="label mb-4">{index}</p>
          <h2 className="section-title">{title}</h2>
          {intro ? <p className="prose-quiet mt-4 max-w-[560px]">{intro}</p> : null}
        </div>
        {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "light",
}: {
  label: string;
  value: string;
  tone?: "light" | "dark";
}) {
  const muted = tone === "dark" ? "text-[#f8fcf999]" : "text-[var(--t-muted)]";
  return (
    <div>
      <p className={`label ${tone === "dark" ? "text-[#f8fcf9b8]" : ""}`}>{label}</p>
      <p
        className={`mono mt-2 text-[22px] leading-none ${tone === "dark" ? "text-[#f8fcf9]" : "text-[var(--t-ink)]"}`}
      >
        {value}
      </p>
      <span className={`sr-only ${muted}`}>{label}</span>
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
    <label className="field">
      <span className="label label-ink">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Busy({ label = "Working" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 animate-spin border-[1.5px] border-current border-t-transparent"
      />
      <span>{label}</span>
    </span>
  );
}

export function Banner({
  tone,
  title,
  detail,
  action,
}: {
  tone: "done" | "refused" | "pending" | "error";
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  const styles: Record<string, string> = {
    done: "border-[var(--t-accent-dark)] bg-[var(--t-accent-soft)] text-[var(--t-ink)]",
    refused: "border-[#c45b3e] bg-[#c45b3e14] text-[#8d5132]",
    pending: "border-[var(--t-line)] bg-[#fbfcf9] text-[var(--t-ink)]",
    error: "border-[#c45b3e] bg-[#c45b3e14] text-[#8d5132]",
  };
  const kicker: Record<string, string> = {
    done: "confirmed by reading the contract",
    refused: "the contract refused this",
    pending: "not visible yet",
    error: "the network answered with an error",
  };
  return (
    <div className={`border-l-2 p-4 ${styles[tone]}`}>
      <p className="label" style={{ color: "inherit", opacity: 0.75 }}>
        {kicker[tone]}
      </p>
      <p className="display mt-2 text-[17px] leading-tight">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed opacity-90">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ height = 18 }: { height?: number }) {
  return <span className="skeleton block" style={{ height, width: "100%" }} />;
}
