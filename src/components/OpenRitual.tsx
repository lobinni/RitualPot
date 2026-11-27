"use client";

import { useState } from "react";
import { getPot, openPot, type NewPot } from "@/lib/contracts";
import { PRESETS, type Preset } from "@/lib/presets";
import { CHAIN_ID, NATIVE_SYMBOL } from "@/lib/config";
import { describeWriteError } from "@/lib/chain";
import { formatWei } from "@/lib/format";
import { openOutcome, type Outcome } from "@/lib/outcome";
import { useWallet } from "./WalletProvider";
import { Banner, Busy, Field } from "./ui";

type FormState = {
  id: string;
  title: string;
  goal: string;
  periods: string;
  periodDays: string;
  stake: string;
  maxMembers: string;
  rounds: string;
  intervalMinutes: string;
  joinHours: string;
  rulingHours: string;
};

const INITIAL: FormState = {
  id: "",
  title: "",
  goal: "",
  periods: "3",
  periodDays: "1",
  stake: "1",
  maxMembers: "4",
  rounds: "2",
  intervalMinutes: "10",
  joinHours: "24",
  rulingHours: "48",
};

const DAY = 86400;

/** A decimal amount of the native token, to wei, without floating point drift. */
function toWei(input: string): bigint | null {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole) * BigInt(10) ** BigInt(18) + BigInt(padded);
}

type Tone = "done" | "refused" | "pending" | "error";
type BannerState = { tone: Tone; title: string; detail: string; key: number } | null;

