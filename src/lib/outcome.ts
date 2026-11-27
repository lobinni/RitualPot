/**
 * A transaction can be agreed by consensus and still not do what the user asked: `join` refuses a
 * stake it cannot accept in its return value and books the money as a credit (a refused payable
 * call must not revert, or the value would be lost), and a ruling round may produce no verdict.
 *
 * The console therefore never reports success from the receipt alone. It reads the contract after
 * the call and decides with these functions, which are pure so the rules are readable and testable.
 */

export type Verdict = "done" | "refused" | "pending";

export type Outcome = {
  verdict: Verdict;
  title: string;
  detail: string;
  /** Wei the user can take back with withdraw_credit, when the call was refused. */
  credit?: string;
};

const ONE = BigInt(10) ** BigInt(18);

const formatUnits = (wei: bigint, decimals = 6): string => {
  const whole = wei / ONE;
  const fraction = (wei % ONE).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction.slice(0, decimals)}` : `${whole}`;
};

const WAITING: Outcome = {
  verdict: "pending",
  title: "Waiting for the chain",
  detail: "Nothing is visible yet. The record updates once the transaction is decided.",
};

/** After open: does a pot with this id exist, opened by this account? (opening is not payable.) */
export function openOutcome(
  pot: { creator: string; stake: string } | null,
  account: string,
  symbol: string,
): Outcome {
  if (pot && pot.creator.toLowerCase() === account.toLowerCase()) {
    return {
      verdict: "done",
      title: "Ritual opened",
      detail: `Every member stakes ${formatUnits(BigInt(pot.stake))} ${symbol}; the goal, the periods and the payout rule are fixed now and nobody can change them.`,
    };
  }
  if (pot) {
    return {
      verdict: "refused",
      title: "The ritual was NOT opened",
      detail: "That identifier already belongs to another account. Choose a different one.",
    };
  }
  return WAITING;
}

/** After join: did the member list grow with this account, or did the stake become a credit? */
export function joinOutcome(
  members: string[],
  account: string,
  creditBefore: bigint,
  creditAfter: bigint,
  sent: bigint,
  symbol: string,
): Outcome {
  if (members.some((member) => member.toLowerCase() === account.toLowerCase())) {
    return {
      verdict: "done",
      title: "You are in",
      detail: `Your ${formatUnits(sent)} ${symbol} stake is escrowed. Post one proof in each period to earn it back.`,
    };
  }
  if (sent > BigInt(0) && creditAfter - creditBefore >= sent) {
    return {
      verdict: "refused",
      title: "You did NOT join",
      detail: `The contract refused the join (wrong amount, closed, full, or already a member) and kept your ${formatUnits(sent)} ${symbol} as a credit for you alone. Take it back whenever you like.`,
      credit: (creditAfter - creditBefore).toString(),
    };
  }
  return WAITING;
}

/** After prove: is there a proof for this member and period now? */
export function proveOutcome(proofSeen: boolean): Outcome {
  return proofSeen
    ? {
        verdict: "done",
        title: "Proof frozen",
        detail:
          "The page is stored whole on chain for this period. Rulings read only that text, so editing the live page changes nothing.",
      }
    : WAITING;
}

export type RoundSeen = {
  finding: string;
  outcome: string;
  reason: string;
  verdict: string;
  round: number;
} | null;

const describeVerdict = (verdict: string) =>
  verdict === "met"
    ? "the goal was met"
    : verdict === "not_met"
      ? "the goal was NOT met"
      : verdict;

/** After rule: say what the round did. A round with no verdict is evidence, not an error. */
export function roundOutcome(roundsBefore: number, round: RoundSeen): Outcome {
  if (!round || round.round <= roundsBefore) return WAITING;
  if (round.outcome === "final") {
    return {
      verdict: "done",
      title: "Verdict final",
      detail: `Enough rounds agreed: ${describeVerdict(round.verdict)}.`,
    };
  }
  if (
    round.outcome === "proposed" ||
    round.outcome === "confirmed" ||
    round.outcome === "restarted"
  ) {
    return {
      verdict: "done",
      title: "Round counted",
      detail: `Validators ruled this round: ${describeVerdict(round.verdict)}. More agreeing rounds are still needed.`,
    };
  }
  return {
    verdict: "refused",
    title: "The round produced no verdict",
    detail: `Validators could not rule${round.reason ? ` (${round.reason})` : ""}. The round is kept as evidence and moves nothing.`,
  };
}

/** After settle: the pot must have left "open". */
export function settleOutcome(status: string, members: number): Outcome {
  if (status === "final") {
    return {
      verdict: "done",
      title: "Books written",
      detail: `The payouts for ${members} members are on the record. Each takes its share.`,
    };
  }
  if (status === "void") {
    return {
      verdict: "done",
      title: "Ritual voided",
      detail: "Fewer than two members joined, so every stake comes back in full.",
    };
  }
  return WAITING;
}

/** After withdraw_member: is the payout marked withdrawn? */
export function withdrawOutcome(withdrawn: boolean): Outcome {
  return withdrawn
    ? {
        verdict: "done",
        title: "Payout withdrawn",
        detail: "The payout is on its way to your wallet; it lands when the transaction is finalized.",
      }
    : WAITING;
}

/** After withdraw_credit: did the credit go to zero? */
export function creditOutcome(
  creditBefore: bigint,
  creditAfter: bigint,
  symbol: string,
): Outcome {
  if (creditBefore > BigInt(0) && creditAfter === BigInt(0)) {
    return {
      verdict: "done",
      title: "Credit withdrawn",
      detail: `${formatUnits(creditBefore)} ${symbol} is on its way to your wallet; it lands when the transaction is finalized.`,
    };
  }
  return {
    verdict: "pending",
    title: "Waiting for the chain",
    detail: "The credit is still on the record. Refresh once the transaction is decided.",
  };
}

/** The label a status gets on screen. */
export const statusLabel = (status: string) =>
  status === "final" ? "settled" : status === "void" ? "void" : "open";
