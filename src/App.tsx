import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Download,
  Film,
  FileText,
  FolderPlus,
  HelpCircle,
  Import,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import type {
  Episode,
  Issue,
  Project,
  Severity,
  Status,
  Version,
} from "./lib/model";
import { formatBytes, timecode, uid } from "./lib/model";
import { APP_NAME } from "./lib/brand";
import {
  ConfirmDialog,
  ExportDialog,
  Help,
  IssueEditor,
  NameDialog,
  SettingsDialog,
} from "./components/Dialogs";
import { QcNotesStudio } from "./components/QcNotesStudio";
import type { ParsedQcEpisode } from "./lib/qcNotes";
import { loadProjects, saveProjects } from "./lib/store";
import { exportPackage, importPackage, reportText } from "./lib/packages";
import { seekMediaTime } from "./lib/media";
import { renderAnnotatedFrame } from "./lib/annotations";
import { createPortal } from "react-dom";
import {
  DEFAULT_SHORTCUTS,
  normalizeShortcut,
  shortcutLabel,
} from "./lib/shortcuts";
import type { ShortcutMap } from "./lib/shortcuts";
import "./App.css";
function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
const sev: Severity[] = [
  "Unassigned",
  "Critical",
  "Major",
  "Minor",
  "Cosmetic",
];
const statuses: Status[] = [
  "Open",
  "In progress",
  "Resolved",
  "Needs verification",
];
const freshProject = (name: string): Project => ({
  id: uid(),
  name,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  episodes: [],
});
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const relinkDurationBaseline = useRef<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]),
    [ready, setReady] = useState(false),
    [activeId, setActiveId] = useState(""),
    [episodeId, setEpisodeId] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [relinkVersionId, setRelinkVersionId] = useState(""),
    [objectUrl, setObjectUrl] = useState(""),
    [saveState, setSaveState] = useState("Saved"),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All issues"),
    [versionFilter, setVersionFilter] = useState("All versions"),
    [sortBy, setSortBy] = useState("time"),
    [issue, setIssue] = useState<Issue | null>(null),
    [newIssue, setNewIssue] = useState(false),
    [selectedIssueId, setSelectedIssueId] = useState(""),
    [search, setSearch] = useState(""),
    [showHelp, setShowHelp] = useState(false),
    [showQcNotes, setShowQcNotes] = useState(false),
    [showExport, setShowExport] = useState(false),
    [videoErr, setVideoErr] = useState(""),
    [createType, setCreateType] = useState<"project" | "episode" | "">(""),
    [createName, setCreateName] = useState(""),
    [nameMode, setNameMode] = useState<"create" | "rename">("create"),
    [editingProject, setEditingProject] = useState(""),
    [editingEpisode, setEditingEpisode] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [deleteTarget, setDeleteTarget] = useState<{
      type: "project" | "episode";
      id: string;
      name: string;
    } | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [accentColor, setAccentColor] = useState(() =>
      readPreference("openreview-accent-color", "#ff5148"),
    ),
    [shortcuts, setShortcuts] = useState<ShortcutMap>(() => {
      try {
        return {
          ...DEFAULT_SHORTCUTS,
          ...JSON.parse(readPreference("openreview-shortcuts", "{}")),
        };
      } catch {
        return DEFAULT_SHORTCUTS;
      }
    }),
    [seekInterval, setSeekInterval] = useState(() =>
      Number(readPreference("openreview-seek-interval", "5")),
    ),
    [reviewerName, setReviewerName] = useState(() =>
      readPreference("openreview-reviewer", ""),
    );
  const [notesSlot, setNotesSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accentColor);
  }, [accentColor]);
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    pendingSeek = useRef<AbortController | null>(null),
    [now, setNow] = useState(0),
    [duration, setDuration] = useState(0),
    [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    document.title = APP_NAME;
    loadProjects()
      .then((p) => {
        setProjects(p);
        setReady(true);
      })
      .catch((e) => {
        setNotice(`Local storage unavailable: ${e.message}`);
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaveState("Saving");
    const t = setTimeout(
      () =>
        saveProjects(projects)
          .then(() => setSaveState("Saved"))
          .catch(() => setSaveState("Save failed")),
      250,
    );
    return () => clearTimeout(t);
  }, [projects, ready]);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );
  useEffect(() => {
    pendingSeek.current?.abort();
    pendingSeek.current = null;
  }, [activeId, episodeId, objectUrl]);
  const active = projects.find((p) => p.id === activeId);
  const ep = active?.episodes.find((e) => e.id === episodeId);
  const activeVersion =
    ep?.versions.find((v) => v.id === ep.activeVersionId) || ep?.versions[0];
  const timeOrderedIssues = useMemo(
    () => (ep ? [...ep.issues].sort((a, b) => a.start - b.start) : []),
    [ep],
  );
  const selectedIssueIndex = timeOrderedIssues.findIndex(
    (item) => item.id === selectedIssueId,
  );
  const previousIssue =
    selectedIssueIndex >= 0
      ? timeOrderedIssues[selectedIssueIndex - 1]
      : timeOrderedIssues.filter((item) => item.start < now - 0.05).at(-1);
  const nextIssue =
    selectedIssueIndex >= 0
      ? timeOrderedIssues[selectedIssueIndex + 1]
      : timeOrderedIssues.find((item) => item.start > now + 0.05);
  const persistProjects = useCallback(
    (update: React.SetStateAction<Project[]>) => {
      setSaveState("Saving");
      setProjects(update);
    },
    [],
  );
  const updateProject = useCallback(
    (fn: (p: Project) => Project) =>
      persistProjects((ps) =>
        ps.map((p) =>
          p.id === activeId
            ? { ...fn(p), updatedAt: new Date().toISOString() }
            : p,
        ),
      ),
    [activeId, persistProjects],
  );
  const updateEpisode = useCallback(
    (fn: (e: Episode) => Episode) =>
      updateProject((p) => ({
        ...p,
        episodes: p.episodes.map((e) => (e.id === episodeId ? fn(e) : e)),
      })),
    [episodeId, updateProject],
  );
  const visibleProjects = projects.filter(
    (p) =>
      Boolean(p.archived) === showArchived &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const filtered = useMemo(() => {
    if (!ep) return [];
    return ep.issues
      .filter(
        (i) =>
          (filter === "All issues" ||
            i.status === filter ||
            i.severity === filter) &&
          (versionFilter === "All versions" || i.versionId === versionFilter) &&
          (
            i.title +
            " " +
            i.description +
            " " +
            i.category +
            " " +
            (i.sourceText || "") +
            " " +
            (i.cleanedText || "")
          )
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) =>
        sortBy === "severity"
          ? sev.indexOf(a.severity) - sev.indexOf(b.severity) ||
            a.start - b.start
          : sortBy === "created"
            ? b.createdAt.localeCompare(a.createdAt)
            : a.start - b.start,
      );
  }, [ep, filter, search, sortBy, versionFilter]);
  function startProject() {
    setNameMode("create");
    setCreateName("");
    setCreateType("project");
  }
  function createQcProject(name: string) {
    const project = freshProject(name);
    persistProjects((current) => [...current, project]);
    return project.id;
  }
  function importQcNotes(
    projectId: string,
    parsedEpisodes: ParsedQcEpisode[],
    sourceText: string,
  ) {
    const batchId = uid();
    const importedAt = new Date().toISOString();
    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject) {
      setNotice("Choose a project before importing QC notes.");
      return;
    }
    const episodes = [...targetProject.episodes];
    let firstEpisodeId = "";
    for (const parsedEpisode of parsedEpisodes) {
      const normalizedName = parsedEpisode.name.trim().toLocaleLowerCase();
      let destination = episodes.find(
        (episode) => episode.name.trim().toLocaleLowerCase() === normalizedName,
      );
      if (!destination) {
        destination = {
          id: uid(),
          name: parsedEpisode.name.trim() || `Episode ${episodes.length + 1}`,
          versions: [],
          issues: [],
          observations: [],
        };
        episodes.push(destination);
      }
      firstEpisodeId ||= destination.id;
      const versionId =
        destination.activeVersionId || destination.versions[0]?.id;
      const importedIssues: Issue[] = parsedEpisode.issues.map((record) => {
        const display = record.cleanedText.trim() || record.sourceText.trim();
        const firstLine = display.split("\n")[0];
        return {
          id: uid(),
          title:
            firstLine.length > 88 ? `${firstLine.slice(0, 85)}…` : firstLine,
          description: display,
          fix: "",
          category: record.category,
          severity: record.severity,
          status: record.status,
          scope: "Single frame",
          start: record.start,
          versionId,
          createdAt: importedAt,
          updatedAt: importedAt,
          sourceTimestamp: record.sourceTimestamp,
          sourceText: record.sourceText,
          cleanedText: record.cleanedText,
          importBatchId: batchId,
        };
      });
      const observations = parsedEpisode.observations.map((record) => ({
        id: uid(),
        sourceText: record.sourceText,
        cleanedText: record.cleanedText,
        importBatchId: batchId,
      }));
      const nextEpisode = {
        ...destination,
        issues: [...destination.issues, ...importedIssues],
        observations: [...(destination.observations || []), ...observations],
      };
      episodes.splice(
        episodes.findIndex((episode) => episode.id === destination?.id),
        1,
        nextEpisode,
      );
    }
    const importedProject: Project = {
      ...targetProject,
      episodes,
      noteImports: [
        ...(targetProject.noteImports || []),
        { id: batchId, sourceText, importedAt },
      ],
      updatedAt: importedAt,
    };
    persistProjects((current) =>
      current.map((project) =>
        project.id === projectId ? importedProject : project,
      ),
    );
    setActiveId(projectId);
    setEpisodeId(firstEpisodeId);
    setFile(null);
    setObjectUrl("");
    setRelinkVersionId("");
    setShowQcNotes(false);
    setNotice(
      "QC notes imported. Select or relink each episode's local video when ready.",
    );
  }
  function renameProject(p: Project) {
    setEditingProject(p.id);
    setNameMode("rename");
    setCreateName(p.name);
    setCreateType("project");
  }
  function renameEpisode(e: Episode) {
    setEditingEpisode(e.id);
    setNameMode("rename");
    setCreateName(e.name);
    setCreateType("episode");
  }
  function createNamed() {
    const name = createName.trim();
    if (!name) return;
    if (nameMode === "rename") {
      if (createType === "project")
        persistProjects((ps) =>
          ps.map((p) =>
            p.id === editingProject
              ? { ...p, name, updatedAt: new Date().toISOString() }
              : p,
          ),
        );
      else if (active)
        persistProjects((ps) =>
          ps.map((p) =>
            p.id === activeId
              ? {
                  ...p,
                  episodes: p.episodes.map((e) =>
                    e.id === editingEpisode ? { ...e, name } : e,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        );
    } else if (createType === "project") {
      const p = freshProject(name);
      persistProjects((ps) => [p, ...ps]);
      setActiveId(p.id);
    } else if (active) {
      const e: Episode = { id: uid(), name, versions: [], issues: [] };
      updateProject((p) => ({ ...p, episodes: [...p.episodes, e] }));
      setEpisodeId(e.id);
      setFile(null);
      setObjectUrl("");
      setRelinkVersionId("");
    }
    setCreateType("");
  }
  function addEpisode() {
    if (!active) return;
    setNameMode("create");
    setCreateName("");
    setCreateType("episode");
  }
  function chooseVideo(f: File) {
    if (!ep || !active) return;
    if (relinkVersionId) {
      const previous = ep.versions.find((v) => v.id === relinkVersionId);
      if (previous) {
        relinkDurationBaseline.current = previous.duration ?? null;
        const metadataMatches =
          previous.filename === f.name && previous.size === f.size;
        updateEpisode((e) => ({
          ...e,
          versions: e.versions.map((v) =>
            v.id === relinkVersionId
              ? { ...v, filename: f.name, size: f.size }
              : v,
          ),
          issues: e.issues.map((issue) =>
            issue.versionId ? issue : { ...issue, versionId: relinkVersionId },
          ),
          activeVersionId: relinkVersionId,
        }));
        setNotice(
          metadataMatches
            ? `${previous.label} relinked. Filename and size match; source identity is probable, not verified.`
            : `${previous.label} relinked with different source metadata. Existing issue timestamps remain attached to this version.`,
        );
      }
      setRelinkVersionId("");
      setFile(f);
      setVideoErr("");
      setNow(0);
      setDuration(0);
      setIsPlaying(false);
      setObjectUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(f);
      });
      return;
    }
    const id = uid();
    relinkDurationBaseline.current = null;
    const v: Version = {
      id,
      label: `Version ${ep.versions.length + 1}`,
      filename: f.name,
      size: f.size,
      addedAt: new Date().toISOString(),
    };
    updateEpisode((e) => ({
      ...e,
      versions: [...e.versions, v],
      issues: e.issues.map((issue) =>
        issue.versionId ? issue : { ...issue, versionId: id },
      ),
      activeVersionId: id,
    }));
    setFile(f);
    setVideoErr("");
    setNow(0);
    setDuration(0);
    setIsPlaying(false);
    setObjectUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }
  function selectVersion(versionId: string) {
    if (!ep) return;
    const version = ep.versions.find((v) => v.id === versionId);
    if (!version) return;
    updateEpisode((e) => ({ ...e, activeVersionId: versionId }));
    setRelinkVersionId(versionId);
    if (file?.name !== version.filename || file.size !== version.size) {
      setFile(null);
      setObjectUrl("");
      setIsPlaying(false);
    }
  }
  function seek(t: number) {
    if (video.current && Number.isFinite(t)) {
      video.current.currentTime = Math.max(
        0,
        Math.min(t, video.current.duration || t),
      );
      video.current.pause();
    }
  }
  const capture = useCallback(() => {
    if (!ep || !activeVersion || !file) {
      setNotice(
        "Relink the local source video before logging a timecoded issue.",
      );
      return;
    }
    const t = video.current?.currentTime || now;
    video.current?.pause();
    let screenshot: string | undefined;
    try {
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const c = canvas.current!;
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")?.drawImage(v, 0, 0);
        screenshot = c.toDataURL("image/jpeg", 0.82);
      }
    } catch {
      setNotice(
        "Frame capture is unavailable for this media. You can still save the issue.",
      );
    }
    setIssue({
      id: uid(),
      title: "",
      description: "",
      fix: "",
      category: "Continuity",
      severity: "Major",
      status: "Open",
      scope: "Single frame",
      start: t,
      versionId: activeVersion.id,
      reviewer: reviewerName || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      screenshot,
      annotations: [],
    });
    setNewIssue(true);
  }, [activeVersion, ep, file, now, reviewerName]);
  async function saveIssue() {
    if (!issue || !ep) return;
    if (!issue.title.trim()) {
      setNotice("Add a short issue title before saving.");
      return;
    }
    const saved: Issue = {
      ...issue,
      title: issue.title.trim(),
      updatedAt: new Date().toISOString(),
    };
    delete saved.annotatedScreenshot;
    let annotationImageFailed = false;
    if (saved.screenshot && saved.annotations?.length) {
      try {
        saved.annotatedScreenshot = await renderAnnotatedFrame(
          saved.screenshot,
          saved.annotations,
        );
      } catch {
        annotationImageFailed = true;
      }
    }
    updateEpisode((e) => ({
      ...e,
      issues: e.issues.some((i) => i.id === saved.id)
        ? e.issues.map((i) => (i.id === saved.id ? saved : i))
        : [...e.issues, saved],
    }));
    setNewIssue(false);
    setIssue(null);
    setNotice(
      annotationImageFailed
        ? "Issue saved with editable annotations; the separate composite image could not be generated."
        : "Issue saved locally.",
    );
  }
  function editIssue(i: Issue) {
    setSelectedIssueId(i.id);
    setIssue({ ...i, annotations: i.annotations || [] });
    setNewIssue(false);
  }
  async function openIssueAtTime(i: Issue) {
    setSelectedIssueId(i.id);
    editIssue(i);
    if (!video.current || !file) {
      setNotice(
        `Issue at ${i.sourceTimestamp || timecode(i.start)} is saved. Select this episode's local video to seek to it.`,
      );
      return;
    }
    pendingSeek.current?.abort();
    const controller = new AbortController();
    pendingSeek.current = controller;
    try {
      const actualTime = await seekMediaTime(
        video.current,
        i.start,
        8000,
        controller.signal,
      );
      if (pendingSeek.current !== controller) return;
      video.current.pause();
      setIsPlaying(false);
      setNow(actualTime);
      setVideoErr("");
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error
          ? error.message
          : "Could not seek to this issue.";
      setNotice(message);
    } finally {
      if (pendingSeek.current === controller) pendingSeek.current = null;
    }
  }
  async function doExport(kind: string, scope: string, includeSource: boolean) {
    if (!active) return;
    const exportProject = structuredClone(active);
    if (scope === "episode") {
      if (!episodeId) {
        setNotice("Choose an episode before exporting an episode report.");
        return;
      }
      exportProject.episodes = exportProject.episodes.filter(
        (e) => e.id === episodeId,
      );
    } else if (scope === "filtered") {
      const issueIds = new Set(filtered.map((i) => i.id));
      exportProject.episodes = exportProject.episodes
        .map((e) => ({
          ...e,
          issues: e.issues.filter((i) => issueIds.has(i.id)),
        }))
        .filter((e) => e.issues.length > 0);
    }
    const suffix =
      scope === "episode"
        ? `-${(ep?.name || "episode").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        : scope === "filtered"
          ? "-filtered"
          : "";
    const base = `${active.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${suffix}`;
    if (kind === "zip") {
      download(
        await exportPackage(
          exportProject,
          includeSource ? file || undefined : undefined,
        ),
        `${base}-review.zip`,
      );
    } else {
      const ext = kind;
      download(
        new Blob(
          [reportText(exportProject, kind as "md" | "txt" | "json" | "html")],
          {
            type: kind === "html" ? "text/html" : "text/plain",
          },
        ),
        `${base}-review.${ext}`,
      );
    }
    setShowExport(false);
    setNotice(`Review ${kind.toUpperCase()} exported.`);
  }
  async function doImport(f: File) {
    try {
      const p = await importPackage(f);
      persistProjects((ps) => [p, ...ps.filter((x) => x.id !== p.id)]);
      setActiveId(p.id);
      setEpisodeId("");
      setFile(null);
      setObjectUrl("");
      setRelinkVersionId("");
      setNow(0);
      setDuration(0);
      setNotice(
        "Review package imported. Relink a source video in the episode to continue playback.",
      );
    } catch (e) {
      setNotice(`Import failed: ${(e as Error).message}`);
    }
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;
      if (typing) return;
      if (e.key === "Escape") {
        if (confirmDelete) setConfirmDelete(false);
        else if (issue) {
          setIssue(null);
          setNewIssue(false);
        } else if (showHelp) setShowHelp(false);
        else if (showExport) setShowExport(false);
        return;
      }
      if (issue) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setNotice("Review changes save automatically in this browser.");
        return;
      }
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        normalizeShortcut(e.key) === shortcuts.capture
      ) {
        e.preventDefault();
        capture();
      } else if (e.code === "Space" && video.current) {
        e.preventDefault();
        if (video.current.paused) {
          video.current.play();
        } else {
          video.current.pause();
        }
      } else if (e.key === "ArrowLeft" && video.current) {
        video.current.currentTime = Math.max(
          0,
          video.current.currentTime - seekInterval,
        );
      } else if (e.key === "ArrowRight" && video.current) {
        video.current.currentTime += seekInterval;
      } else if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        normalizeShortcut(e.key) === shortcuts.bookmark &&
        ep &&
        activeVersion
      ) {
        if (!file) {
          setNotice(
            "Relink this episode's local video before adding a bookmark.",
          );
          return;
        }
        const i: Issue = {
          id: uid(),
          title: "Bookmark",
          description: "",
          fix: "",
          category: "Other",
          severity: "Cosmetic",
          status: "Open",
          scope: "Single frame",
          start: video.current?.currentTime || 0,
          versionId: activeVersion.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        updateEpisode((x) => ({ ...x, issues: [...x.issues, i] }));
        setNotice("Bookmark saved.");
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [
    ep,
    activeVersion,
    file,
    activeId,
    episodeId,
    capture,
    updateEpisode,
    issue,
    confirmDelete,
    showHelp,
    showExport,
    seekInterval,
    shortcuts,
  ]);
  const notesPanel = ep ? (
    <>
      {!!ep.observations?.length && (
        <section
          className="episode-observations"
          aria-label="Episode-wide observations"
        >
          <div className="episode-observations-head">
            <b>Episode-wide observations</b>
            <span>{ep.observations.length}</span>
          </div>
          {ep.observations.map((observation) => (
            <article key={observation.id}>
              <p>{observation.cleanedText}</p>
              <small>Source note: {observation.sourceText}</small>
            </article>
          ))}
        </section>
      )}
      <div className="issue-head">
        <div>
          <p className="eyebrow">REVIEW NOTES</p>
          <h2>
            Issues <span>{filtered.length}</span>
          </h2>
          <div className="issue-jump">
            <button
              className="secondary small"
              disabled={!previousIssue}
              onClick={() =>
                previousIssue && void openIssueAtTime(previousIssue)
              }
            >
              <ArrowLeft size={13} /> Previous issue
            </button>
            <button
              className="secondary small"
              disabled={!nextIssue}
              onClick={() => nextIssue && void openIssueAtTime(nextIssue)}
            >
              Next issue <ArrowRight size={13} />
            </button>
          </div>
        </div>
        <div className="issue-tools">
          <label className="filter-select">
            <SlidersHorizontal size={14} />
            <select
              aria-label="Filter issues"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option>All issues</option>
              {statuses.map((x) => (
                <option key={x}>{x}</option>
              ))}
              {sev.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
          <label className="filter-select version-filter">
            <select
              aria-label="Filter by version"
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
            >
              <option value="All versions">All versions</option>
              {ep.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
          <label className="filter-select sort-filter">
            <select
              aria-label="Sort issues"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="time">Timecode</option>
              <option value="severity">Severity</option>
              <option value="created">Newest</option>
            </select>
            <ChevronDown size={13} />
          </label>
          <div className="searchbox issue-search">
            <Search size={14} />
            <input
              aria-label="Search issues"
              placeholder="Find issue"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="issue-list">
        {filtered.length === 0 ? (
          <div className="issue-empty">
            <div className="empty-icon small-icon">
              <Check />
            </div>
            <h3>
              {ep.issues.length
                ? "No issues match these filters"
                : "Nothing flagged yet"}
            </h3>
            <p>
              {ep.issues.length
                ? "Adjust your search or filter."
                : "Press M during playback or log an issue to capture a frame."}
            </p>
            {!ep.issues.length && (
              <button
                className="secondary small"
                onClick={capture}
                disabled={!activeVersion || !file}
              >
                <Plus size={14} /> Log first issue
              </button>
            )}
          </div>
        ) : (
          filtered.map((i) => (
            <article
              className={`issue-row ${selectedIssueId === i.id ? "current" : ""}`}
              key={i.id}
            >
              <button
                className="issue-body"
                onClick={() => void openIssueAtTime(i)}
              >
                <span className={`sev-dot ${i.severity.toLowerCase()}`} />
                <span className="issue-data">
                  <span className="issue-row-top">
                    <b>{i.title}</b>
                    <time>{i.sourceTimestamp || timecode(i.start)}</time>
                  </span>
                  <span className="issue-row-bottom">
                    <span className="version-tag">
                      {ep.versions.find((v) => v.id === i.versionId)?.label ||
                        "Source missing"}
                    </span>
                    <i>·</i>
                    <span>{i.category}</span>
                    <i>·</i>
                    <span
                      className={`severity-label ${i.severity.toLowerCase()}`}
                    >
                      {i.severity}
                    </span>
                    <i>·</i>
                    <span
                      className={`status-label ${i.status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {i.status}
                    </span>
                    {i.description && (
                      <>
                        <i>·</i>
                        <span className="issue-description">
                          {i.description}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                <ArrowRight size={15} />
              </button>
              <button
                className="status-cycle"
                title="Change status"
                onClick={() =>
                  updateEpisode((e) => ({
                    ...e,
                    issues: e.issues.map((x) =>
                      x.id === i.id
                        ? {
                            ...x,
                            status:
                              statuses[
                                (statuses.indexOf(x.status) + 1) %
                                  statuses.length
                              ],
                            updatedAt: new Date().toISOString(),
                          }
                        : x,
                    ),
                  }))
                }
              >
                {i.status === "Resolved" ? (
                  <Check size={13} />
                ) : (
                  <MoreHorizontal size={14} />
                )}
              </button>
            </article>
          ))
        )}
      </div>
    </>
  ) : null;
  if (!ready)
    return (
      <main className="loading">
        OPENREVIEW <span>Loading local reviews…</span>
      </main>
    );
  if (!active)
    return (
      <main className="library">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">OR</span>
            <b>{APP_NAME}</b>
          </div>
          <div className="top-actions">
            <button
              className="icon-btn"
              title="Help"
              onClick={() => setShowHelp(true)}
            >
              <HelpCircle />
            </button>
            <button
              className="icon-btn"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </button>
          </div>
        </header>
        <section className="library-content">
          <div className="page-head">
            <div>
              <p className="eyebrow">LOCAL REVIEW LIBRARY</p>
              <h1>Your projects</h1>
              <p className="muted">
                Video stays on this device. Review notes are saved in this
                browser.
              </p>
            </div>
            <div className="head-actions">
              <button
                className="secondary"
                onClick={() => setShowQcNotes(true)}
              >
                <FileText size={16} /> QC Notes Studio
              </button>
              <button
                className="secondary"
                onClick={() => importInput.current?.click()}
              >
                <Import size={16} /> Import review
              </button>
              <button
                className="secondary"
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived ? "Active projects" : "Archived"}
              </button>
              <button className="primary" onClick={startProject}>
                <Plus size={17} /> New project
              </button>
            </div>
          </div>
          <div className="library-tools">
            <div className="searchbox">
              <Search size={16} />
              <input
                placeholder="Search projects"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <span className="subtle">
              {projects.filter((p) => !p.archived).length} PROJECTS
            </span>
          </div>
          {visibleProjects.length === 0 ? (
            <div className="empty-library">
              <div className="empty-icon">
                <Film />
              </div>
              <h2>
                {projects.length
                  ? "No matching projects"
                  : "Start a review project"}
              </h2>
              <p>
                {projects.length
                  ? "Try a different search."
                  : "Create a project to organize episodes and quality notes."}
              </p>
              <button className="primary" onClick={startProject}>
                <FolderPlus size={16} /> Create project
              </button>
            </div>
          ) : (
            <div className="project-list">
              {visibleProjects.map((p) => (
                <div className="project-row" key={p.id}>
                  <button
                    className="project-open"
                    onClick={() => setActiveId(p.id)}
                  >
                    <span className="project-icon">
                      <Film />
                    </span>
                    <span className="project-name">
                      <b>{p.name}</b>
                      <small>
                        {p.episodes.length} episodes ·{" "}
                        {p.episodes.reduce(
                          (n, e) =>
                            n +
                            e.issues.filter((i) => i.status !== "Resolved")
                              .length,
                          0,
                        )}{" "}
                        open issues
                      </small>
                    </span>
                    <span className="project-date">
                      Updated {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="project-action"
                    title="Rename project"
                    onClick={() => renameProject(p)}
                  >
                    Rename
                  </button>
                  <button
                    className="project-action"
                    title={p.archived ? "Restore project" : "Archive project"}
                    onClick={() =>
                      persistProjects((ps) =>
                        ps.map((x) =>
                          x.id === p.id
                            ? {
                                ...x,
                                archived: !x.archived,
                                updatedAt: new Date().toISOString(),
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {p.archived ? "Restore" : "Archive"}
                  </button>
                  <button
                    className="project-action danger-text"
                    title="Delete project permanently"
                    onClick={() => {
                      setDeleteTarget({
                        type: "project",
                        id: p.id,
                        name: p.name,
                      });
                      setConfirmDelete(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="privacy-note">
            <span className="privacy-dot" /> Local-first by design{" "}
            <span>·</span> No account required <span>·</span> No video uploads
          </p>
        </section>
        <input
          ref={importInput}
          hidden
          type="file"
          accept=".zip"
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
        {notice && (
          <div role="status" className="toast" onClick={() => setNotice("")}>
            {notice}
            <button aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}
        {showHelp && (
          <Help onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
        )}
        {showQcNotes && (
          <QcNotesStudio
            projects={projects}
            onClose={() => setShowQcNotes(false)}
            onCreateProject={createQcProject}
            onImport={importQcNotes}
          />
        )}
        {settingsOpen && (
          <SettingsDialog
            reviewer={reviewerName}
            interval={seekInterval}
            accentColor={accentColor}
            shortcuts={shortcuts}
            onSave={(name, interval, color, keyMap) => {
              setReviewerName(name);
              setSeekInterval(interval);
              setAccentColor(color);
              setShortcuts(keyMap);
              writePreference("openreview-reviewer", name);
              writePreference("openreview-seek-interval", String(interval));
              writePreference("openreview-accent-color", color);
              writePreference("openreview-shortcuts", JSON.stringify(keyMap));
              setSettingsOpen(false);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {confirmDelete && deleteTarget?.type === "project" && (
          <ConfirmDialog
            title="Delete project?"
            message={`“${deleteTarget.name}” and all its episodes and review notes will be permanently removed from this browser.`}
            confirmLabel="Delete project"
            onCancel={() => {
              setConfirmDelete(false);
              setDeleteTarget(null);
            }}
            onConfirm={() => {
              persistProjects((current) =>
                current.filter((project) => project.id !== deleteTarget.id),
              );
              setConfirmDelete(false);
              setDeleteTarget(null);
            }}
          />
        )}
        {createType && (
          <NameDialog
            type={createType}
            mode={nameMode}
            value={createName}
            onChange={setCreateName}
            onClose={() => setCreateType("")}
            onCreate={createNamed}
          />
        )}
      </main>
    );
  return (
    <main className="studio">
      <header className="topbar workbar">
        <button
          className="back-link"
          onClick={() => {
            setActiveId("");
            setEpisodeId("");
            setFile(null);
            setObjectUrl("");
          }}
        >
          <ArrowLeft size={16} />
          <span>Library</span>
        </button>
        <span className="crumb">/</span>
        <button className="crumb-name" onClick={() => setActiveId("")}>
          {active.name}
        </button>
        <span className="crumb">/</span>
        {ep ? (
          <span className="crumb-current">{ep.name}</span>
        ) : (
          <button className="crumb-name" onClick={addEpisode}>
            Add episode
          </button>
        )}
        <label className="mobile-episode-picker">
          <span>Episode</span>
          <select
            aria-label="Choose episode"
            value={episodeId}
            onChange={(e) => {
              setEpisodeId(e.target.value);
              setFile(null);
              setObjectUrl("");
              setRelinkVersionId("");
            }}
          >
            <option value="">Choose episode</option>
            {active.episodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="work-right">
          <span
            className={`save-state ${saveState === "Saved" ? "saved" : ""}`}
          >
            <span /> {saveState}
          </span>
          <button
            className="secondary small"
            disabled={!active.episodes.length}
            onClick={() => setShowExport(true)}
          >
            <Download size={15} /> Export
          </button>
          <button
            className="secondary small"
            onClick={() => setShowQcNotes(true)}
          >
            <FileText size={15} /> QC Notes
          </button>
          <button
            className="icon-btn"
            title="Help and shortcuts"
            onClick={() => setShowHelp(true)}
          >
            <HelpCircle />
          </button>
          <button
            className="icon-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings />
          </button>
        </div>
      </header>
      <div className="work-layout">
        <aside className="left-rail">
          <p className="eyebrow">PROJECT</p>
          <div className="rail-project">{active.name}</div>
          <div className="rail-heading">
            <span>EPISODES</span>
            <button title="Add episode" onClick={addEpisode}>
              <Plus size={15} />
            </button>
          </div>
          {active.episodes.map((e) => (
            <div className="episode-row" key={e.id}>
              <button
                className={`episode-link ${e.id === episodeId ? "selected" : ""}`}
                onClick={() => {
                  setEpisodeId(e.id);
                  setFile(null);
                  setObjectUrl("");
                  setRelinkVersionId("");
                }}
              >
                <Film size={15} />
                <span>{e.name}</span>
                <small>
                  {e.issues.filter((i) => i.status !== "Resolved").length}
                </small>
              </button>
              <button
                className="episode-delete"
                aria-label={`Delete episode ${e.name}`}
                title={`Delete ${e.name}`}
                onClick={() => {
                  setDeleteTarget({ type: "episode", id: e.id, name: e.name });
                  setConfirmDelete(true);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {!active.episodes.length && (
            <p className="rail-empty">No episodes yet</p>
          )}
          <button className="add-episode" onClick={addEpisode}>
            <Plus size={15} /> Add episode
          </button>
          <div className="rail-bottom">
            <p className="privacy-note">
              <span className="privacy-dot" /> Files stay on device
            </p>
          </div>
        </aside>
        {!ep ? (
          <section className="work-empty">
            <div className="empty-icon">
              <Film />
            </div>
            <h2>Choose an episode to review</h2>
            <p>
              Create an episode to begin organizing footage and review notes.
            </p>
            <button className="primary" onClick={addEpisode}>
              <Plus size={16} /> Add episode
            </button>
          </section>
        ) : (
          <section className="review-main">
            <div className="review-toolbar">
              <div>
                <div className="episode-title">
                  <h1>{ep.name}</h1>
                  <button
                    className="icon-btn"
                    title="Rename episode"
                    onClick={() => renameEpisode(ep)}
                  >
                    <MoreHorizontal />
                  </button>
                </div>
                <div className="media-meta">
                  {activeVersion ? (
                    <>
                      <span className="green-dot" /> {activeVersion.label} ·{" "}
                      {activeVersion.filename} ·{" "}
                      {formatBytes(activeVersion.size)}
                    </>
                  ) : (
                    <span>No source linked</span>
                  )}
                </div>
                {activeVersion && (
                  <label className="mobile-version-picker">
                    <span>Source version</span>
                    <select
                      aria-label="Choose video version"
                      value={ep.activeVersionId || activeVersion.id}
                      onChange={(e) => selectVersion(e.target.value)}
                    >
                      {ep.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} · {v.filename}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="toolbar-actions">
                <button
                  className="secondary small"
                  onClick={() => {
                    setRelinkVersionId(activeVersion?.id || "");
                    fileInput.current?.click();
                  }}
                >
                  <Upload size={15} />
                  {activeVersion ? "Relink source" : "Add video"}
                </button>
                {activeVersion && (
                  <button
                    className="secondary small"
                    title="Add a new video version"
                    onClick={() => {
                      setRelinkVersionId("");
                      fileInput.current?.click();
                    }}
                  >
                    <Plus size={14} />
                    New version
                  </button>
                )}
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/*"
                  onChange={(e) =>
                    e.target.files?.[0] && chooseVideo(e.target.files[0])
                  }
                  onClick={(e) => {
                    (e.currentTarget as HTMLInputElement).value = "";
                  }}
                />
                <button
                  className="primary small"
                  onClick={capture}
                  disabled={!activeVersion || !file}
                  title={`Log issue (${shortcutLabel(shortcuts.capture)})`}
                >
                  <Plus size={16} /> Log issue{" "}
                  <kbd>{shortcutLabel(shortcuts.capture)}</kbd>
                </button>
              </div>
            </div>
            <div className="player-wrap">
              {objectUrl ? (
                <>
                  <video
                    key={objectUrl}
                    ref={video}
                    src={objectUrl}
                    onTimeUpdate={() => setNow(video.current?.currentTime || 0)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={() => {
                      const d = video.current?.duration || 0;
                      setDuration(d);
                      const previousDuration = relinkDurationBaseline.current;
                      relinkDurationBaseline.current = null;
                      if (
                        previousDuration !== null &&
                        Math.abs(previousDuration - d) > 0.5
                      ) {
                        setNotice(
                          `Relinked video duration differs (${timecode(previousDuration)} vs ${timecode(d)}). Issue timestamps may have shifted; existing times were left unchanged.`,
                        );
                      }
                      if (activeVersion)
                        updateEpisode((e) => ({
                          ...e,
                          versions: e.versions.map((v) =>
                            v.id === activeVersion.id
                              ? { ...v, duration: d }
                              : v,
                          ),
                        }));
                    }}
                    onError={() =>
                      setVideoErr(
                        "This browser could not decode the selected video. Your review notes are safe; try H.264/AAC MP4 or another browser.",
                      )
                    }
                    playsInline
                    controls
                  />
                  <div className="player-overlay-bottom">
                    {videoErr && <span role="alert">{videoErr}</span>}
                  </div>
                </>
              ) : (
                <div
                  className="video-empty"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f?.type.startsWith("video/")) chooseVideo(f);
                  }}
                >
                  <div className="film-art">
                    <Film size={26} />
                  </div>
                  <h2>
                    {activeVersion
                      ? "Relink the source video"
                      : "Bring in an episode"}
                  </h2>
                  <p>
                    {activeVersion
                      ? `Review notes are attached to ${activeVersion.label}.`
                      : "Choose a local video file to begin reviewing."}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setRelinkVersionId(activeVersion?.id || "");
                      fileInput.current?.click();
                    }}
                  >
                    <Upload size={16} />{" "}
                    {activeVersion
                      ? "Relink source video"
                      : "Select local video"}
                  </button>
                  <small>
                    Your source video is opened in this browser and is never
                    uploaded.
                  </small>
                </div>
              )}
            </div>
            <div className="transport">
              <button
                className="transport-btn"
                aria-label="Back 5 seconds"
                onClick={() => seek((video.current?.currentTime || 0) - 5)}
              >
                <ArrowLeft />
              </button>
              <button
                className="play-btn"
                aria-label="Play or pause"
                onClick={() => {
                  if (video.current) {
                    if (video.current.paused) {
                      video.current.play();
                    } else {
                      video.current.pause();
                    }
                  }
                }}
              >
                {isPlaying ? <Pause /> : <Play />}
              </button>
              <button
                className="transport-btn"
                aria-label="Forward 5 seconds"
                onClick={() => seek((video.current?.currentTime || 0) + 5)}
              >
                <ArrowRight />
              </button>
              <span className="time-readout">
                {timecode(now)} <i>/</i> {timecode(duration)}
              </span>
              <div className="transport-spacer" />
              <button
                className="transport-btn"
                title={`Bookmark (${shortcutLabel(shortcuts.bookmark)})`}
                aria-label={`Bookmark (${shortcutLabel(shortcuts.bookmark)})`}
                disabled={!activeVersion || !file}
                onClick={() => {
                  if (ep && activeVersion && file) {
                    const i: Issue = {
                      id: uid(),
                      title: "Bookmark",
                      description: "",
                      fix: "",
                      category: "Other",
                      severity: "Cosmetic",
                      status: "Open",
                      scope: "Single frame",
                      start: now,
                      versionId: activeVersion.id,
                      reviewer: reviewerName || undefined,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    updateEpisode((e) => ({ ...e, issues: [...e.issues, i] }));
                    setNotice("Bookmark saved.");
                  }
                }}
              >
                <Bookmark />
              </button>
              <Volume2 size={16} />
              <input
                aria-label="Volume"
                className="volume"
                type="range"
                min="0"
                max="1"
                step=".05"
                defaultValue="1"
                onChange={(e) => {
                  if (video.current)
                    video.current.volume = Number(e.target.value);
                }}
              />
              <select
                className="speed-select"
                aria-label="Playback speed"
                defaultValue="1"
                onChange={(e) => {
                  if (video.current)
                    video.current.playbackRate = Number(e.target.value);
                }}
              >
                {["0.5", "0.75", "1", "1.25", "1.5", "2"].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
              <button
                className="transport-btn"
                title="Fullscreen"
                onClick={() => video.current?.requestFullscreen()}
              >
                <MoreHorizontal />
              </button>
            </div>
            <div className="timeline-area">
              <div className="timeline">
                <input
                  aria-label="Seek video"
                  type="range"
                  min="0"
                  max={duration || 100}
                  step=".1"
                  value={Math.min(now, duration || 100)}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <div className="timeline-markers">
                  {ep.issues.map((i) =>
                    i.end && i.end > i.start && duration ? (
                      <button
                        key={i.id}
                        className={`marker-range ${i.severity.toLowerCase()} ${selectedIssueId === i.id ? "active" : ""}`}
                        style={{
                          left: `${Math.min(100, (i.start / duration) * 100)}%`,
                          width: `${Math.max(1.5, Math.min(100 - (i.start / duration) * 100, ((i.end - i.start) / duration) * 100))}%`,
                        }}
                        title={`${i.sourceTimestamp || timecode(i.start)}–${timecode(i.end)} · ${i.title}`}
                        onClick={() => void openIssueAtTime(i)}
                        aria-label={`Issue range ${i.sourceTimestamp || timecode(i.start)} to ${timecode(i.end)}: ${i.title}`}
                      />
                    ) : (
                      <button
                        key={i.id}
                        className={`marker ${i.severity.toLowerCase()} ${selectedIssueId === i.id ? "active" : ""}`}
                        style={{
                          left: `${duration ? Math.min(100, (i.start / duration) * 100) : 0}%`,
                        }}
                        title={`${i.sourceTimestamp || timecode(i.start)} · ${i.title}`}
                        onClick={() => void openIssueAtTime(i)}
                        aria-label={`Issue at ${i.sourceTimestamp || timecode(i.start)}: ${i.title}`}
                      />
                    ),
                  )}
                </div>
              </div>
              <div className="timeline-foot">
                <span>00:00</span>
                <span>{ep.issues.length} markers</span>
                <span>{timecode(duration)}</span>
              </div>
            </div>
          </section>
        )}
        <aside className="right-rail">
          <div className="notes-slot" ref={setNotesSlot} />
          {notesSlot && notesPanel && createPortal(notesPanel, notesSlot)}
          <div className="rail-heading">
            <span>VERSION HISTORY</span>
            <button
              title="Add a new video version"
              aria-label="Add a new video version"
              onClick={() => {
                setRelinkVersionId("");
                fileInput.current?.click();
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {ep?.versions.map((v, index) => (
            <button
              key={v.id}
              className={`version-row ${v.id === ep.activeVersionId ? "active" : ""}`}
              onClick={() => selectVersion(v.id)}
            >
              <span className="version-icon">
                V{ep.versions.length - index}
              </span>
              <span>
                <b>{v.label}</b>
                <small>{v.filename}</small>
                <small>
                  {new Date(v.addedAt).toLocaleDateString()} ·{" "}
                  {formatBytes(v.size)}
                </small>
              </span>
            </button>
          ))}
          {!ep?.versions.length && (
            <p className="rail-empty">Video versions appear here.</p>
          )}
          <div className="version-note">
            Issues stay linked to the version they were captured on.
          </div>
          <div className="right-stats">
            <p className="eyebrow">ISSUE SUMMARY</p>
            {sev.map((s) => (
              <div key={s}>
                <span className={`sev-dot ${s.toLowerCase()}`} />
                {s}
                <b>
                  {ep?.issues.filter(
                    (i) => i.severity === s && i.status !== "Resolved",
                  ).length || 0}
                </b>
              </div>
            ))}
          </div>
          <button className="export-link" onClick={() => setShowExport(true)}>
            <Download size={14} /> Export review package
          </button>
        </aside>
      </div>
      <canvas ref={canvas} hidden />
      {notice && (
        <div role="status" className="toast" onClick={() => setNotice("")}>
          {notice}
          <button aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      {issue && (
        <IssueEditor
          issue={issue}
          setIssue={setIssue}
          isNew={newIssue}
          onSave={saveIssue}
          onClose={() => {
            setIssue(null);
            setNewIssue(false);
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={
            deleteTarget ? `Delete ${deleteTarget.type}?` : "Delete this issue?"
          }
          message={
            deleteTarget
              ? `“${deleteTarget.name}” and its review notes will be permanently removed from this browser.`
              : "This removes the review note and its captured frame from this project."
          }
          confirmLabel={
            deleteTarget ? `Delete ${deleteTarget.type}` : "Delete issue"
          }
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteTarget(null);
          }}
          onConfirm={() => {
            if (deleteTarget?.type === "project") {
              persistProjects((current) =>
                current.filter((project) => project.id !== deleteTarget.id),
              );
              if (activeId === deleteTarget.id) {
                setActiveId("");
                setEpisodeId("");
                setFile(null);
                setObjectUrl("");
              }
            } else if (deleteTarget?.type === "episode") {
              updateProject((project) => ({
                ...project,
                episodes: project.episodes.filter(
                  (episode) => episode.id !== deleteTarget.id,
                ),
              }));
              if (episodeId === deleteTarget.id) {
                setEpisodeId("");
                setFile(null);
                setObjectUrl("");
                setRelinkVersionId("");
              }
            } else if (issue)
              updateEpisode((e) => ({
                ...e,
                issues: e.issues.filter((x) => x.id !== issue.id),
              }));
            setConfirmDelete(false);
            setDeleteTarget(null);
            setIssue(null);
          }}
        />
      )}
      {showHelp && (
        <Help onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
      )}
      {showQcNotes && (
        <QcNotesStudio
          projects={projects}
          initialProjectId={activeId}
          onClose={() => setShowQcNotes(false)}
          onCreateProject={createQcProject}
          onImport={importQcNotes}
        />
      )}
      {showExport && (
        <ExportDialog
          onClose={() => setShowExport(false)}
          onExport={doExport}
          hasEpisode={Boolean(ep)}
          hasSource={Boolean(
            file &&
            activeVersion &&
            ep?.versions.some((v) => v.id === activeVersion.id),
          )}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          reviewer={reviewerName}
          interval={seekInterval}
          accentColor={accentColor}
          shortcuts={shortcuts}
          onSave={(name, interval, color, keyMap) => {
            setReviewerName(name);
            setSeekInterval(interval);
            setAccentColor(color);
            setShortcuts(keyMap);
            writePreference("openreview-reviewer", name);
            writePreference("openreview-seek-interval", String(interval));
            writePreference("openreview-accent-color", color);
            writePreference("openreview-shortcuts", JSON.stringify(keyMap));
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {createType && (
        <NameDialog
          type={createType}
          mode={nameMode}
          value={createName}
          onChange={setCreateName}
          onClose={() => setCreateType("")}
          onCreate={createNamed}
        />
      )}
    </main>
  );
}
