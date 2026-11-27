"use client";

import type { ReactNode } from "react";
import type { Pot } from "@/lib/contracts";
import { formatWei, plural, untilText } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/config";
import { Banner, Skeleton } from "./ui";

export type RegistryItem = { id: string; status: string; pot: Pot | null };

type Props = {
  items: RegistryItem[];
  total: number;
  offset: number;
  pageSize: number;
  status: "loading" | "ready" | "no-address" | "unreachable";
  filter: "all" | "open" | "settled";
  onFilter: (filter: "all" | "open" | "settled") => void;
  onPage: (offset: number) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  now: number;
};

const FILTERS: Array<{ id: "all" | "open" | "settled"; label: string }> = [
  { id: "all", label: "every ritual" },
  { id: "open", label: "staking" },
  { id: "settled", label: "settled" },
];

export function Registry({
  items,
  total,
  offset,
  pageSize,
  status,
  filter,
  onFilter,
  onPage,
  onSelect,
  onRetry,
  now,
}: Props) {
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + pageSize, total);

  return (
    <div>
      <div className="rule-top rule-bottom mb-8 flex flex-wrap items-center justify-between gap-6">
        <div className="status-tabs flex flex-wrap">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onFilter(entry.id)}
              className={`label border-r border-[var(--t-line-soft)] px-[18px] transition-colors ${
                filter === entry.id
                  ? "bg-[var(--t-accent-soft)] text-[var(--t-accent-dark)]"
                  : "hover:bg-[#fbfcf9]"
              }`}
              style={{ minHeight: 50 }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="label">
          {status === "loading"
            ? "reading the registry"
            : status === "unreachable"
              ? "registry unavailable"
              : total === 0
                ? "nothing recorded yet"
                : `showing ${pageStart}–${pageEnd} of ${total}`}
        </p>
      </div>

      {status === "loading" && items.length === 0 ? (
        <div className="hair-grid">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex min-h-[340px] flex-col gap-4 bg-[#fbfcf9b8] p-[26px]">
              <Skeleton height={12} />
              <div className="mt-2">
                <Skeleton height={24} />
              </div>
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} />
              <div className="mt-auto">
                <Skeleton height={40} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {status === "unreachable" ? (
        <div className="card card-pad">
          <Banner
            tone="error"
            title="The network could not be read"
            detail="The console reached the configured endpoint but no answer came back. Nothing on this page is filled in until the contract answers."
            action={
              <button type="button" className="btn" onClick={onRetry}>
                Try again
              </button>
            }
          />
        </div>
      ) : null}

      {status === "ready" && items.length === 0 ? (
        <EmptyState
          eyebrow="the registry is empty"
          title="Nobody has opened a ritual on this contract yet."
          body="Opening one fixes the goal, the periods, the stake and the payout rule in a single transaction, before anybody joins."
          action={
            <a className="btn btn-primary" href="#open">
              Open the first ritual
            </a>
          }
        />
      ) : null}

      {status === "no-address" ? (
        <EmptyState
          eyebrow="no contract recorded"
          title="This instance is not pointed at a contract yet."
          body="Deploy contracts/RitualPot.py, then record its address in deployments/registry.json, through the deployment endpoint, or in the panel at the foot of this page. The console reads the chain and never substitutes sample values."
          action={
            <a className="btn" href="#activity">
              See how the record works
            </a>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <div className="hair-grid">
          {items.map((item) => (
            <RegistryCard
              key={item.id}
              item={item}
              now={now}
              loading={status === "loading"}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}

      {total > pageSize ? (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className="btn"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - pageSize))}
          >
            Previous
          </button>
          <p className="label">
            page {Math.floor(offset / pageSize) + 1} of {Math.ceil(total / pageSize)}
          </p>
          <button
            type="button"
            className="btn"
            disabled={offset + pageSize >= total}
            onClick={() => onPage(offset + pageSize)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="card-pad flex flex-col justify-center">
          <p className="label">{eyebrow}</p>
          <h3 className="display mt-4 text-[26px] leading-[1.1]">{title}</h3>
          <p className="prose-quiet mt-4 max-w-[440px]">{body}</p>
          <div className="mt-7">{action}</div>
        </div>
        <div className="relative min-h-[260px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="images/paper-cards.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(90deg, #fbfcf9 0%, #fbfcf966 32%, #fbfcf900 68%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RegistryCard({
  item,
  now,
  loading,
  onSelect,
}: {
  item: RegistryItem;
  now: number;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const pot = item.pot;
  const settled = item.status === "final" || item.status === "void";

  return (
    <article className="card card-hover flex min-h-[340px] flex-col p-[26px]">
      <header className="flex items-start justify-between gap-4">
        <p className="label label-ink break-all">{item.id}</p>
        <StatusChip status={item.status} />
      </header>

      {loading || !pot ? (
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton height={24} />
          <Skeleton height={14} />
          <Skeleton height={14} />
          <Skeleton height={14} />
        </div>
      ) : (
        <>
          <h3 className="display mt-5 text-[21px] leading-[1.15]">{pot.title}</h3>
          <p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-[#2c3833]">
            {pot.goal}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="chip chip-quiet">
              {formatWei(pot.stake)} {NATIVE_SYMBOL} each
            </span>
            <span className="chip chip-quiet">
              {pot.member_count}/{pot.max_members} members
            </span>
            <span className="chip chip-quiet">{plural(pot.periods, "period")}</span>
          </div>

          <footer className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-6">
            <div>
              <p className="label">{settled ? "closed" : "joining closes"}</p>
              <p className="mono mt-1.5 text-[12px]">
                {settled ? "settled" : `in ${untilText(pot.join_closes_at, now)}`}
              </p>
            </div>
            <button type="button" className="btn" onClick={() => onSelect(item.id)}>
              Inspect
            </button>
          </footer>
        </>
      )}
    </article>
  );
}

export function StatusChip({ status }: { status: string }) {
  if (status === "final") return <span className="chip">settled</span>;
  if (status === "void") return <span className="chip chip-quiet">void</span>;
  return (
    <span className="chip chip-warn">
      <span className="dot live-dot" />
      open
    </span>
  );
}
