import JSZip from "jszip";
import type { Project } from "./model";
import { APP_NAME } from "./brand";
export const PACKAGE_VERSION = 1;
export async function exportPackage(project: Project, video?: File) {
  const zip = new JSZip();
  const portable = structuredClone(project);
  for (const episode of portable.episodes)
    for (const issue of episode.issues) {
      if (issue.screenshot?.startsWith("data:")) {
        const ext = issue.screenshot.startsWith("data:image/png")
          ? "png"
          : "jpg";
        const path = `assets/${safeName(issue.id)}.${ext}`;
        zip.file(path, issue.screenshot.split(",")[1], { base64: true });
        (issue as IssueWithAsset).screenshotPath = path;
        delete issue.screenshot;
      }
      if (issue.annotatedScreenshot?.startsWith("data:")) {
        const ext = issue.annotatedScreenshot.startsWith("data:image/png")
          ? "png"
          : "jpg";
        const path = `assets/${safeName(issue.id)}-annotated.${ext}`;
        zip.file(path, issue.annotatedScreenshot.split(",")[1], {
          base64: true,
        });
        (issue as IssueWithAsset).annotatedScreenshotPath = path;
        delete issue.annotatedScreenshot;
      }
    }
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        format: "OpenReview Studio Package",
        formatVersion: PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        project: portable,
      },
      null,
      2,
    ),
  );
  if (video) zip.file(`sources/${safeName(video.name)}`, video);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
