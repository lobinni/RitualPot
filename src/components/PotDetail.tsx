"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Payouts,
  type Pot,
  type Proof,
  type RoundRecord,
  type Schedule,
  getPot,
  getPayouts,
  getProof,
  getRound,
  getSchedule,
  join as joinContract,
  prove as proveContract,
  rule as ruleContract,
  settle as settleContract,
  withdrawCredit,
  withdrawMember,
} from "@/lib/contracts";
import { getCredit } from "@/lib/contracts";
import { CHAIN_ID, NATIVE_SYMBOL, shortAddress } from "@/lib/config";
import {
  clockText,
  durationText,
  formatWei,
  plural,
  shortHex,
  untilText,
} from "@/lib/format";
import {
  creditOutcome,
  joinOutcome,
  proveOutcome,
  roundOutcome,
  settleOutcome,
  withdrawOutcome,
  type Outcome,
} from "@/lib/outcome";
import { describeWriteError } from "@/lib/chain";
import { useWallet } from "./WalletProvider";
import { Banner, Busy, Field } from "./ui";
import { StatusChip } from "./Registry";

type Tone = "done" | "refused" | "pending" | "error";
type BannerState = { tone: Tone; title: string; detail: string; key: number } | null;

type Props = {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  now: number;
};

/** Everything a member can check before staking, read from the pot record itself. */
function TrustCard({ pot }: { pot: Pot }) {
  const rules: Array<[string, string]> = [
    ["goal", pot.goal],
    ["periods", `${pot.periods} × ${durationText(pot.period_len)}`],
    [
      "stake",
      `${formatWei(pot.stake)} ${NATIVE_SYMBOL} from every member, up to ${pot.max_members} members`,
    ],
    [
      "rulings",
      `${pot.rounds_required} agreeing round${pot.rounds_required > 1 ? "s" : ""}, ${durationText(pot.round_interval)} apart`,
    ],
    ["joining window", `${durationText(pot.join_window)}, closes ${clockText(pot.join_closes_at)}`],
    [
      "ruling window",
      `${durationText(pot.ruling_window)} after the last period, final deadline ${clockText(pot.final_deadline)}`,
    ],
    ["opened by", `${shortAddress(pot.creator)} on ${clockText(pot.created_at)}`],
  ];

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label label-ink">fixed before anyone joins</p>
        <span className="chip chip-quiet">no setters · no owner</span>
      </div>
      <dl className="mt-5">
        {rules.map(([term, value]) => (
          <div
            key={term}
            className="grid grid-cols-[132px_1fr] gap-4 border-b border-[var(--t-line-soft)] py-3 last:border-b-0"
          >
            <dt className="label pt-1">{term}</dt>
            <dd className="m-0 text-[13.5px] leading-relaxed text-[#2c3833]">{value}</dd>
          </div>
        ))}
      </dl>
      {pot.injection_flags?.length ? (
        <p className="mt-4 border-l-2 border-[#f0a74b] pl-3 text-[12.5px] leading-relaxed text-[#8d5132]">
          Phrasings that try to steer a judge were found in this pot and are stored with every
          round: {pot.injection_flags.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function ScheduleStrip({ schedule, now }: { schedule: Schedule | null; now: number }) {
  const steps = [
    { key: "join", label: "join", open: schedule?.can_join ?? false, at: schedule?.join_closes_at ?? 0 },
    { key: "prove", label: "prove", open: schedule?.can_prove ?? false, at: schedule?.periods_end ?? 0 },
    { key: "rule", label: "rule", open: schedule?.can_rule ?? false, at: schedule?.next_round_at ?? 0 },
    { key: "settle", label: "settle", open: schedule?.can_settle ?? false, at: schedule?.final_deadline ?? 0 },
  ];

  return (
    <div className="hair-grid">
      {steps.map((step) => (
        <div key={step.key} className="bg-[#fbfcf9b8] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="label label-ink">{step.label}</p>
            <span className={`chip ${step.open ? "" : "chip-quiet"}`}>
              {step.open ? "open" : "closed"}
            </span>
          </div>
          <p className="mono mt-3 text-[12px] text-[var(--t-muted)]">
            {step.open && step.at
              ? step.key === "rule"
                ? `next round in ${untilText(step.at, now)}`
                : `closes in ${untilText(step.at, now)}`
              : schedule
                ? `at ${clockText(step.at)}`
                : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PotDetail({ id, onBack, onChanged, now }: Props) {
  const wallet = useWallet();
  const [pot, setPot] = useState<Pot | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [payouts, setPayouts] = useState<Payouts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [member, setMember] = useState(0);
  const [period, setPeriod] = useState(0);
  const [proof, setProof] = useState<Proof | null>(null);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);

  const [banner, setBanner] = useState<BannerState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("");

  const [credit, setCredit] = useState<bigint | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofNote, setProofNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextPot, nextSchedule, nextPayouts] = await Promise.all([
        getPot(id),
        getSchedule(id),
        getPayouts(id),
      ]);
      setPot(nextPot);
      setSchedule(nextSchedule);
      setPayouts(nextPayouts);
      if (wallet.account) {
        try {
          setCredit(await getCredit(wallet.account));
        } catch {
          setCredit(null);
        }
      } else {
        setCredit(null);
      }
      setLoadError(null);
      if (nextPot) {
        setMember((current) => Math.min(current, Math.max(0, nextPot.member_count - 1)));
        setPeriod((current) => Math.min(current, Math.max(0, nextPot.periods - 1)));
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "the contract could not be read");
    } finally {
      setLoading(false);
    }
  }, [id, wallet.account]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await getProof(id, member, period);
        if (cancelled) return;
        setProof(found);
        const list: RoundRecord[] = [];
        for (let k = 1; k <= (found?.rounds ?? 0); k += 1) {
          const record = await getRound(id, member, period, k);
          if (record) list.push(record);
          if (cancelled) return;
        }
        setRounds(list);
      } catch {
        if (!cancelled) {
          setProof(null);
          setRounds([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, member, period, pot?.status, banner?.key]);

  const myIndex = useMemo(() => {
    if (!pot || !wallet.account) return -1;
    return pot.member_addrs.findIndex(
      (address) => address.toLowerCase() === wallet.account?.toLowerCase(),
    );
  }, [pot, wallet.account]);

  const show = (outcome: Outcome, tone?: Tone) =>
    setBanner({
      tone:
        tone ??
        (outcome.verdict === "done"
          ? "done"
          : outcome.verdict === "refused"
            ? "refused"
            : "pending"),
      title: outcome.title,
      detail: outcome.detail,
      key: Date.now(),
    });

  const guard = (): boolean => {
    if (wallet.account && wallet.chainMismatch) {
      show({
        verdict: "refused",
        title: "The wallet is on another network",
        detail: `This console talks to chain ${CHAIN_ID}. Switch the wallet's network, then send again. Nothing was signed.`,
      });
      return false;
    }
    if (!wallet.account || !wallet.provider) {
      show({
        verdict: "refused",
        title: "Connect a wallet first",
        detail: "Every write is signed by a wallet. Reads work without one.",
      });
      return false;
    }
    return true;
  };

  const run = async (label: string, task: () => Promise<Outcome>) => {
    if (!guard()) return;
    setBusy(label);
    setStage("");
    setBanner(null);
    try {
      show(await task());
      await refresh();
      onChanged();
    } catch (error) {
      show(
        {
          verdict: "refused",
          title: "The call did not go through",
          detail: describeWriteError(error),
        },
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const onJoin = () =>
    run("joining", async () => {
      if (!pot || !wallet.account) throw new Error("no pot or wallet");
      const creditBefore = await getCredit(wallet.account);
      await joinContract(
        wallet.account,
        wallet.provider,
        pot.pot_id,
        pot.stake,
        (hashState, hash) =>
          setStage(hashState === "finalized" ? `finalized · ${shortHex(hash, 6)}` : `accepted · ${shortHex(hash, 6)}`),
      );
      const after = await getPot(pot.pot_id);
      const creditAfter = await getCredit(wallet.account);
      return joinOutcome(
        after?.member_addrs ?? [],
        wallet.account,
        creditBefore,
        creditAfter,
        BigInt(pot.stake),
        NATIVE_SYMBOL,
      );
    });

  const onProve = () =>
    run("freezing the page", async () => {
      if (!pot || !wallet.account) throw new Error("no pot or wallet");
      const url = proofUrl.trim();
      if (!/^https:\/\//.test(url)) {
        return {
          verdict: "refused",
          title: "The proof must be an https page",
          detail: "Only a page the validators can fetch over https is worth freezing.",
        } as Outcome;
      }
      const before = await getProof(pot.pot_id, Math.max(myIndex, 0), period);
      await proveContract(wallet.account, wallet.provider, pot.pot_id, url, proofNote.trim(), (hashState, hash) =>
        setStage(hashState === "finalized" ? `finalized · ${shortHex(hash, 6)}` : `accepted · ${shortHex(hash, 6)}`),
      );
      const currentPeriod = schedule?.current_period ?? period;
      const after = await getProof(pot.pot_id, Math.max(myIndex, 0), currentPeriod);
      if (after) {
        setMember(after.member);
        setPeriod(after.period);
      }
      void before;
      return proveOutcome(Boolean(after));
    });

  const onRule = () =>
    run("running a round", async () => {
      if (!pot) throw new Error("no pot");
      const beforeRounds = proof?.rounds ?? 0;
      await ruleContract(wallet.account!, wallet.provider, pot.pot_id, member, period, (hashState, hash) =>
        setStage(hashState === "finalized" ? `finalized · ${shortHex(hash, 6)}` : `accepted · ${shortHex(hash, 6)}`),
      );
      const next = await getProof(pot.pot_id, member, period);
      const record = await getRound(pot.pot_id, member, period, beforeRounds + 1);
      if (next) setProof(next);
      return roundOutcome(beforeRounds, record);
    });

  const onSettle = () =>
    run("settling", async () => {
      if (!pot) throw new Error("no pot");
      await settleContract(wallet.account!, wallet.provider, pot.pot_id, (hashState, hash) =>
        setStage(hashState === "finalized" ? `finalized · ${shortHex(hash, 6)}` : `accepted · ${shortHex(hash, 6)}`),
      );
      const after = await getPot(pot.pot_id);
      return settleOutcome(after?.status ?? pot.status, after?.member_count ?? pot.member_count);
    });

  const onWithdraw = () =>
    run("withdrawing", async () => {
      if (!pot) throw new Error("no pot");
      await withdrawMember(wallet.account!, wallet.provider, pot.pot_id, (hashState, hash) =>
        setStage(hashState === "finalized" ? `finalized · ${shortHex(hash, 6)}` : `accepted · ${shortHex(hash, 6)}`),
      );
      const after = await getPayouts(pot.pot_id);
      const row = after.rows.find(
        (entry) => entry.address.toLowerCase() === wallet.account?.toLowerCase(),
      );
      return withdrawOutcome(Boolean(row?.withdrawn));
    });

  const onTakeCredit = () =>
    run("taking the credit back", async () => {
      if (!wallet.account) throw new Error("no wallet");
      const before = await getCredit(wallet.account);
      await withdrawCredit(wallet.account, wallet.provider, (hashState, hash) =>
        setStage(hashState === "finalized" ? `finalized · ${shortHex(hash, 6)}` : `accepted · ${shortHex(hash, 6)}`),
      );
      const after = await getCredit(wallet.account);
      return creditOutcome(before, after, NATIVE_SYMBOL);
    });

  if (loading) {
    return (
      <div className="card card-pad">
        <Busy label="reading the pot from the chain" />
      </div>
    );
  }

  if (!pot) {
    return (
      <div className="card card-pad">
        <Banner
          tone="error"
          title={loadError ? "The pot could not be read" : "No such pot"}
          detail={
            loadError ??
            "The contract does not hold a pot with this identifier on the recorded address."
          }
          action={
            <button type="button" className="btn" onClick={onBack}>
              Back to the registry
            </button>
          }
        />
      </div>
    );
  }

  const settled = pot.status !== "open";
  const currentPeriod = schedule?.current_period ?? -1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="button" className="btn" onClick={onBack}>
          ← Registry
        </button>
        <div className="flex items-center gap-3">
          <StatusChip status={pot.status} />
          <span className="label label-ink break-all">{pot.pot_id}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="label">ritual</p>
                <h3 className="display mt-3 text-[30px] leading-[1.08]">{pot.title}</h3>
              </div>
              <div className="text-right">
                <p className="label">stake per member</p>
                <p className="mono mt-2 text-[20px]">
                  {formatWei(pot.stake)} {NATIVE_SYMBOL}
                </p>
              </div>
            </div>
            <p className="prose-quiet mt-5">{pot.goal}</p>
            <div className="mt-6 grid grid-cols-2 gap-px" style={{ background: "var(--t-line)" }}>
              <Cell label="members" value={`${pot.member_count} of ${pot.max_members}`} />
              <Cell
                label="periods kept so far"
                value={`${payouts?.rows.reduce((sum, row) => sum + row.done, 0) ?? 0} of ${pot.periods * pot.member_count}`}
              />
              <Cell
                label="joining closes"
                value={`${clockText(pot.join_closes_at)} · in ${untilText(pot.join_closes_at, now)}`}
              />
              <Cell
                label="final deadline"
                value={`${clockText(pot.final_deadline)} · in ${untilText(pot.final_deadline, now)}`}
              />
            </div>
          </div>

          <TrustCard pot={pot} />
        </div>

        <div className="flex flex-col gap-6">
          <div className="card card-pad">
            <p className="label label-ink">what the contract accepts right now</p>
            <div className="mt-4">
              <ScheduleStrip schedule={schedule} now={now} />
            </div>
            {schedule ? (
              <p className="mt-4 text-[13px] leading-relaxed text-[var(--t-muted)]">
                Period {currentPeriod >= 0 ? currentPeriod + 1 : "—"} of {pot.periods} ·{" "}
                {schedule.unruled} proof{schedule.unruled === 1 ? "" : "s"} still waiting for a
                final verdict.
              </p>
            ) : null}
          </div>

          <div className="card card-pad">
            <p className="label label-ink">members</p>
            <div className="mt-4 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>address</th>
                    <th>kept</th>
                    <th className="text-right">payout</th>
                  </tr>
                </thead>
                <tbody>
                  {pot.member_addrs.map((address, index) => {
                    const row = payouts?.rows.find((entry) => entry.index === index);
                    return (
                      <tr key={address}>
                        <td className="mono">{index}</td>
                        <td className="mono">
                          <button
                            type="button"
                            className="underline decoration-[var(--t-line)] underline-offset-4 hover:decoration-[var(--t-accent-dark)]"
                            onClick={() => setMember(index)}
                          >
                            {shortAddress(address)}
                          </button>
                        </td>
                        <td className="mono">
                          {row ? `${row.done}/${pot.periods}` : "—"}
                        </td>
                        <td className="mono text-right">
                          {row ? `${formatWei(row.payout)} ${NATIVE_SYMBOL}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {pot.member_count === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-[var(--t-muted)]">
                        Nobody has staked yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {payouts?.settled ? (
              <p className="mt-4 border-l-2 border-[var(--t-accent)] pl-3 text-[13px] leading-relaxed text-[#2c3833]">
                The rows add up to {formatWei(BigInt(pot.stake) * BigInt(pot.member_count))}{" "}
                {NATIVE_SYMBOL} — exactly the stakes that came in.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- proofs and rulings */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label label-ink">frozen proof</p>
            <p className="mt-2 text-[13px] text-[var(--t-muted)]">
              The page as it was when it was posted. Editing the live page changes nothing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="field-input mono"
              value={member}
              onChange={(event) => setMember(Number(event.target.value))}
              style={{
                minHeight: 40,
                border: "1px solid var(--t-line)",
                background: "#fbfcf9",
                padding: "0 10px",
                fontSize: 12,
              }}
            >
              {pot.member_addrs.map((address, index) => (
                <option key={address} value={index}>
                  member {index} · {shortAddress(address)}
                </option>
              ))}
              {pot.member_addrs.length === 0 ? <option value={0}>no members yet</option> : null}
            </select>
            <select
              className="field-input mono"
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
              style={{
                minHeight: 40,
                border: "1px solid var(--t-line)",
                background: "#fbfcf9",
                padding: "0 10px",
                fontSize: 12,
              }}
            >
              {Array.from({ length: pot.periods }, (_, index) => (
                <option key={index} value={index}>
                  period {index + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            {proof ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-quiet">
                    {proof.total_chars} characters frozen
                  </span>
                  <span className="chip chip-quiet">
                    {plural(proof.rounds, "round")}
                  </span>
                  <span
                    className={`chip ${proof.final_verdict === "met" ? "" : proof.final_verdict === "not_met" ? "chip-clay" : "chip-quiet"}`}
                  >
                    {proof.final_verdict
                      ? `final: ${proof.final_verdict.replace("_", " ")}`
                      : "no final verdict"}
                  </span>
                </div>
                <p className="frozen-page mt-5">{proof.text}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Meta label="posted" value={clockText(proof.proved_at)} />
                  <Meta label="content hash" value={shortHex(proof.content_hash, 8)} />
                  <Meta label="page" value={proof.url.replace(/^https:\/\//, "")} />
                  <Meta label="note" value={proof.note || "—"} />
                </div>
              </>
            ) : (
              <div className="flex min-h-[180px] flex-col justify-center border border-dashed border-[var(--t-line)] p-6">
                <p className="display text-[18px]">No proof for this member and period.</p>
                <p className="prose-quiet mt-2">
                  A period without a proof is lost. Members post one page while the period is
                  running.
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="label label-ink">ruling rounds</p>
            {rounds.length === 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--t-muted)]">
                No round has been run for this proof yet. Anyone may run one once the period has
                ended and the interval has passed.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {rounds.map((round) => (
                  <li key={round.round} className="border border-[var(--t-line)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="label label-ink">round {round.round}</p>
                      <span
                        className={`chip ${round.finding === "ruled" ? "" : "chip-warn"}`}
                      >
                        {round.finding}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#2c3833]">
                      {round.finding === "ruled"
                        ? `Validators answered ${round.verdict.replace("_", " ")} · ${round.outcome.replace("_", " ")}.`
                        : `No verdict${round.reason ? ` (${round.reason.replace("_", " ")})` : ""}. The round is kept as evidence and moves nothing.`}
                    </p>
                    <p className="label mt-2">
                      {round.at_text} · {shortAddress(round.by)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card card-pad">
          <p className="label label-ink">your move</p>
          {!wallet.account ? (
            <p className="mt-4 text-[13px] leading-relaxed text-[var(--t-muted)]">
              Connect a wallet to stake, post a proof or withdraw. Reading everything on this page
              needs no wallet.
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-4">
            {!settled && schedule?.can_join ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--t-line)] p-4">
                <div>
                  <p className="label label-ink">stake and join</p>
                  <p className="mt-1.5 text-[13px] text-[var(--t-muted)]">
                    Exactly {formatWei(pot.stake)} {NATIVE_SYMBOL}, before{" "}
                    {clockText(pot.join_closes_at)}.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(busy) || myIndex >= 0}
                  onClick={onJoin}
                >
                  {myIndex >= 0 ? "already a member" : "join"}
                </button>
              </div>
            ) : null}

            {!settled && schedule?.can_prove ? (
              <div className="border border-[var(--t-line)] p-4">
                <p className="label label-ink">post this period&apos;s proof</p>
                <div className="mt-3 grid gap-3">
                  <Field label="proof page" hint="https, at most 1200 characters - sample pages: public/proofs/session-log.md">
                    <input
                      value={proofUrl}
                      onChange={(event) => setProofUrl(event.target.value)}
                      placeholder="https://…"
                      inputMode="url"
                    />
                  </Field>
                  <Field label="note" hint="optional, 160 characters">
                    <input
                      value={proofNote}
                      onChange={(event) => setProofNote(event.target.value)}
                      placeholder="what the page shows"
                    />
                  </Field>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="label">
                    {myIndex >= 0 ? `as member ${myIndex}` : "only members can prove"}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={Boolean(busy) || myIndex < 0}
                    onClick={onProve}
                  >
                    freeze the page
                  </button>
                </div>
              </div>
            ) : null}

            {!settled && schedule?.can_rule ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--t-line)] p-4">
                <div>
                  <p className="label label-ink">run a ruling round</p>
                  <p className="mt-1.5 text-[13px] text-[var(--t-muted)]">
                    Member {member}, period {period + 1}. Anyone may call this.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(busy)}
                  onClick={onRule}
                >
                  rule
                </button>
              </div>
            ) : null}

            {schedule?.can_settle ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--t-line)] p-4">
                <div>
                  <p className="label label-ink">write the books</p>
                  <p className="mt-1.5 text-[13px] text-[var(--t-muted)]">
                    Every period has ended. Unruled proofs count as not met after the final
                    deadline.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(busy)}
                  onClick={onSettle}
                >
                  settle
                </button>
              </div>
            ) : null}

            {settled && schedule?.can_withdraw && myIndex >= 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--t-line)] p-4">
                <div>
                  <p className="label label-ink">take your payout</p>
                  <p className="mt-1.5 text-[13px] text-[var(--t-muted)]">
                    {payouts?.rows.find((row) => row.index === myIndex)?.withdrawn
                      ? "Already withdrawn."
                      : `What the books name for member ${myIndex}, once.`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    Boolean(busy) ||
                    Boolean(payouts?.rows.find((row) => row.index === myIndex)?.withdrawn)
                  }
                  onClick={onWithdraw}
                >
                  withdraw
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--t-line)] p-4">
              <div>
                <p className="label label-ink">a join the contract refused</p>
                <p className="mt-1.5 text-[13px] text-[var(--t-muted)]">
                  Value that could not be escrowed stays yours alone. Take it back at any time.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={Boolean(busy) || !wallet.account}
                onClick={onTakeCredit}
              >
                take it back
              </button>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <p className="label label-ink">result</p>
          <div className="mt-4">
            {banner ? (
              <Banner tone={banner.tone} title={banner.title} detail={banner.detail} />
            ) : (
              <p className="text-[13px] leading-relaxed text-[var(--t-muted)]">
                Nothing has been sent from this panel yet. Every result here comes from reading the
                contract after the call, never from the transaction receipt alone.
              </p>
            )}
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-[var(--t-line-soft)] pt-5">
            <Meta
              label="last transaction"
              value={stage || "—"}
            />
            <Meta
              label="your credit"
              value={
                !wallet.account
                  ? "connect a wallet"
                  : credit === null
                    ? "—"
                    : `${formatWei(credit)} ${NATIVE_SYMBOL}`
              }
            />
            <Meta
              label="contract"
              value={`${shortAddress(pot.creator)} · creator`}
            />
          </div>
          {busy ? (
            <p className="mt-5 text-[var(--t-accent-dark)]">
              <Busy label={busy} />
            </p>
          ) : null}
        </div>
      </div>

      {payouts?.settled ? (
        <div className="card card-pad">
          <p className="label label-ink">payouts</p>
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>address</th>
                  <th>periods kept</th>
                  <th className="text-right">refund</th>
                  <th className="text-right">share of the forfeited</th>
                  <th className="text-right">payout</th>
                  <th className="text-right">taken</th>
                </tr>
              </thead>
              <tbody>
                {payouts.rows.map((row) => (
                  <tr key={row.index}>
                    <td className="mono">{row.index}</td>
                    <td className="mono">{shortAddress(row.address)}</td>
                    <td className="mono">
                      {row.done} of {pot.periods}
                    </td>
                    <td className="mono text-right">{formatWei(row.refund)}</td>
                    <td className="mono text-right">{formatWei(row.bonus)}</td>
                    <td className="mono text-right">
                      {formatWei(row.payout)} {NATIVE_SYMBOL}
                    </td>
                    <td className="mono text-right">{row.withdrawn ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#fbfcf9] p-4">
      <p className="label">{label}</p>
      <p className="mono mt-2 text-[13px]">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mono mt-1 break-all text-[12px] text-[#2c3833]">{value}</p>
    </div>
  );
}
