import { CATEGORIES, type Severity, type Status } from "./model";

export type ParsedQcIssue = {
  id: string;
  episodeId: string;
  sourceOrder: number;
  sourceTimestamp: string;
  start: number;
  sourceText: string;
  cleanedText: string;
  category: (typeof CATEGORIES)[number];
  severity: Severity;
  status: Status;
};

export type ParsedObservation = {
  id: string;
  episodeId: string;
  sourceOrder: number;
  sourceText: string;
  cleanedText: string;
};

export type ParsedQcEpisode = {
  id: string;
  name: string;
  sourceHeading?: string;
  issues: ParsedQcIssue[];
  observations: ParsedObservation[];
};

export type QcParseWarning = {
  id: string;
  line: number;
  text: string;
  message: string;
};

export type ParsedQcNotes = {
  episodes: ParsedQcEpisode[];
  warnings: QcParseWarning[];
  sourceText: string;
};

const heading = /^\s*(?:episode|ep\.?)\s*(?:[:#-]\s*|\s+)(.+?)\s*:?\s*$/i;
const timeAtStart = /^\s*(\d+(?::\d+){1,2}(?:\.\d+)?)\s*[-–—:]\s*(.*)$/;

export function parseElapsedTimestamp(
  value: string,
): { ok: true; seconds: number } | { ok: false; reason: string } {
  const input = value.trim();
  const parts = input.split(":");
  if (parts.length !== 2 && parts.length !== 3)
    return {
      ok: false,
      reason: "Use MM:SS or HH:MM:SS, optionally with milliseconds.",
    };

  const last = parts.at(-1) || "";
  if (!/^\d{2}(?:\.\d{1,3})?$/.test(last))
    return {
      ok: false,
      reason:
        "Seconds must use two digits and may include up to 3 decimal places.",
    };

  const seconds = Number(last);
  if (seconds >= 60)
    return { ok: false, reason: "Seconds must be less than 60." };

  if (parts.length === 2) {
    if (!/^\d+$/.test(parts[0]))
      return { ok: false, reason: "Minutes must be a whole number." };
    const total = Number(parts[0]) * 60 + seconds;
    return Number.isFinite(total)
      ? { ok: true, seconds: total }
      : { ok: false, reason: "Timestamp is outside the supported range." };
  }

  if (!/^\d+$/.test(parts[0]) || !/^\d{2}$/.test(parts[1]))
    return {
      ok: false,
      reason: "Use HH:MM:SS with two-digit minutes and seconds.",
    };
  const minutes = Number(parts[1]);
  if (minutes >= 60)
    return { ok: false, reason: "Minutes in HH:MM:SS must be less than 60." };
  const total = Number(parts[0]) * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total)
    ? { ok: true, seconds: total }
    : { ok: false, reason: "Timestamp is outside the supported range." };
}

export function suggestQcCategory(text: string): (typeof CATEGORIES)[number] {
  const value = text.toLowerCase();
  if (/lip.?sync|mouth|speaking|dialogue/.test(value)) return "Lip-sync";
  if (/wardrobe|armou?r|costume|clothes|lab coat/.test(value))
    return "Wardrobe";
  if (/hand|finger|arm|leg|body|standing|laying|lying|position/.test(value))
    return "Hand or body positioning";
  if (/motion|movement|animation|weird motion/.test(value))
    return "Motion or animation";
  if (/repeat|repeated shot|duplicate shot/.test(value))
    return "Repeated shots";
  if (/crowd|background|continuity|disappear|missing/.test(value))
    return "Continuity";
  if (/camera|framing|composition|shot/.test(value))
    return "Composition or framing";
  return "Other";
}

function cleanDisplayText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Parses notes without dropping raw lines or inferring severity, fixes, or resolution. */
export function parseQcNotes(sourceText: string): ParsedQcNotes {
  const result: ParsedQcNotes = { episodes: [], warnings: [], sourceText };
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  let order = 0;
  let groupIndex = -1;
  let block:
    | {
        kind: "issue" | "observation";
        line: number;
        timestamp?: string;
        seconds?: number;
        content: string[];
      }
    | undefined;

  const ensureEpisode = (name = "Unassigned notes", sourceHeading?: string) => {
    if (groupIndex >= 0) return result.episodes[groupIndex];
    groupIndex = result.episodes.length;
    result.episodes.push({
      id: `episode-${groupIndex}`,
      name,
      sourceHeading,
      issues: [],
      observations: [],
    });
    if (!sourceHeading) {
      result.warnings.push({
        id: `warning-heading-${groupIndex}`,
        line: 1,
        text: "",
        message:
          "No episode heading found. These notes will be imported into an editable 'Unassigned notes' episode.",
      });
    }
    return result.episodes[groupIndex];
  };

  const flush = () => {
    if (!block) return;
    const raw = block.content.join("\n").replace(/^\n+|\n+$/g, "");
    if (
      !raw.trim() &&
      block.kind === "issue" &&
      block.timestamp !== undefined
    ) {
      const sourceLine = lines[block.line - 1];
      const episode = ensureEpisode();
      episode.observations.push({
        id: `observation-${episode.id}-${episode.observations.length}`,
        episodeId: episode.id,
        sourceOrder: order++,
        sourceText: sourceLine,
        cleanedText: sourceLine.trim(),
      });
      result.warnings.push({
        id: `warning-empty-${block.line}`,
        line: block.line,
        text: sourceLine,
        message: `Timestamp '${block.timestamp}' has no note text. The original line is preserved as an episode observation.`,
      });
    }
    if (raw.trim()) {
      const episode = ensureEpisode();
      const clean = cleanDisplayText(raw);
      if (
        block.kind === "issue" &&
        block.timestamp !== undefined &&
        block.seconds !== undefined
      ) {
        episode.issues.push({
          id: `issue-${episode.id}-${episode.issues.length}`,
          episodeId: episode.id,
          sourceOrder: order++,
          sourceTimestamp: block.timestamp,
          start: block.seconds,
          sourceText: raw,
          cleanedText: clean,
          category: suggestQcCategory(clean),
          severity: "Unassigned",
          status: "Open",
        });
      } else {
        episode.observations.push({
          id: `observation-${episode.id}-${episode.observations.length}`,
          episodeId: episode.id,
          sourceOrder: order++,
          sourceText: raw,
          cleanedText: clean,
        });
      }
    }
    block = undefined;
  };

  lines.forEach((line, index) => {
    const episodeHeading = line.match(heading);
    if (episodeHeading) {
      flush();
      groupIndex = result.episodes.length;
      const headingText = line.trim();
      const suffix = episodeHeading[1].trim();
      result.episodes.push({
        id: `episode-${groupIndex}`,
        name: /^\d+$/.test(suffix) ? `Episode ${suffix}` : suffix,
        sourceHeading: headingText,
        issues: [],
        observations: [],
      });
      return;
    }

    const timestampMatch = line.match(timeAtStart);
    if (timestampMatch) {
      flush();
      const originalTimestamp = timestampMatch[1];
      const parsed = parseElapsedTimestamp(originalTimestamp);
      if (!parsed.ok) {
        result.warnings.push({
          id: `warning-time-${index + 1}`,
          line: index + 1,
          text: line,
          message: `Invalid timestamp '${originalTimestamp}': ${parsed.reason} The original line is preserved as an episode observation.`,
        });
        block = { kind: "observation", line: index + 1, content: [line] };
      } else {
        block = {
          kind: "issue",
          line: index + 1,
          timestamp: originalTimestamp,
          seconds: parsed.seconds,
          content: timestampMatch[2] ? [timestampMatch[2]] : [],
        };
      }
      ensureEpisode();
      return;
    }

    if (!line.trim()) {
      if (block) flush();
      return;
    }

    // A time-like prefix that failed the strict shape is retained and reported.
    const malformedTime = line.match(
      /^\s*(\d+(?::\d+){1,2}(?:\.\d+)?)(?:\s+|[-–—:])(.+)$/,
    );
    if (malformedTime && !timestampMatch) {
      flush();
      block = { kind: "observation", line: index + 1, content: [line] };
      result.warnings.push({
        id: `warning-time-${index + 1}`,
        line: index + 1,
        text: line,
        message: `Timestamp-like text '${malformedTime[1]}' could not be parsed. The original line is preserved as an episode observation.`,
      });
      ensureEpisode();
      return;
    }

    ensureEpisode();
    if (block) block.content.push(line);
    else block = { kind: "observation", line: index + 1, content: [line] };
  });

  flush();
  return result;
}
