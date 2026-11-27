"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Books,
  type EventRow,
  type Pot,
  getBooks,
  getRecentEvents,
  getPot,
  listPots,
  countEvents,
  countPots,
  setActiveAddress,
} from "@/lib/contracts";
import {
  CHAIN_ID,
  EXPLORER_BASE,
  NATIVE_SYMBOL,
  addressUrl,
  NETWORK_ID,
  buildTimeDeployment,
  isAddress,
  shortAddress,
  type ResolvedDeployment,
} from "@/lib/config";
import { formatWei, shortHex } from "@/lib/format";
import { WalletProvider, useWallet } from "./WalletProvider";
import { Hero } from "./Hero";
import { Registry, type RegistryItem } from "./Registry";
import { PotDetail } from "./PotDetail";
import { OpenRitual } from "./OpenRitual";
import { Activity } from "./Activity";
import { Trust } from "./Trust";
import { Mark, SectionHead } from "./ui";

type Status = "loading" | "ready" | "no-address" | "unreachable";
type Filter = "all" | "open" | "settled";

const PAGE = 6;

/** The dev endpoint can be silent rather than slow: bound every wait. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function Console() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  );
}

function Shell() {
  const wallet = useWallet();

  const [deployment, setDeployment] = useState<
    (ResolvedDeployment & { database?: boolean }) | null
  >(null);
  const [status, setStatus] = useState<Status>("loading");
  const [registry, setRegistry] = useState<Array<[string, string]>>([]);
  const [details, setDetails] = useState<Record<string, Pot | null>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [books, setBooks] = useState<Books | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counters, setCounters] = useState<{
    pots: number | null;
    events: number | null;
    held: string | null;
    balance: string | null;
  }>({ pots: null, events: null, held: null, balance: null });
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);

  /** Resolve the address, then read everything that does not depend on a page. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus((current) => (current === "ready" ? current : "loading"));
      let resolved: ResolvedDeployment;
      try {
        const response = await withTimeout(
          fetch("/api/deployment", { cache: "no-store" }),
          8000,
          "the deployment record did not answer",
        );
        resolved = (await response.json()) as ResolvedDeployment & { database?: boolean };
      } catch {
        resolved = buildTimeDeployment();
      }
      if (cancelled) return;
      setDeployment(resolved);

      if (!isAddress(resolved.address)) {
        setActiveAddress(null);
        setStatus("no-address");
        setRegistry([]);
        setCounters({ pots: null, events: null, held: null, balance: null });
        setBooks(null);
        setEvents([]);
        return;
      }

      setActiveAddress(resolved.address);
      try {
        const [page, bookRows, recent, potCount, eventCount] = await withTimeout(
          Promise.all([
            listPots(0, 50),
            getBooks(),
            getRecentEvents(8),
            countPots(),
            countEvents(),
          ]),
          25000,
          "the contract did not answer in time",
        );
        if (cancelled) return;
        setRegistry(page.items);
        setBooks(bookRows);
        setEvents(recent);
        setCounters({
          pots: potCount,
          events: eventCount,
          held: bookRows ? formatWei(bookRows.held) : null,
          balance: bookRows ? formatWei(bookRows.balance) : null,
        });
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("unreachable");
        setRegistry([]);
        setEvents([]);
        setBooks(null);
        setCounters({ pots: null, events: null, held: null, balance: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    if (filter === "all") return registry;
    if (filter === "open") return registry.filter(([, status]) => status === "open");
    return registry.filter(
      ([, entryStatus]) => entryStatus === "final" || entryStatus === "void",
    );
  }, [registry, filter]);

  const pageItems = filtered.slice(offset, offset + PAGE);
  const visibleIds = pageItems.map(([id]) => id);

  /** Only the cards on screen are fetched, and each one once. */
  useEffect(() => {
    if (status !== "ready" || visibleIds.length === 0) return;
    const missing = visibleIds.filter((id) => !(id in details));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const found = await Promise.all(missing.map((id) => getPot(id).catch(() => null)));
      if (cancelled) return;
      setDetails((current) => {
        const next = { ...current };
        missing.forEach((id, index) => {
          next[id] = found[index];
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [status, visibleIds.join("|"), details]);

  useEffect(() => {
    setOffset(0);
  }, [filter]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  const items: RegistryItem[] = pageItems.map(([id, entryStatus]) => ({
    id,
    status: entryStatus,
    pot: details[id] ?? null,
  }));

  const selectedExists = selected && filtered.some(([id]) => id === selected);

  return (
    <div className="min-h-screen">
      <Header onRetry={retry} status={status} />

      <main className="pb-24">
        <Hero deployment={deployment} counters={counters} status={status} />

        <Trust />

        <section className="shell band" id="registry" aria-labelledby="registry-title">
          <div id="registry-title">
            <SectionHead
              index="02 · the registry"
              title="Every ritual ever opened"
              intro="One page at a time, straight from the contract. Nothing is stored in this application, so an empty list is the truth about the deployment."
              aside={
                deployment?.address ? (
                  <a
                    className="btn"
                    href={`${EXPLORER_BASE}/address/${deployment.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on the explorer
                  </a>
                ) : null
              }
            />
          </div>

          {selectedExists && selected ? (
            <PotDetail
              id={selected}
              now={now}
              onBack={() => setSelected(null)}
              onChanged={retry}
            />
          ) : (
            <Registry
              items={items}
              total={filtered.length}
              offset={offset}
              pageSize={PAGE}
              status={status}
              filter={filter}
              onFilter={setFilter}
              onPage={setOffset}
              onSelect={setSelected}
              onRetry={retry}
              now={now}
            />
          )}
        </section>

        <section className="shell band" id="open" aria-labelledby="open-title">
          <div id="open-title">
            <SectionHead
              index="03 · opening"
              title="Fix every rule before anyone joins"
              intro="Goal, periods, stake, cap, rounds, joining window and ruling window are written once. There are no setters and no owner afterwards, which is the whole point."
            />
          </div>
          <OpenRitual />
        </section>

        <section className="shell band" id="activity" aria-labelledby="activity-title">
          <div id="activity-title">
            <SectionHead
              index="04 · the record"
              title="What the contract has done"
              intro="Append-only, paged, and never edited. Refusals are recorded alongside successes."
            />
          </div>
          <Activity events={events} books={books} status={status} onRetry={retry} />
        </section>
      </main>

      <Footer deployment={deployment} onSwitched={retry} wallet={wallet.account} />
    </div>
  );
}

function Header({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const wallet = useWallet();
  const [switchNote, setSwitchNote] = useState<string | null>(null);
  const links = [
    { href: "#registry", label: "registry" },
    { href: "#open", label: "open" },
    { href: "#activity", label: "record" },
  ];

  return (
    <header className="shell relative z-30 pt-6">
      <div
        className="flex flex-wrap items-center justify-between gap-6 border border-[var(--t-line)] bg-[#fbfcf9eb] px-4 py-3 backdrop-blur"
        style={{ minHeight: 74 }}
      >
        <a href="#registry" className="flex items-center gap-3 text-[var(--t-ink)] no-underline">
          <Mark size={30} />
          <span className="display text-[19px] leading-none">RitualPot</span>
          <span className="label hidden sm:inline">console</span>
        </a>

        <nav className="flex flex-wrap">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="label label-ink px-4 py-3 no-underline transition-colors hover:bg-[var(--t-accent-soft)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="label hidden md:inline">
            {status === "ready"
              ? "chain live"
              : status === "loading"
                ? "connecting"
                : status === "no-address"
                  ? "no contract"
                  : "offline"}
          </span>
          {status === "unreachable" ? (
            <button type="button" className="btn" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          {wallet.account ? (
            wallet.chainMismatch ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="chip chip-warn">
                  wallet on chain {wallet.walletChainId} (0x
                  {wallet.walletChainId?.toString(16)}) · expected {CHAIN_ID}
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setSwitchNote(null);
                    void wallet.switchChain().then((reason) => setSwitchNote(reason));
                  }}
                >
                  Switch network
                </button>
              </span>
            ) : wallet.walletChainId === CHAIN_ID ? (
              <span className="chip">
                <span className="dot live-dot" />
                wallet on {CHAIN_ID} · detected
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="chip chip-quiet">chain not read yet</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void wallet.refreshChain()}
                >
                  Re-check
                </button>
              </span>
            )
          ) : null}
          {wallet.account ? (
            <span className="flex items-center gap-3">
              <span className="chip chip-quiet mono">
                {shortAddress(wallet.account)}
                {wallet.balance !== null ? ` · ${wallet.balance} ${NATIVE_SYMBOL}` : ""}
              </span>
              <button type="button" className="btn" onClick={wallet.disconnect}>
                Disconnect
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={wallet.connecting}
              onClick={() => void wallet.connect()}
            >
              {wallet.connecting
                ? "connecting"
                : wallet.available
                  ? "connect wallet"
                  : "wallet not detected"}
            </button>
          )}
        </div>
      </div>

      {wallet.error || switchNote ? (
        <p className="mt-2 border border-[#c45b3e] bg-[#c45b3e14] px-4 py-3 text-[13px] leading-relaxed text-[#8d5132]">
          {wallet.error || switchNote}
        </p>
      ) : null}
    </header>
  );
}

function Footer({
  deployment,
  onSwitched,
  wallet,
}: {
  deployment: (ResolvedDeployment & { database?: boolean }) | null;
  onSwitched: () => void;
  wallet: string | null;
}) {
  const [candidate, setCandidate] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pointHere = async () => {
    if (!isAddress(candidate.trim())) {
      setNote("An address is 0x followed by 40 hexadecimal characters.");
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch("/api/deployment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          network: NETWORK_ID,
          address: candidate.trim(),
          updatedBy: wallet ?? "console",
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "the record could not be written");
      setCandidate("");
      setNote("Recorded. The console is now reading that contract.");
      onSwitched();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "the record could not be written");
    } finally {
      setSaving(false);
    }
  };

  return (
    <footer className="mt-24 border-t border-[var(--t-line)] bg-[#fbfcf9]">
      <div className="shell grid gap-10 py-14 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Mark size={28} />
            <span className="display text-[18px]">RitualPot</span>
          </div>
          <p className="prose-quiet mt-4 max-w-[520px]">
            The contract holds every rule and every coin. This console only reads it and asks for
            transactions: no pot, proof or record is stored here.
          </p>

          <dl className="mt-8 grid gap-px sm:grid-cols-2" style={{ background: "var(--t-line)" }}>
            <Fact label="network" value={deployment?.label ?? NETWORK_ID} />
            <Fact label="chain" value={deployment ? String(deployment.chainId) : "—"} />
            <Fact
              label="contract"
              value={deployment?.address ? shortAddress(deployment.address, 6) : "not recorded"}
            />
            <Fact
              label="address source"
              value={
                deployment?.source === "environment"
                  ? "environment variable"
                  : deployment?.source === "database"
                    ? "runtime record"
                    : deployment?.source === "registry"
                      ? "deployments/registry.json"
                      : "nothing recorded"
              }
            />
            <Fact label="source file" value={deployment?.contractSource ?? "contracts/RitualPot.py"} />
            <Fact label="native unit" value={deployment?.nativeSymbol ?? NATIVE_SYMBOL} />
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            {deployment?.address ? (
              <a
                className="btn"
                href={addressUrl(deployment.address)}
                target="_blank"
                rel="noreferrer"
              >
                {shortHex(deployment.address, 6)} · explorer
              </a>
            ) : null}
            <span className="chip chip-quiet">docs/TESTING.md</span>
            <span className="chip chip-quiet">samples/live-flow.md</span>
            <span className="chip chip-quiet">deployments/registry.json</span>
          </div>
        </div>

        <div className="card card-pad h-fit">
          <p className="label label-ink">point this instance at a contract</p>
          {deployment?.database === false ? (
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--t-muted)]">
              This instance runs without a database, so the address is read from the repository
              record and cannot be changed here. To move the console to another contract, record the
              address in the deployment record and redeploy — no environment variable is needed.
            </p>
          ) : null}
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--t-muted)]">
            The address is resolved from an environment variable, then this runtime record, then
            deployments/registry.json. Recording one here takes effect without a rebuild.
          </p>
          {deployment?.database === false ? null : (
            <div className="mt-5 flex flex-col gap-3">
              <input
                value={candidate}
                onChange={(event) => setCandidate(event.target.value)}
                placeholder="0x…"
                className="mono w-full border border-[var(--t-line)] bg-[#fbfcf9] px-3 py-3 text-[13px]"
                style={{ minHeight: 44 }}
                aria-label="contract address"
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void pointHere()}
              >
                {saving ? "recording" : "record the address"}
              </button>
              {note ? <p className="text-[13px] leading-relaxed text-[var(--t-muted)]">{note}</p> : null}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--t-line)]">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-6">
          <p className="label">RitualPot · MIT · deterministic payouts</p>
          <p className="label">
            {deployment?.address
              ? `${shortAddress(deployment.address, 8)} · ${deployment.network}`
              : "no contract recorded on this network"}
          </p>
        </div>
      </div>
    </footer>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#fbfcf9] p-4">
      <dt className="label">{label}</dt>
      <dd className="mono mt-2 break-all text-[12.5px]">{value}</dd>
    </div>
  );
}
