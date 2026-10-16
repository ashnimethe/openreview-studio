import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const notesPath = resolve(here, "../fixtures/synthetic-qc-notes.txt");
const videoPath = resolve(here, "../fixtures/synthetic-15s.mp4");
const changedVideoPath = resolve(here, "../fixtures/synthetic-16s.mp4");
const sourceNotes = await readFile(notesPath, "utf8");

test("imports notes, links a local video, seeks safely, persists, and round trips reports", async ({
  page,
  browser,
}, testInfo) => {
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.startsWith("http") &&
      new URL(url).origin !== "http://127.0.0.1:4173"
    )
      externalRequests.push(url);
  });
  console.log(`End-to-end browser: ${browser.version()}`);

  await page.goto("/");
  await page.getByRole("button", { name: /QC Notes Studio/ }).click();
  const studio = page.getByRole("dialog", { name: "QC Notes Studio" });
  await studio.getByLabel("Destination project").selectOption("__create");
  await studio.getByLabel("New project name").fill("QC Notes Integration E2E");
  await studio.getByRole("button", { name: "Create" }).click();
  await studio.getByLabel("Paste QC notes").fill(sourceNotes);
  await studio.getByRole("button", { name: "Parse notes" }).click();
  await expect(studio.getByText("2 episodes")).toBeVisible();
  await expect(studio.getByText("1 episode observations")).toBeVisible();
  await expect(studio.getByRole("tab", { name: "Episode 2" })).toBeVisible();
  await studio.getByRole("button", { name: "Preview report" }).click();
  await expect(studio.getByText("Episode-wide observation")).toBeVisible();
  await studio.getByRole("button", { name: "Import 8 notes" }).click();

  await expect(
    page.getByRole("button", { name: "QC Notes Integration E2E" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Episode 1/ }).click();
  await page
    .locator('input[type="file"][accept^="video/mp4"]')
    .setInputFiles(videoPath);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.duration),
    )
    .toBeGreaterThan(14.9);
  await page.getByRole("button", { name: "Play or pause" }).click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((video: HTMLVideoElement) => video.paused),
    )
    .toBe(false);
  await page.getByRole("button", { name: "Play or pause" }).click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((video: HTMLVideoElement) => video.paused),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: /Log issue/ }).click();
  const newIssueDialog = page.getByRole("dialog", { name: "Log an issue" });
  await expect(newIssueDialog.locator(".annotate-box img")).toBeVisible();
  await newIssueDialog.getByRole("button", { name: "Box" }).click();
  const annotationSurface = newIssueDialog.locator(".annotate-box svg");
  const surfaceBounds = await annotationSurface.boundingBox();
  expect(surfaceBounds).not.toBeNull();
  await page.mouse.move(surfaceBounds!.x + 30, surfaceBounds!.y + 24);
  await page.mouse.down();
  await page.mouse.move(surfaceBounds!.x + 120, surfaceBounds!.y + 90);
  await page.mouse.up();
  await expect(annotationSurface.locator("rect")).toHaveCount(1);
  await newIssueDialog
    .getByPlaceholder("Describe the problem in a few words")
    .fill("Captured frame annotation");
  await newIssueDialog.getByRole("button", { name: "Save issue" }).click();
  await expect(
    page
      .locator(".issue-row .issue-body")
      .filter({ hasText: "Captured frame annotation" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Relink source" }).click();
  await page
    .locator('input[type="file"][accept^="video/mp4"]')
    .setInputFiles(changedVideoPath);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.duration),
    )
    .toBeGreaterThan(15.9);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /duration differs.*timestamps may have shifted/i }),
  ).toBeVisible();
  const standingIssue = page
    .locator(".issue-row .issue-body")
    .filter({ hasText: "Character position changes unexpectedly" });
  await expect(standingIssue).toBeVisible();

  await page
    .getByRole("button", { name: /Issue at 0:12: Character position changes/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Issue details" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(11.9);
  await expect
    .poll(() =>
      page.locator("video").evaluate((video: HTMLVideoElement) => video.paused),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close" }).click();

  await page
    .locator(".issue-row .issue-body")
    .filter({ hasText: "Hand placement obscures the prop" })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText: /beyond the video’s duration|beyond the video's duration/,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(11.9);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Previous issue/ }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(11.9);
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Change status" }).first().click();
  await expect(page.locator(".save-state")).toContainText("Saving");
  await expect(page.locator(".status-label").first()).toHaveText("In progress");
  await expect(page.locator(".save-state")).toContainText("Saved", {
    timeout: 10_000,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your projects" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /QC Notes Integration E2E/ }).click();
  await page.getByRole("button", { name: /Episode 1/ }).click();
  const reloadedIssue = page
    .locator(".issue-row .issue-body")
    .filter({ hasText: "Character position changes unexpectedly" });
  await expect(reloadedIssue).toBeVisible();
  await expect(page.locator(".status-label").first()).toHaveText("In progress");
  await reloadedIssue.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /select this episode's local video/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export review" });
  await expect(exportDialog.getByLabel("Export scope")).toHaveValue("project");
  await expect(
    exportDialog.locator('input[type="checkbox"]'),
  ).not.toBeChecked();
  const zipDownloadPromise = page.waitForEvent("download");
  await exportDialog
    .getByRole("button", { name: /Review package ZIP/ })
    .click();
  const zipDownload = await zipDownloadPromise;
  const zipPath = await zipDownload.path();
  expect(zipPath).toBeTruthy();
  const zipped = await JSZip.loadAsync(await readFile(zipPath!));
  expect(zipped.file("sources/synthetic-15s.mp4")).toBeNull();
  const manifest = JSON.parse(
    await zipped.file("manifest.json")!.async("text"),
  );
  expect(manifest.project.noteImports[0].sourceText).toBe(sourceNotes);
  expect(manifest.project.episodes[0].observations[0].sourceText).toContain(
    "blue jacket throughout this episode",
  );
  const captured = manifest.project.episodes[0].issues.find(
    (item: { title: string }) => item.title === "Captured frame annotation",
  );
  expect(captured.screenshotPath).toMatch(/^assets\//);
  expect(captured.annotatedScreenshotPath).toMatch(/^assets\//);
  expect(captured.annotations).toHaveLength(1);

  const cleanContext = await browser.newContext({ acceptDownloads: true });
  const cleanPage = await cleanContext.newPage();
  const cleanErrors: string[] = [];
  const cleanExternalRequests: string[] = [];
  cleanPage.on("pageerror", (error) => cleanErrors.push(error.message));
  cleanPage.on("request", (request) => {
    const url = request.url();
    if (
      url.startsWith("http") &&
      new URL(url).origin !== "http://127.0.0.1:4173"
    )
      cleanExternalRequests.push(url);
  });
  await cleanPage.goto("http://127.0.0.1:4173/");
  await cleanPage.getByRole("button", { name: "Import review" }).click();
  await cleanPage
    .locator('input[type="file"][accept=".zip"]')
    .setInputFiles(zipPath!);
  await expect(
    cleanPage.getByRole("button", { name: "QC Notes Integration E2E" }),
  ).toBeVisible();
  await cleanPage.getByRole("button", { name: /Episode 1/ }).click();
  await cleanPage
    .locator('input[type="file"][accept^="video/mp4"]')
    .setInputFiles(changedVideoPath);
  await expect
    .poll(() =>
      cleanPage
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.duration),
    )
    .toBeGreaterThan(14.9);
  await cleanPage
    .locator(".issue-row .issue-body")
    .filter({ hasText: "Character position changes unexpectedly" })
    .click();
  await expect
    .poll(() =>
      cleanPage
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(11.9);
  await cleanPage.getByRole("button", { name: "Close" }).click();

  const markdownPromise = cleanPage.waitForEvent("download");
  await cleanPage.getByRole("button", { name: "Export", exact: true }).click();
  await cleanPage
    .getByRole("dialog", { name: "Export review" })
    .getByRole("button", { name: /Markdown/ })
    .click();
  const markdown = await markdownPromise;
  expect(await readFile((await markdown.path())!, "utf8")).toContain(
    "Source note:",
  );

  await cleanPage.getByRole("button", { name: "Export", exact: true }).click();
  const textPromise = cleanPage.waitForEvent("download");
  await cleanPage
    .getByRole("dialog", { name: "Export review" })
    .getByRole("button", { name: /Plain text/ })
    .click();
  const plain = await textPromise;
  expect(await readFile((await plain.path())!, "utf8")).toContain(
    "Episode-wide observation",
  );

  await cleanPage.getByRole("button", { name: "Export", exact: true }).click();
  const jsonPromise = cleanPage.waitForEvent("download");
  await cleanPage
    .getByRole("dialog", { name: "Export review" })
    .getByRole("button", { name: /JSON/ })
    .click();
  const json = await jsonPromise;
  expect(
    JSON.parse(await readFile((await json.path())!, "utf8")).project
      .noteImports[0].sourceText,
  ).toBe(sourceNotes);

  await cleanPage.getByRole("button", { name: "Export", exact: true }).click();
  const htmlPromise = cleanPage.waitForEvent("download");
  await cleanPage
    .getByRole("dialog", { name: "Export review" })
    .getByRole("button", { name: /Standalone HTML/ })
    .click();
  const html = await htmlPromise;
  const htmlPath = testInfo.outputPath("standalone-review.html");
  await html.saveAs(htmlPath);
  const reportPage = await cleanContext.newPage();
  await reportPage.goto(pathToFileURL(htmlPath).href);
  await expect(
    reportPage.getByRole("heading", { name: "QC Notes Integration E2E" }),
  ).toBeVisible();
  await expect(
    reportPage.getByText("Episode-wide observation").first(),
  ).toBeVisible();
  await expect(
    reportPage.getByText(/blue jacket throughout this episode/).first(),
  ).toBeVisible();
  const standaloneHtml = await readFile(htmlPath, "utf8");
  expect(standaloneHtml).toContain("data:image/jpeg;base64,");
  expect(
    standaloneHtml.match(/data:image\/jpeg;base64,/g)?.length,
  ).toBeGreaterThanOrEqual(2);
  expect(pageErrors).toEqual([]);
  expect(cleanErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(cleanExternalRequests).toEqual([]);
  await cleanContext.close();
});
