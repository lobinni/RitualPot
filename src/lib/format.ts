/** Presentation helpers: every number, address and timestamp on screen goes through these. */

const ONE = BigInt(10) ** BigInt(18);

export function formatWei(wei: bigint | string, decimals = 4): string {
  const value = typeof wei === "string" ? safeBig(wei) : wei;
  const whole = value / ONE;
  const fraction = (value % ONE).toString().padStart(18, "0").replace(/0+$/, "");
  if (!fraction) return whole.toString();
  const shown = fraction.slice(0, decimals).replace(/0+$/, "");
  return shown ? `${whole}.${shown}` : whole.toString();
}

function safeBig(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

export function shortHex(value: string, size = 4): string {
  if (!value) return "";
  return value.length > size * 2 + 2
    ? `${value.slice(0, size + 2)}…${value.slice(-size)}`
    : value;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function utcText(seconds: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function clockText(seconds: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** "in 3d 04h" / "12m 04s" / "passed" - a countdown to a unix second. */
export function untilText(target: number, now = Date.now() / 1000): string {
  const delta = Math.round(target - now);
  if (delta <= 0) return "passed";
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  const seconds = delta % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function durationText(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

export function periodRange(
  joinClosesAt: number,
  period: number,
  periodLen: number,
): string {
  const start = joinClosesAt + period * periodLen;
  return `${clockText(start)} → ${clockText(start + periodLen)}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
