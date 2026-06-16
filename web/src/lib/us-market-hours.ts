const NY_TZ = "America/New_York";

/** US equity regular session: Mon–Fri 9:30–16:00 Eastern. */
const SESSION_OPEN_MIN = 9 * 60 + 30;
const SESSION_CLOSE_MIN = 16 * 60;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nyWeekday(now: Date): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
  }).format(now);
  return WEEKDAY[label] ?? 0;
}

function nyMinutesSinceMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isUsRegularSessionOpen(now = new Date()): boolean {
  if (process.env.PERP_IGNORE_MARKET_HOURS === "1") return true;

  const dow = nyWeekday(now);
  if (dow === 0 || dow === 6) return false;

  const mins = nyMinutesSinceMidnight(now);
  return mins >= SESSION_OPEN_MIN && mins < SESSION_CLOSE_MIN;
}

export function getUsMarketSessionLabel(now = new Date()): string {
  if (process.env.PERP_IGNORE_MARKET_HOURS === "1") return "always open (test)";
  return isUsRegularSessionOpen(now) ? "US regular session" : "market closed";
}
