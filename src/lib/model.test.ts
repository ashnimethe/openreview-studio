import { describe, it, expect } from "vitest";
import { frameIndex, formatBytes, timecode } from "./model";
import { exportPackage, importPackage, reportText } from "./packages";
import type { Project } from "./model";
const project: Project = {
  id: "p1",
  name: "Pilot",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  episodes: [
    {
      id: "e1",
      name: "Episode 1",
      versions: [
        {
          id: "v1",
          label: "V1",
          filename: "pilot.mp4",
          size: 100,
          addedAt: "2026-01-01",
        },
      ],
      activeVersionId: "v1",
      issues: [
        {
          id: "i1",
          title: "Continuity error",
          description: "Cup disappears",
          fix: "Keep cup visible",
          category: "Continuity",
          severity: "Major",
          status: "Open",
          scope: "Single frame",
          start: 67,
          versionId: "v1",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          screenshot: "data:image/jpeg;base64,YWJj",
          annotations: [],
        },
      ],
    },
  ],
};
describe("review domain utilities", () => {
  it("formats time as a stable hh:mm:ss timecode", () =>
    expect(timecode(3672.8)).toBe("01:01:12"));
  it("calculates nominal frame indexes", () =>
    expect(frameIndex(10.25, 24)).toBe(246));
  it("rejects invalid frame rates", () =>
    expect(() => frameIndex(2, 0)).toThrow());
  it("formats local media sizes", () =>
    expect(formatBytes(1024 * 1024 * 2)).toBe("2.0 MB"));
});
describe("portable review package", () => {
  it("round trips project data and screenshot assets without the source video", async () => {
    const blob = await exportPackage(project);
    const file = new File([blob], "review.zip");
    const restored = await importPackage(file);
    expect(restored.episodes[0].issues[0].screenshot).toBe(
      project.episodes[0].issues[0].screenshot,
    );
    expect(restored.name).toBe("Pilot");
  });
  it("includes the selected source video only when explicitly requested", async () => {
    const source = new File([new Uint8Array([0, 1, 2, 3])], "pilot.mp4");
    const blob = await exportPackage(project, source);
    const zip = await JSZip.loadAsync(blob);
    expect(await zip.file("sources/pilot.mp4")?.async("uint8array")).toEqual(
      new Uint8Array([0, 1, 2, 3]),
    );
  });
  it("round trips unlinked imported notes and includes original text in reports", async () => {
    const p = structuredClone(project);
    p.episodes[0].issues[0].versionId = undefined;
    p.episodes[0].issues[0].severity = "Unassigned";
    p.episodes[0].issues[0].sourceTimestamp = "00:01:08.500";
    p.episodes[0].issues[0].sourceText = "Missing lip-sync\nsecond line";
    p.episodes[0].issues[0].annotatedScreenshot = "data:image/jpeg;base64,ZGVm";
    p.episodes[0].issues[0].cleanedText = "Missing lipsync, second line";
    p.episodes[0].observations = [
      {
        id: "obs1",
        sourceText: "Original episode note",
        cleanedText: "Episode-wide note",
        importBatchId: "batch1",
      },
    ];
    p.noteImports = [
      {
        id: "batch1",
        sourceText: "Full pasted notes",
        importedAt: "2026-10-16T00:00:00.000Z",
      },
    ];
    const file = new File([await exportPackage(p)], "review.zip");
    const imported = await importPackage(file);
    expect(imported.episodes[0].issues[0].versionId).toBeUndefined();
    expect(imported.episodes[0].issues[0].sourceTimestamp).toBe("00:01:08.500");
    expect(imported.episodes[0].issues[0].screenshot).toBe(
      project.episodes[0].issues[0].screenshot,
    );
    expect(imported.episodes[0].issues[0].annotatedScreenshot).toBe(
      "data:image/jpeg;base64,ZGVm",
    );
    expect(imported.noteImports?.[0].sourceText).toBe("Full pasted notes");
    for (const format of ["md", "txt", "html"] as const) {
      const report = reportText(imported, format);
      expect(report).toContain("Episode-wide note");
      expect(report).toContain("Original episode note");
      expect(report).toContain("00:01:08.500");
      expect(report).toContain("Missing lip-sync");
    }
    const json = JSON.parse(reportText(imported, "json"));
    expect(json.project.noteImports[0].sourceText).toBe("Full pasted notes");
  });
  it("escapes user supplied content in standalone reports", () => {
    const p = structuredClone(project);
    p.name = "<script>alert(1)</script>";
    const html = reportText(p, "html");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("data:image/jpeg;base64,YWJj");
    p.episodes[0].issues[0].annotations = [
      {
        id: "a1",
        type: "rect",
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.4,
        color: "#ff584f",
      },
      {
        id: "a2",
        type: "text",
        x: 0.2,
        y: 0.3,
        w: 0.3,
        h: 0.06,
        color: "#ff584f",
        label: "<script>alert(1)</script>",
      },
    ];
    const annotated = reportText(p, "html");
    expect(annotated).toContain(
      '<rect x="0.1" y="0.2" width="0.3" height="0.4" stroke="#ff584f"/>',
    );
    expect(annotated).toContain(
      '<text x="0.2" y="0.33999999999999997" fill="#ff584f" stroke="none" font-size=".035" font-weight="700">&lt;script&gt;alert(1)&lt;/script&gt;</text>',
    );
    expect(annotated).not.toContain("<script>alert(1)</script>");
  });
});
import JSZip from "jszip";
async function asFile(zip: JSZip) {
  return new File(
    [await zip.generateAsync({ type: "arraybuffer" })],
    "input.zip",
  );
}
describe("package validation failures", () => {
  it("rejects unsupported future schemas", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "OpenReview Studio Package",
        formatVersion: 99,
        project: {},
      }),
    );
    await expect(importPackage(await asFile(zip))).rejects.toThrow(
      "Unsupported review package format",
    );
  });
  it("rejects unexpected archive paths", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "OpenReview Studio Package",
        formatVersion: 1,
        project: { id: "p", name: "P", episodes: [] },
      }),
    );
    zip.file("../payload.txt", "unsafe");
    await expect(importPackage(await asFile(zip))).rejects.toThrow(
      "Unsafe path",
    );
  });
  it("rejects issues that refer to missing versions", async () => {
    const zip = new JSZip();
    const p = structuredClone(project);
    p.episodes[0].issues[0].versionId = "missing";
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "OpenReview Studio Package",
        formatVersion: 1,
        project: p,
      }),
    );
    await expect(importPackage(await asFile(zip))).rejects.toThrow(
      "unknown video version",
    );
  });
  it("rejects malformed JSON and invalid episode observation records", async () => {
    const malformed = new JSZip();
    malformed.file("manifest.json", "{");
    await expect(importPackage(await asFile(malformed))).rejects.toThrow(
      "Invalid package manifest JSON",
    );
    const zip = new JSZip();
    const p = structuredClone(project);
    p.episodes[0].observations = [null as never];
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "OpenReview Studio Package",
        formatVersion: 1,
        project: p,
      }),
    );
    await expect(importPackage(await asFile(zip))).rejects.toThrow(
      "Invalid episode observation data",
    );
  });
  it("rejects a package that references a missing original or annotated screenshot", async () => {
    for (const key of ["screenshotPath", "annotatedScreenshotPath"] as const) {
      const zip = new JSZip();
      const p = structuredClone(project);
      const issue = p.episodes[0]
        .issues[0] as Project["episodes"][number]["issues"][number] & {
        screenshotPath?: string;
        annotatedScreenshotPath?: string;
      };
      delete issue.screenshot;
      delete issue.annotatedScreenshot;
      issue[key] = "assets/missing.jpg";
      zip.file(
        "manifest.json",
        JSON.stringify({
          format: "OpenReview Studio Package",
          formatVersion: 1,
          project: p,
        }),
      );
      await expect(importPackage(await asFile(zip))).rejects.toThrow(
        "Referenced screenshot is missing",
      );
    }
  });
});

describe("report output safety", () => {
  it("does not interpolate malformed image data into HTML attributes", () => {
    const p = structuredClone(project);
    p.episodes[0].issues[0].screenshot =
      'data:image/jpeg;base64,AAAA" onerror="alert(1)';
    const html = reportText(p, "html");
    expect(html).not.toContain("onerror=");
  });
  it("renders image overlays for normalized annotations", () => {
    const p = structuredClone(project);
    p.episodes[0].issues[0].annotations = [
      {
        id: "a1",
        type: "rect",
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.4,
        color: "#ff584f",
      },
    ];
    expect(reportText(p, "html")).toContain(
      '<rect x="0.1" y="0.2" width="0.3" height="0.4" stroke="#ff584f"/>',
    );
  });
});
