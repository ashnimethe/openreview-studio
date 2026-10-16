import { describe, expect, it } from "vitest";
import { parseElapsedTimestamp, parseQcNotes } from "./qcNotes";
import syntheticNotes from "../../tests/fixtures/synthetic-qc-notes.txt?raw";

describe("QC note timestamp parsing", () => {
  it.each([
    ["0:12", 12],
    ["1:08", 68],
    ["10:25", 625],
    ["00:01:08", 68],
    ["00:01:08.500", 68.5],
    ["02:12:03.05", 7923.05],
  ])("parses %s as elapsed seconds", (input, expected) => {
    expect(parseElapsedTimestamp(input)).toEqual({
      ok: true,
      seconds: expected,
    });
  });

  it.each(["0:77", "1:8", "00:61:08", "1:02:03.1234", "not time"])(
    "rejects ambiguous or invalid timestamp %s",
    (input) => expect(parseElapsedTimestamp(input).ok).toBe(false),
  );
});

describe("QC notes parser", () => {
  it("parses synthetic episode notes without losing source wording", () => {
    const parsed = parseQcNotes(syntheticNotes);
    expect(parsed.episodes.map((episode) => episode.name)).toEqual([
      "Episode 1",
      "Episode 2",
    ]);
    expect(parsed.episodes[0].observations[0].cleanedText).toContain(
      "blue jacket throughout this episode",
    );
    expect(parsed.episodes[0].issues.map((issue) => issue.start)).toEqual([
      12, 26, 37, 45, 68,
    ]);
    expect(parsed.episodes[0].issues[4].sourceTimestamp).toBe("1:08");
    expect(parsed.episodes[1].issues[0].sourceText).toBe(
      "Abrupt motion during the transition",
    );
    expect(parsed.sourceText).toBe(syntheticNotes);
  });

  it("preserves multiline descriptions, repeated notes, order, and unknown observations", () => {
    const parsed = parseQcNotes(
      "Episode 4\n0:12 — First line\ncontinued detail\n0:13 – First line\n\nUnclassified note",
    );
    const episode = parsed.episodes[0];
    expect(episode.issues).toHaveLength(2);
    expect(episode.issues[0].sourceText).toBe("First line\ncontinued detail");
    expect(episode.issues[0].sourceOrder).toBeLessThan(
      episode.issues[1].sourceOrder,
    );
    expect(episode.issues[0].cleanedText).toBe("First line continued detail");
    expect(episode.observations[0].sourceText).toBe("Unclassified note");
  });

  it("retains invalid timestamp lines as observations and warns", () => {
    const parsed = parseQcNotes("Episode 11\n0:77 - keep this exact line");
    expect(parsed.episodes[0].observations[0].sourceText).toBe(
      "0:77 - keep this exact line",
    );
    expect(parsed.warnings[0].message).toContain(
      "Seconds must be less than 60",
    );
    expect(parsed.warnings[0].text).toBe("0:77 - keep this exact line");
  });

  it("warns when notes have no episode heading instead of dropping them", () => {
    const parsed = parseQcNotes("Loose note\n0:12 - keep this issue");
    expect(parsed.episodes[0].name).toBe("Unassigned notes");
    expect(parsed.episodes[0].observations[0].sourceText).toBe("Loose note");
    expect(parsed.episodes[0].issues[0].start).toBe(12);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("preserves a timestamp with no note text and explains the ambiguity", () => {
    const parsed = parseQcNotes("Episode 12\n0:12 - ");
    expect(parsed.episodes[0].observations[0].sourceText).toBe("0:12 - ");
    expect(parsed.warnings[0].message).toContain("has no note text");
  });
  it("recognizes punctuation and short forms in episode headings", () => {
    const parsed = parseQcNotes(
      "Episode: 123\n0:12 - Note\n\nEp. #124\n0:13 - Note",
    );
    expect(parsed.episodes.map((episode) => episode.name)).toEqual([
      "Episode 123",
      "Episode 124",
    ]);
  });
});