export function OpenRitual() {
  const wallet = useWallet();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [banner, setBanner] = useState<BannerState>(null);
  const [preset, setPreset] = useState<Preset | null>(null);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  /** Fill all eleven fields from a shipped preset. Nothing is sent until the user signs. */
  const applyPreset = (next: Preset) => {
    setForm({ ...INITIAL, ...next.form });
    setPreset(next);
    setProblems([]);
    setBanner(null);
  };

  const validate = (): { errors: string[]; value: NewPot | null } => {
    const errors: string[] = [];
    const id = form.id.trim();
    const title = form.title.trim();
    const goal = form.goal.trim();
    const stakeWei = toWei(form.stake);

    if (!/^[a-z0-9._/-]{1,64}$/i.test(id)) {
      errors.push("identifier: 1 to 64 characters of letters, digits, dash, underscore, dot or slash");
    }
    if (!title || title.length > 80) errors.push("title: 1 to 80 characters");
    if (!goal || goal.length > 500) errors.push("goal: 1 to 500 characters, and it must be checkable against one page");

    const number = (value: string) => Number(value);
    const periods = number(form.periods);
    const periodSeconds = number(form.periodDays) * DAY;
    const rounds = number(form.rounds);
    const interval = number(form.intervalMinutes) * 60;
    const joinWindow = number(form.joinHours) * 3600;
    const rulingWindow = number(form.rulingHours) * 3600;
    const maxMembers = number(form.maxMembers);

    if (!(periods >= 2 && periods <= 6)) errors.push("periods: 2 to 6");
    if (!(periodSeconds >= 60 && periodSeconds <= 2592000)) errors.push("period length: 1 minute to 30 days");
    if (!(maxMembers >= 2 && maxMembers <= 8)) errors.push("members: 2 to 8");
    if (!(rounds >= 1 && rounds <= 2)) errors.push("agreeing rounds: 1 or 2");
    if (!(interval >= 60 && interval <= 2592000)) errors.push("round interval: 1 minute to 30 days");
    if (!(joinWindow >= 60 && joinWindow <= 2592000)) errors.push("joining window: 1 minute to 30 days");
    if (!(rulingWindow >= 60 && rulingWindow <= 2592000)) errors.push("ruling window: 1 minute to 30 days");
    if (stakeWei === null || stakeWei < BigInt(10) ** BigInt(18)) {
      errors.push(`stake: at least 1 ${NATIVE_SYMBOL}`);
    }
    if (
      !errors.length &&
      rulingWindow < maxMembers * periods * rounds * interval + 60
    ) {
      errors.push(
        `ruling window: at least ${maxMembers} members × ${periods} periods × ${rounds} rounds × ${interval}s, plus a minute`,
      );
    }

    if (errors.length || stakeWei === null) return { errors, value: null };
    return {
      errors: [],
      value: {
        id,
        title,
        goal,
        periods: String(periods),
        periodLen: String(periodSeconds),
        stake: stakeWei.toString(),
        maxMembers: String(maxMembers),
        rounds: String(rounds),
        interval: String(interval),
        joinWindow: String(joinWindow),
        rulingWindow: String(rulingWindow),
      },
    };
  };

  const submit = async () => {
    if (wallet.account && wallet.chainMismatch) {
      setBanner({
        tone: "refused",
        title: "The wallet is on another network",
        detail: `This console talks to chain ${CHAIN_ID}. Switch the wallet's network, then open the ritual again. Nothing was signed.`,
        key: Date.now(),
      });
      return;
    }
    if (!wallet.account || !wallet.provider) {
      setBanner({
        tone: "refused",
        title: "Connect a wallet first",
        detail: "Opening a ritual is a signed transaction. Reading the registry needs no wallet.",
        key: Date.now(),
      });
      return;
    }
    const { errors, value } = validate();
    setProblems(errors);
    if (!value) {
      setBanner({
        tone: "refused",
        title: "The form is not complete yet",
        detail: "Every rule has to be inside the contract's limits before it can be fixed on chain.",
        key: Date.now(),
      });
      return;
    }

    setBusy(true);
    setStage("");
    setBanner(null);
    try {
      await openPot(wallet.account, wallet.provider, value, (state, hash) =>
        setStage(
          state === "finalized"
            ? `finalized · ${hash.slice(0, 10)}…`
            : `accepted · ${hash.slice(0, 10)}…`,
        ),
      );
      const pot = await getPot(value.id);
      const outcome: Outcome = openOutcome(pot, wallet.account, NATIVE_SYMBOL);
      setBanner({
        tone: outcome.verdict === "done" ? "done" : outcome.verdict === "refused" ? "refused" : "pending",
        title: outcome.title,
        detail: outcome.detail,
        key: Date.now(),
      });
      if (outcome.verdict === "done") {
        // the id is spent: leave it empty so the next pot cannot collide with this one
        setForm((current) => ({ ...current, id: "" }));
        setPreset(null);
      }
    } catch (error) {
      setBanner({
        tone: "error",
        title: "The transaction did not go through",
        detail: describeWriteError(error),
        key: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label label-ink">eleven parameters, fixed in one transaction</p>
          <span className="chip chip-quiet">not payable</span>
        </div>

        <div className="mt-6 border-b border-[var(--t-line)] pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="label">load a preset</span>
            {PRESETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`btn ${preset?.id === entry.id ? "btn-primary" : ""}`}
                onClick={() => applyPreset(entry)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--t-muted)]">
            {preset
              ? preset.description
              : "Presets fill every field with values the contract accepts. Edit them freely - the identifier is one-shot, so a second pot needs a second id."}
          </p>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="identifier" hint="letters, digits, dash, underscore, dot, slash · up to 64">
            <input value={form.id} onChange={set("id")} placeholder="week-01-morning-run" />
          </Field>
          <Field label="title" hint="up to 80 characters">
            <input value={form.title} onChange={set("title")} placeholder="Morning run streak" />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="goal"
              hint="one sentence a stranger can check against a single page · up to 500 characters"
            >
              <textarea
                value={form.goal}
                onChange={set("goal")}
                placeholder="Run at least 3 km and log the distance, the time and the route on the page."
              />
            </Field>
          </div>

          <Field label="periods" hint="2 to 6">
            <input value={form.periods} onChange={set("periods")} inputMode="numeric" />
          </Field>
          <Field label="length of one period, in days" hint="1 minute to 30 days">
            <input value={form.periodDays} onChange={set("periodDays")} inputMode="decimal" />
          </Field>
          <Field label={`stake per member, in ${NATIVE_SYMBOL}`} hint="at least 1">
            <input value={form.stake} onChange={set("stake")} inputMode="decimal" />
          </Field>
          <Field label="member cap" hint="2 to 8">
            <input value={form.maxMembers} onChange={set("maxMembers")} inputMode="numeric" />
          </Field>
          <Field label="agreeing rounds for a final verdict" hint="1 or 2; two means one odd reading cannot decide">
            <input value={form.rounds} onChange={set("rounds")} inputMode="numeric" />
          </Field>
          <Field label="minutes between rounds" hint="1 minute to 30 days">
            <input value={form.intervalMinutes} onChange={set("intervalMinutes")} inputMode="numeric" />
          </Field>
          <Field label="hours the joining window stays open" hint="measured from now">
            <input value={form.joinHours} onChange={set("joinHours")} inputMode="numeric" />
          </Field>
          <Field label="hours allowed for ruling, after the last period" hint="must fit every round of every proof">
            <input value={form.rulingHours} onChange={set("rulingHours")} inputMode="numeric" />
          </Field>
        </div>

        {problems.length ? (
          <ul className="mt-6 border-l-2 border-[#c45b3e] pl-4 text-[13px] leading-relaxed text-[#8d5132]">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--t-line)] pt-6">
          <p className="label">
            {wallet.account ? "signed by your wallet" : "connect a wallet to send this"}
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? <Busy label="sending" /> : "open the ritual"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="card card-pad">
          <p className="label label-ink">result</p>
          <div className="mt-4">
            {banner ? (
              <Banner tone={banner.tone} title={banner.title} detail={banner.detail} />
            ) : (
              <p className="text-[13px] leading-relaxed text-[var(--t-muted)]">
                Opening changes nothing for anyone but the creator: no money moves here. Members
                bring the stake when they join, and every rule above is unreadable afterwards.
              </p>
            )}
          </div>
          {stage ? (
            <p className="label mt-5">last transaction · {stage}</p>
          ) : null}
        </div>

        <div className="card card-pad">
          <p className="label label-ink">what happens next</p>
          <ol className="mt-4 flex flex-col gap-4">
            {[
              ["joining opens", "Every member sends exactly the stake, before the window closes. A wrong amount is refused and credited, never lost."],
              ["one page per period", `Members freeze one https page while their period runs. Validators read only that frozen text.`],
              ["rounds decide", `The same answer has to arrive ${form.rounds} time${form.rounds === "1" ? "" : "s"}, ${form.intervalMinutes} minute${form.intervalMinutes === "1" ? "" : "s"} apart, before a verdict is final.`],
              ["the contract splits", `Refunds follow the periods kept; what is forfeited goes to the members who kept the most, ${formatWei(BigInt(10) ** BigInt(18))} dust aside.`],
            ].map(([title, detail], index) => (
              <li key={title} className="grid grid-cols-[24px_1fr] gap-3">
                <span className="mono text-[12px] text-[var(--t-accent-dark)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="label label-ink block">{title}</span>
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-[#2c3833]">
                    {detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
