"use client";

import type { Books, EventRow } from "@/lib/contracts";
import { formatWei, shortHex } from "@/lib/format";
import { NATIVE_SYMBOL, shortAddress } from "@/lib/config";
import { Banner } from "./ui";

type Props = {
  events: EventRow[];
  books: Books | null;
  status: "loading" | "ready" | "no-address" | "unreachable";
  onRetry: () => void;
};

/** One event, as a sentence. The console never dumps raw payloads. */
function describe(row: EventRow): { head: string; detail: string } {
  switch (row.event) {
    case "PotOpened":
      return {
        head: "Ritual opened",
        detail: `${shortAddress(String(row.creator ?? ""))} fixed a stake of ${formatWei(String(row.stake ?? "0"))} ${NATIVE_SYMBOL} for ${String(row.pot_id ?? "")}.`,
      };
    case "Joined":
      return {
        head: "Member staked",
        detail: `${shortAddress(String(row.member ?? ""))} joined ${String(row.pot_id ?? "")} as member ${String(row.index ?? "")}.`,
      };
    case "Proved":
      return {
        head: "Proof frozen",
        detail: `Member ${String(row.member ?? "")} posted a page for period ${Number(row.period ?? 0) + 1} of ${String(row.pot_id ?? "")}.`,
      };
    case "Ruled":
      return {
        head: row.finding === "ruled" ? "Round ruled" : "Round unclear",
        detail: `Member ${String(row.member ?? "")}, period ${Number(row.period ?? 0) + 1}: round ${String(row.round ?? "")} ended as ${String(row.outcome ?? "").replace("_", " ")}.`,
      };
    case "Settled":
      return {
        head: row.status === "void" ? "Ritual voided" : "Books written",
        detail: `${String(row.pot_id ?? "")} settled for ${String(row.members ?? "")} members.`,
      };
    case "Withdrawn":
      return {
        head: "Payout taken",
        detail: `Member ${String(row.member ?? "")} withdrew ${formatWei(String(row.amount ?? "0"))} ${NATIVE_SYMBOL} from ${String(row.pot_id ?? "")}.`,
      };
    default:
      return { head: String(row.event ?? "record"), detail: String(row.pot_id ?? "") };
  }
}

export function Activity({ events, books, status, onRetry }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label label-ink">newest records</p>
          <span className="label">append-only, paged</span>
        </div>

        {status === "loading" ? (
          <p className="mt-6 text-[13px] text-[var(--t-muted)]">reading the log…</p>
        ) : null}

        {status === "unreachable" ? (
          <div className="mt-5">
            <Banner
              tone="error"
              title="The log could not be read"
              detail="No records are shown until the contract answers. Nothing here is ever filled in with sample values."
              action={
                <button type="button" className="btn" onClick={onRetry}>
                  Try again
                </button>
              }
            />
          </div>
        ) : null}

        {status === "no-address" ? (
          <div className="mt-5">
            <Banner
              tone="pending"
              title="No contract recorded"
              detail="Record an address to read the log of a live deployment."
            />
          </div>
        ) : null}

        {status === "ready" && events.length === 0 ? (
          <p className="mt-6 text-[13.5px] leading-relaxed text-[var(--t-muted)]">
            The contract has recorded nothing yet. The first entry appears as soon as somebody opens
            a ritual.
          </p>
        ) : null}

        {events.length > 0 ? (
          <ul className="mt-5 flex flex-col">
            {events.map((row) => {
              const { head, detail } = describe(row);
              return (
                <li
                  key={row.n}
                  className="grid grid-cols-[52px_1fr] gap-4 border-b border-[var(--t-line-soft)] py-4 last:border-b-0"
                >
                  <span className="mono text-[11px] text-[var(--t-muted)]">
                    {String(row.n).padStart(4, "0")}
                  </span>
                  <span>
                    <span className="label label-ink block">{head}</span>
                    <span className="mt-1.5 block text-[13.5px] leading-relaxed text-[#2c3833]">
                      {detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <div className="card card-pad">
          <p className="label label-ink">the books</p>
          <div className="mt-5 grid gap-px" style={{ background: "var(--t-line)" }}>
            <BookRow
              label="contract balance"
              value={books ? `${formatWei(books.balance)} ${NATIVE_SYMBOL}` : "—"}
            />
            <BookRow
              label="held for members"
              value={books ? `${formatWei(books.held)} ${NATIVE_SYMBOL}` : "—"}
            />
            <BookRow
              label="credited, waiting to be taken back"
              value={books ? `${formatWei(books.credits)} ${NATIVE_SYMBOL}` : "—"}
            />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-[var(--t-muted)]">
            Balance is never below held plus credited: every coin in the books belongs to somebody.
          </p>
        </div>

        <div className="card card-pad">
          <p className="label label-ink">how to read this page</p>
          <ul className="mt-4 flex flex-col gap-3 text-[13px] leading-relaxed text-[#2c3833]">
            <li>
              Every line was written by the contract, in the order it happened. Nothing is cached
              into this application.
            </li>
            <li>
              Refusals are part of the record: a join the contract could not escrow shows up as a
              credit for that address alone.
            </li>
            <li>
              Rulings keep their unclear rounds on purpose, so a period can never be decided by a
              round that decided nothing.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function BookRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-[#fbfcf9] p-4">
      <span className="label">{label}</span>
      <span className="mono text-[14px]">{value}</span>
    </div>
  );
}

export function EventStamp({ hash }: { hash: string }) {
  return <span className="mono text-[11px]">{shortHex(hash, 6)}</span>;
}
