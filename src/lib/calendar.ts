const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TIMEZONE_RE = /(Z|[+-]\d{2}:\d{2})$/i;

export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Map Windows timezone names returned by M365 to IANA identifiers
const MS_TZ_MAP: Record<string, string> = {
  "Pacific Standard Time": "America/Los_Angeles",
  "Mountain Standard Time": "America/Denver",
  "Central Standard Time": "America/Chicago",
  "Eastern Standard Time": "America/New_York",
  "UTC": "UTC",
  "GMT Standard Time": "Europe/London",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Alaskan Standard Time": "America/Anchorage",
  "Atlantic Standard Time": "America/Halifax",
};

export function normalizeCalendarDateTime(
  value: unknown,
  timeZone?: string
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  if (DATE_ONLY_RE.test(trimmed)) {
    candidate = `${trimmed}T00:00:00Z`;
  } else if (!HAS_TIMEZONE_RE.test(trimmed)) {
    if (timeZone) {
      const ianaTz = MS_TZ_MAP[timeZone] || timeZone;
      try {
        // Parse date/time components directly via Date.UTC to avoid
        // local-timezone contamination from new Date(string)
        const parts = trimmed.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
        if (parts) {
          const utcAnchor = Date.UTC(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]);
          // Treat utcAnchor as "this instant expressed in ianaTz", find the real UTC
          const asUtcStr = new Date(utcAnchor).toLocaleString("en-US", { timeZone: "UTC" });
          const asTzStr = new Date(utcAnchor).toLocaleString("en-US", { timeZone: ianaTz });
          const offset = new Date(asUtcStr).getTime() - new Date(asTzStr).getTime();
          return new Date(utcAnchor + offset).toISOString();
        }
      } catch {
        // fallback below
      }
    }
    candidate = `${trimmed}Z`;
  }

  return parseCalendarDate(candidate)?.toISOString() ?? null;
}

export function toPacificDate(value: string | null | undefined): Date | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) {
    return null;
  }

  return parseCalendarDate(
    parsed.toLocaleString("en-US", { timeZone: PACIFIC_TIME_ZONE })
  );
}
