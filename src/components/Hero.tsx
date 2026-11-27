"use client";

import { shortAddress, type ResolvedDeployment } from "@/lib/config";
import { NATIVE_SYMBOL } from "@/lib/config";

type Props = {
  deployment: ResolvedDeployment | null;
  counters: {
    pots: number | null;
    events: number | null;
    held: string | null;
    balance: string | null;
  };
  status: "loading" | "ready" | "no-address" | "unreachable";
};

/**
 * The opening band: the network line, the claim, and the three numbers the contract
 * reports right now. Everything is read from the chain - nothing here is filled in.
 */
export function Hero({ deployment, counters, status }: Props) {
  const offline = status === "unreachable" || status === "no-address";

  const read = (value: string | number | null, fallback = "—") =>
    status === "loading" ? "…" : value === null ? fallback : String(value);

  return (
    <section className="night mt-6" aria-labelledby="hero-title">
      <div
        className="night-field"
        style={{ backgroundImage: "url(images/hero-field.jpg)" }}
        aria-hidden
      />
      <div className="night-grid" aria-hidden />
      <div className="night-veil" aria-hidden />

      <div className="shell relative z-10 flex min-h-[620px] flex-col justify-between py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="label" style={{ color: "#f8fcf9b8" }}>
            {deployment?.label ?? "Deployment"} · chain {deployment?.chainId ?? "—"}
          </p>
          <p className="label flex items-center gap-2" style={{ color: "#f8fcf9b8" }}>
            <span
              className={`dot ${offline ? "" : "live-dot"}`}
              style={{ color: offline ? "#f0a74b" : "#35d5b4" }}
            />
            {status === "loading"
              ? "reading the chain"
              : status === "no-address"
                ? "no contract recorded"
                : status === "unreachable"
                  ? "network unreachable"
                  : "live network"}
          </p>
        </div>

        <div className="mx-auto w-full max-w-[760px] text-center">
          <p className="label rise" style={{ color: "#35d5b4" }}>
            A group stake, judged in the open
          </p>
          <h1
            id="hero-title"
            className="display rise rise-1 mt-6 text-[clamp(44px,7vw,86px)] leading-[0.98]"
            style={{ letterSpacing: "-0.04em" }}
          >
            Everyone stakes.
            <br />
            <span style={{ color: "#35d5b4" }}>The keepers get paid.</span>
          </h1>
          <p
            className="rise rise-2 mx-auto mt-7 max-w-[560px] text-[15px] leading-relaxed"
            style={{ color: "#f8fcf9cc" }}
          >
            One proof page per period, judged against a goal fixed before anyone joined. The
            contract freezes the page, counts the periods kept and splits the money itself.
          </p>

          <div className="rise rise-3 mt-10 flex flex-wrap items-stretch justify-center gap-px" style={{ background: "#f8fcf92b" }}>
            <Counter label="rituals opened" value={read(counters.pots)} />
            <Counter label="value held" value={read(counters.held, "—")} unit={NATIVE_SYMBOL} />
            <Counter label="records written" value={read(counters.events)} />
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap gap-3">
            <Tile
              className="float-a"
              label="contract"
              value={deployment?.address ? shortAddress(deployment.address, 6) : "not recorded"}
              tone={deployment?.address ? "mint" : "warn"}
            />
            <Tile
              className="float-b"
              label="source"
              value={
                deployment?.source === "environment"
                  ? "environment"
                  : deployment?.source === "database"
                    ? "runtime record"
                    : deployment?.source === "registry"
                      ? "registry"
                      : "unset"
              }
            />
            <Tile
              className="float-c"
              label="contract file"
              value={deployment?.contractSource ?? "contracts/RitualPot.py"}
            />
          </div>
          <p className="label hidden md:block" style={{ color: "#f8fcf961" }}>
            {deployment?.network ?? "—"} · {deployment?.nativeSymbol ?? NATIVE_SYMBOL} ·
            deterministic payouts
          </p>
        </div>
      </div>
    </section>
  );
}

function Counter({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-[168px] flex-1 px-6 py-5 text-left" style={{ background: "#07110eb8" }}>
      <p className="label" style={{ color: "#f8fcf999" }}>
        {label}
      </p>
      <p className="mono mt-2 text-[26px] leading-none" style={{ color: "#f8fcf9" }}>
        {value}
        {unit && value !== "—" ? (
          <span className="ml-2 text-[12px]" style={{ color: "#35d5b4" }}>
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  className = "",
  tone = "plain",
}: {
  label: string;
  value: string;
  className?: string;
  tone?: "plain" | "mint" | "warn";
}) {
  const border =
    tone === "mint" ? "#35d5b466" : tone === "warn" ? "#f0a74b66" : "#f8fcf92b";
  return (
    <div
      className={`${className} min-w-[150px] px-4 py-3`}
      style={{ border: `1px solid ${border}`, background: "#07110ecc" }}
    >
      <p className="label" style={{ color: "#f8fcf999" }}>
        {label}
      </p>
      <p className="mono mt-1.5 text-[12px]" style={{ color: tone === "warn" ? "#f0a74b" : "#f8fcf9" }}>
        {value}
      </p>
    </div>
  );
}