type IssueWithAsset = {
  screenshotPath?: string;
  annotatedScreenshotPath?: string;
};
const safeName = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
export async function importPackage(file: File): Promise<Project> {
  if (file.size > 600 * 1024 * 1024)
    throw new Error("Package exceeds the 600 MB import limit.");
  const zip = await JSZip.loadAsync(file, { checkCRC32: true });
  const entries = Object.values(zip.files);
  if (entries.length > 2000)
    throw new Error("Package contains too many entries.");
  let total = 0;
  for (const e of entries) {
    if (e.name.startsWith("/") || e.name.split("/").includes(".."))
      throw new Error("Unsafe path in package.");
    if (e.dir && !["assets/", "sources/"].includes(e.name))
      throw new Error("Unexpected directory in package.");
    if (
      !e.dir &&
      e.name !== "manifest.json" &&
      !/^assets\/[a-zA-Z0-9._-]+\.(jpg|png)$/.test(e.name) &&
      !/^sources\/[a-zA-Z0-9._-]+\.(mp4|mov|webm|mkv)$/.test(e.name)
    )
      throw new Error("Unexpected file in review package.");
    if (!e.dir) {
      const expandedSize =
        (e as unknown as { _data?: { uncompressedSize?: number } })._data
          ?.uncompressedSize || 0;
      if (e.name === "manifest.json" && expandedSize > 32 * 1024 * 1024)
        throw new Error("Package manifest exceeds the 32 MB limit.");
      total += expandedSize;
      if (total > 800 * 1024 * 1024)
        throw new Error("Package expands beyond the 800 MB limit.");
    }
  }
  const mf = zip.file("manifest.json");
  if (!mf) throw new Error("Missing manifest.json.");
  let raw: any;
  try {
    raw = JSON.parse(await mf.async("text"));
  } catch {
    throw new Error("Invalid package manifest JSON.");
  }
  if (
    raw.format !== "OpenReview Studio Package" ||
    !Number.isInteger(raw.formatVersion) ||
    raw.formatVersion !== PACKAGE_VERSION
  )
    throw new Error("Unsupported review package format.");
  const p = raw.project;
  if (
    !p ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.episodes) ||
    (p.noteImports !== undefined && !Array.isArray(p.noteImports))
  )
    throw new Error("Invalid project manifest.");
  if (
    p.noteImports?.some(
      (batch: any) =>
        !batch ||
        typeof batch.id !== "string" ||
        typeof batch.sourceText !== "string" ||
        typeof batch.importedAt !== "string",
    )
  )
    throw new Error("Invalid note import batch data.");
  for (const ep of p.episodes) {
    if (
      !ep ||
      typeof ep.id !== "string" ||
      typeof ep.name !== "string" ||
      !Array.isArray(ep.versions) ||
      !Array.isArray(ep.issues) ||
      (ep.observations !== undefined && !Array.isArray(ep.observations))
    )
      throw new Error("Invalid episode data.");
    if (
      ep.observations?.some(
        (note: any) =>
          !note ||
          typeof note.id !== "string" ||
          typeof note.sourceText !== "string" ||
          typeof note.cleanedText !== "string" ||
          (note.importBatchId !== undefined &&
            typeof note.importBatchId !== "string"),
      )
    )
      throw new Error("Invalid episode observation data.");
    if (
      ep.versions.some(
        (version: any) =>
          !version ||
          typeof version.id !== "string" ||
          typeof version.label !== "string" ||
          typeof version.filename !== "string" ||
          !Number.isFinite(version.size) ||
          version.size < 0 ||
          (version.duration !== undefined &&
            (!Number.isFinite(version.duration) || version.duration < 0)),
      )
    )
      throw new Error("Invalid video version data.");
    const ids = new Set(ep.versions.map((v: any) => v.id));
    if (ep.activeVersionId !== undefined && !ids.has(ep.activeVersionId))
      throw new Error("Episode references an unknown active video version.");
    if (
      ep.issues.some(
        (i: any) =>
          !i ||
          typeof i.id !== "string" ||
          (i.versionId !== undefined &&
            (typeof i.versionId !== "string" || !ids.has(i.versionId))) ||
          typeof i.title !== "string" ||
          typeof i.description !== "string" ||
          typeof i.fix !== "string" ||
          typeof i.category !== "string" ||
          typeof i.scope !== "string" ||
          !Number.isFinite(i.start) ||
          i.start < 0 ||
          !["Critical", "Major", "Minor", "Cosmetic", "Unassigned"].includes(
            i.severity,
          ) ||
          !["Open", "In progress", "Resolved", "Needs verification"].includes(
            i.status,
          ) ||
          (i.end !== undefined &&
            (!Number.isFinite(i.end) || i.end < i.start)) ||
          (i.sourceTimestamp !== undefined &&
            typeof i.sourceTimestamp !== "string") ||
          (i.sourceText !== undefined && typeof i.sourceText !== "string") ||
          (i.cleanedText !== undefined && typeof i.cleanedText !== "string") ||
          (i.annotatedScreenshot !== undefined &&
            typeof i.annotatedScreenshot !== "string") ||
          (i.importBatchId !== undefined &&
            typeof i.importBatchId !== "string") ||
          (i.annotations !== undefined &&
            (!Array.isArray(i.annotations) ||
              i.annotations.some(
                (a: any) =>
                  !a ||
                  typeof a.id !== "string" ||
                  !["arrow", "rect", "ellipse", "text"].includes(a.type) ||
                  ![a.x, a.y, a.w, a.h].every(Number.isFinite) ||
                  typeof a.color !== "string" ||
                  (a.label !== undefined && typeof a.label !== "string"),
              ))),
      )
    )
      throw new Error(
        "Invalid issue data or reference to an unknown video version.",
      );
    for (const issue of ep.issues) {
      for (const [pathKey, imageKey] of [
        ["screenshotPath", "screenshot"],
        ["annotatedScreenshotPath", "annotatedScreenshot"],
      ] as const) {
        const assetPath = issue[pathKey];
        if (assetPath !== undefined) {
          if (
            typeof assetPath !== "string" ||
            !/^assets\/[a-zA-Z0-9._-]+\.(jpg|png)$/.test(assetPath)
          )
            throw new Error("Invalid screenshot asset path.");
          const asset = zip.file(assetPath);
          if (!asset) throw new Error("Referenced screenshot is missing.");
          const base64 = await asset.async("base64");
          issue[imageKey] =
            `data:image/${assetPath.endsWith(".png") ? "png" : "jpeg"};base64,${base64}`;
          delete issue[pathKey];
        }
      }
      if (issue.screenshot && !safeImageData(issue.screenshot))
        throw new Error("Issue screenshot data is invalid.");
      if (
        issue.annotatedScreenshot &&
        !safeImageData(issue.annotatedScreenshot)
      )
        throw new Error("Annotated screenshot data is invalid.");
    }
  }
  return p as Project;
}
export function reportText(
  project: Project,
  format: "md" | "txt" | "json" | "html",
) {
  if (format === "json")
    return JSON.stringify(
      { schemaVersion: 1, project, exportedAt: new Date().toISOString() },
      null,
      2,
    );
  if (format === "md" || format === "txt") {
    const lines = [
      `# ${project.name}`,
      `Exported ${new Date().toLocaleString()}`,
      ...project.episodes.flatMap((e) => [
        `\n## ${e.name}`,
        ...e.versions.map((v) => `Version: ${v.label} — ${v.filename}`),
        ...(e.observations || []).map(
          (note) =>
            `\n### Episode-wide observation\n${note.cleanedText}\nSource note: ${note.sourceText}`,
        ),
        ...e.issues.map((i) => {
          const version =
            e.versions.find((v) => v.id === i.versionId)?.label ||
            "Source missing";
          const range = i.end && i.end > i.start ? `–${time(i.end)}` : "";
          return `\n### ${i.sourceTimestamp || time(i.start)}${range} · ${i.title}\nMedia time: ${time(i.start)} · Version: ${version} · ${i.severity} / ${i.status} / ${i.category} · Scope: ${i.scope}${i.reviewer ? ` · Reviewer: ${i.reviewer}` : ""}\n${i.description || ""}${i.fix ? `\nFix: ${i.fix}` : ""}${i.sourceText ? `\nSource note: ${i.sourceText}` : ""}`;
        }),
      ]),
    ];
    return format === "md"
      ? lines.join("\n")
      : lines.join("\n").replace(/^#+ /gm, "");
  }
  const sections = project.episodes
    .map((episode) => {
      const observations = (episode.observations || [])
        .map(
          (note) =>
            `<article class="observation"><small>Episode-wide observation</small><p>${esc(note.cleanedText)}</p><p><small>Source note: ${esc(note.sourceText)}</small></p></article>`,
        )
        .join("");
      const cards = episode.issues
        .map((i) => {
          const version =
            episode.versions.find((v) => v.id === i.versionId)?.label ||
            "Source missing";
          const original = safeImageData(i.screenshot);
          const annotated = safeImageData(i.annotatedScreenshot);
          const frames = original
            ? `<div class="frame-pair"><figure class="frame"><figcaption>Original frame</figcaption><img alt="Original captured review frame" src="${original}">${annotated ? "" : annotationSvg(i.annotations)}</figure>${annotated ? `<figure class="frame"><figcaption>Annotated frame</figcaption><img alt="Annotated review frame" src="${annotated}"></figure>` : ""}</div>`
            : "";
          return `<article><small>${esc(i.sourceTimestamp || time(i.start))} · Media ${time(i.start)}${i.end && i.end > i.start ? `–${time(i.end)}` : ""} · ${esc(version)} · ${esc(i.category)} · ${esc(i.severity)} · ${esc(i.status)} · ${esc(i.scope)}${i.reviewer ? ` · Reviewer: ${esc(i.reviewer)}` : ""}</small><h3>${esc(i.title)}</h3><p>${esc(i.description)}</p>${i.sourceText ? `<p><small>Source note: ${esc(i.sourceText)}</small></p>` : ""}${i.fix ? `<p>${esc(i.fix)}</p>` : ""}${frames}</article>`;
        })
        .join("");
      return `<section><h2>${esc(episode.name)}</h2>${observations}${cards || ""}</section>`;
    })
    .join("");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(project.name)} · ${esc(APP_NAME)}</title><style>body{background:#08080a;color:#f4f4f5;font:16px system-ui;max-width:900px;margin:48px auto;padding:0 24px}article{border-top:1px solid #303036;padding:18px 0}section+section{margin-top:36px}h2{border-bottom:1px solid #303036;padding-bottom:10px}.observation{border-left:2px solid #777;padding-left:14px}.frame-pair{display:flex;flex-wrap:wrap;gap:18px}.frame{position:relative;display:inline-block;max-width:100%;margin:14px 0}.frame img{display:block;max-width:100%;max-height:520px;border:1px solid #38383d}.frame figcaption{margin-bottom:6px;color:#a1a1aa;font-size:13px}.annotations{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}small{color:#a1a1aa}h1{font-size:32px}p{line-height:1.6;color:#ccc}</style><h1>${esc(project.name)}</h1><p>Portable QC report · Source video is not included.</p>${sections}`;
}
const safeImageData = (value?: string) =>
  value && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : undefined;
const annotationSvg = (
  items: Project["episodes"][number]["issues"][number]["annotations"],
) => {
  if (!items?.length) return "";
  const n = (x: number) =>
    Number.isFinite(x) ? Math.max(-1, Math.min(2, x)) : 0;
  const shapes = items
    .map((a) => {
      const color = /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : "#ff584f";
      const x = n(a.x),
        y = n(a.y),
        w = n(a.w),
        h = n(a.h);
      if (a.type === "text")
        return `<text x="${x}" y="${y + 0.04}" fill="${color}" stroke="none" font-size=".035" font-weight="700">${esc(a.label || "Note")}</text>`;
      if (a.type === "ellipse")
        return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${Math.abs(w / 2)}" ry="${Math.abs(h / 2)}" stroke="${color}"/>`;
      if (a.type === "arrow")
        return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${color}" marker-end="url(#arrow)"/>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${color}"/>`;
    })
    .join("");
  return `<svg class="annotations" viewBox="0 0 1 1" preserveAspectRatio="none"><defs><marker id="arrow" markerWidth=".03" markerHeight=".03" refX=".025" refY=".015" orient="auto"><path d="M0 0 L.03 .015 L0 .03 Z" fill="#ff584f"/></marker></defs><g fill="none" stroke-width=".006">${shapes}</g></svg>`;
};
const esc = (s: string) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const time = (s: number) =>
  new Date(Math.max(0, s) * 1000).toISOString().slice(11, 19);
