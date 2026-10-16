import React, { useRef, useState } from "react";
import { ArrowRight, Check, FileArchive, Plus, Trash2, X } from "lucide-react";
import { CATEGORIES, timecode, uid } from "../lib/model";
import type { Annotation, Issue, Severity, Status } from "../lib/model";

export function IssueEditor({
  issue,
  setIssue,
  isNew,
  onSave,
  onClose,
  onDelete,
}: {
  issue: Issue;
  setIssue: (issue: Issue) => void;
  isNew: boolean;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [tool, setTool] = useState<"rect" | "ellipse" | "arrow" | "text">(
    "rect",
  );
  const [drawing, setDrawing] = useState(false);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
    mode: "move" | "resize";
  } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [annotationColor, setAnnotationColor] = useState("#ff584f");
  const [strokeSize, setStrokeSize] = useState(4);
  const [frameSize, setFrameSize] = useState<[number, number]>([16, 9]);
  const svg = useRef<SVGSVGElement>(null);
  function checkpoint() {
    setUndoStack((items) =>
      [...items, structuredClone(issue.annotations || [])].slice(-30),
    );
    setRedoStack([]);
  }
  function drawStart(e: React.PointerEvent<SVGSVGElement>) {
    if (!issue.screenshot || !svg.current) return;
    checkpoint();
    const r = svg.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const id = uid();
    setSelectedId(id);
    setIssue({
      ...issue,
      annotations: [
        ...(issue.annotations || []),
        {
          id,
          type: tool,
          x,
          y,
          w: tool === "text" ? 0.3 : 0,
          h: tool === "text" ? 0.06 : 0,
          color: annotationColor,
          label: tool === "text" ? "Note" : undefined,
        },
      ],
    });
    setDrawing(tool !== "text");
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function drawMove(e: React.PointerEvent<SVGSVGElement>) {
    if ((!drawing && !drag) || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (drag) {
      setIssue({
        ...issue,
        annotations: (issue.annotations || []).map((a) =>
          a.id === drag.id
            ? drag.mode === "resize"
              ? {
                  ...a,
                  w: drag.originW + x - drag.x,
                  h: drag.originH + y - drag.y,
                }
              : {
                  ...a,
                  x: drag.originX + x - drag.x,
                  y: drag.originY + y - drag.y,
                }
            : a,
        ),
      });
      return;
    }
    const items = [...(issue.annotations || [])];
    const last = items[items.length - 1];
    if (!last) return;
    items[items.length - 1] = { ...last, w: x - last.x, h: y - last.y };
    setIssue({ ...issue, annotations: items });
  }
  function moveStart(e: React.PointerEvent<SVGGElement>, a: Annotation) {
    e.stopPropagation();
    if (!svg.current) return;
    checkpoint();
    const r = svg.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setSelectedId(a.id);
    setDrag({
      id: a.id,
      x,
      y,
      originX: a.x,
      originY: a.y,
      originW: a.w,
      originH: a.h,
      mode: "move",
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function resizeStart(e: React.PointerEvent<SVGCircleElement>, a: Annotation) {
    e.stopPropagation();
    if (!svg.current) return;
    checkpoint();
    const r = svg.current.getBoundingClientRect();
    setSelectedId(a.id);
    setDrag({
      id: a.id,
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      originX: a.x,
      originY: a.y,
      originW: a.w,
      originH: a.h,
      mode: "resize",
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function undo() {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((items) =>
      [...items, structuredClone(issue.annotations || [])].slice(-30),
    );
    setUndoStack((items) => items.slice(0, -1));
    setIssue({ ...issue, annotations: previous });
  }
  function redo() {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((items) =>
      [...items, structuredClone(issue.annotations || [])].slice(-30),
    );
    setRedoStack((items) => items.slice(0, -1));
    setIssue({ ...issue, annotations: next });
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="issue-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">
              {isNew ? "NEW REVIEW NOTE" : "EDIT REVIEW NOTE"} ·{" "}
              {timecode(issue.start)}
            </p>
            <h2 id="editor-title">
              {isNew ? "Log an issue" : "Issue details"}
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="editor-scroll">
          {issue.screenshot && (
            <div
              className="annotate-box"
              style={{
                aspectRatio: `${frameSize[0]} / ${frameSize[1]}`,
                maxWidth: `min(100%, ${(260 * frameSize[0]) / frameSize[1]}px)`,
              }}
            >
              <img
                src={issue.screenshot}
                alt="Captured video frame"
                onLoad={(e) =>
                  setFrameSize([
                    e.currentTarget.naturalWidth,
                    e.currentTarget.naturalHeight,
                  ])
                }
              />
              <svg
                ref={svg}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                onPointerDown={drawStart}
                onPointerMove={drawMove}
                onPointerUp={() => {
                  setDrawing(false);
                  setDrag(null);
                }}
              >
                <defs></defs>
                {issue.annotations?.map((a) => (
                  <g
                    key={a.id}
                    onPointerDown={(e) => moveStart(e, a)}
                    onPointerUp={() => setDrag(null)}
                    className={selectedId === a.id ? "annotation-selected" : ""}
                    stroke={a.color}
                    strokeWidth={strokeSize / 1000}
                    fill="none"
                  >
                    {a.type === "text" ? (
                      <text
                        x={a.x}
                        y={a.y + 0.04}
                        fill={a.color}
                        stroke="none"
                        fontSize=".035"
                        fontWeight="700"
                      >
                        {a.label || "Note"}
                      </text>
                    ) : a.type === "ellipse" ? (
                      <ellipse
                        cx={a.x + a.w / 2}
                        cy={a.y + a.h / 2}
                        rx={Math.abs(a.w / 2)}
                        ry={Math.abs(a.h / 2)}
                      />
                    ) : a.type === "arrow" ? (
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={a.x + a.w}
                        y2={a.y + a.h}
                        markerEnd={`url(#arrowhead-${a.id})`}
                      />
                    ) : (
                      <rect x={a.x} y={a.y} width={a.w} height={a.h} />
                    )}
                    {a.type === "arrow" && (
                      <defs>
                        <marker
                          id={`arrowhead-${a.id}`}
                          markerWidth=".018"
                          markerHeight=".018"
                          refX=".015"
                          refY=".009"
                          orient="auto"
                          markerUnits="userSpaceOnUse"
                        >
                          <path d="M0,0 L.018,.009 L0,.018 Z" fill={a.color} />
                        </marker>
                      </defs>
                    )}
                    {selectedId === a.id && a.type !== "text" && (
                      <circle
                        className="resize-handle"
                        cx={a.x + a.w}
                        cy={a.y + a.h}
                        r=".012"
                        fill="#fff"
                        stroke="#111"
                        strokeWidth=".003"
                        onPointerDown={(e) => resizeStart(e, a)}
                        aria-label="Resize annotation"
                      />
                    )}
                  </g>
                ))}
              </svg>
            </div>
          )}
          <div className="annotate-tools">
            <span>FRAME ANNOTATION</span>
            {(["rect", "ellipse", "arrow", "text"] as const).map((t) => (
              <button
                key={t}
                className={tool === t ? "tool-active" : ""}
                onClick={() => setTool(t)}
              >
                {t === "rect"
                  ? "Box"
                  : t === "ellipse"
                    ? "Circle"
                    : t === "arrow"
                      ? "Arrow"
                      : "Text"}
              </button>
            ))}
            <label className="annotation-color" title="Annotation color">
              <input
                type="color"
                value={annotationColor}
                aria-label="Annotation color"
                onChange={(e) => setAnnotationColor(e.target.value)}
              />
            </label>
            <label className="annotation-width" title="Stroke thickness">
              <span>Line</span>
              <input
                type="range"
                min="2"
                max="10"
                value={strokeSize}
                aria-label="Stroke thickness"
                onChange={(e) => setStrokeSize(Number(e.target.value))}
              />
            </label>
            <button disabled={!undoStack.length} onClick={undo}>
              Undo
            </button>
            <button disabled={!redoStack.length} onClick={redo}>
              Redo
            </button>
            <button
              disabled={!selectedId}
              onClick={() => {
                checkpoint();
                setIssue({
                  ...issue,
                  annotations: (issue.annotations || []).filter(
                    (a) => a.id !== selectedId,
                  ),
                });
                setSelectedId("");
              }}
            >
              Delete selected
            </button>
            <button
              onClick={() => {
                checkpoint();
                setIssue({ ...issue, annotations: [] });
                setSelectedId("");
              }}
            >
              Clear
            </button>
          </div>
          {issue.annotations?.find(
            (a) => a.id === selectedId && a.type === "text",
          ) && (
            <label className="annotation-text field">
              <span>Text label</span>
              <input
                value={
                  issue.annotations.find((a) => a.id === selectedId)?.label ||
                  ""
                }
                onFocus={checkpoint}
                onChange={(e) =>
                  setIssue({
                    ...issue,
                    annotations: (issue.annotations || []).map((a) =>
                      a.id === selectedId ? { ...a, label: e.target.value } : a,
                    ),
                  })
                }
              />
            </label>
          )}
          <label className="field full">
            <span>
              Issue title <b>*</b>
            </span>
            <input
              autoFocus
              value={issue.title}
              placeholder="Describe the problem in a few words"
              onChange={(e) => setIssue({ ...issue, title: e.target.value })}
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Category</span>
              <select
                value={issue.category}
                onChange={(e) =>
                  setIssue({ ...issue, category: e.target.value })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Severity</span>
              <select
                value={issue.severity}
                onChange={(e) =>
                  setIssue({ ...issue, severity: e.target.value as Severity })
                }
              >
                {(
                  [
                    "Unassigned",
                    "Critical",
                    "Major",
                    "Minor",
                    "Cosmetic",
                  ] as Severity[]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={issue.status}
                onChange={(e) =>
                  setIssue({ ...issue, status: e.target.value as Status })
                }
              >
                {(
                  [
                    "Open",
                    "In progress",
                    "Resolved",
                    "Needs verification",
                  ] as Status[]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Scope</span>
              <select
                value={issue.scope}
                onChange={(e) => setIssue({ ...issue, scope: e.target.value })}
              >
                {[
                  "Single frame",
                  "Shot",
                  "Time range",
                  "Sequence",
                  "Audio segment",
                  "Episode-wide",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Timecode</span>
              <input value={timecode(issue.start)} readOnly />
            </label>
            {issue.scope === "Time range" && (
              <label className="field">
                <span>End (seconds)</span>
                <input
                  type="number"
                  min={issue.start}
                  value={issue.end || issue.start}
                  onChange={(e) =>
                    setIssue({ ...issue, end: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
          <label className="field full">
            <span>Observation</span>
            <textarea
              rows={3}
              value={issue.description}
              placeholder="What do you see?"
              onChange={(e) =>
                setIssue({ ...issue, description: e.target.value })
              }
            />
          </label>
          <label className="field full">
            <span>Requested fix</span>
            <textarea
              rows={2}
              value={issue.fix}
              placeholder="What should change?"
              onChange={(e) => setIssue({ ...issue, fix: e.target.value })}
            />
          </label>
        </div>
        <footer className="modal-foot">
          <div>
            {!isNew && (
              <button className="danger-ghost" onClick={onDelete}>
                <Trash2 size={15} /> Delete issue
              </button>
            )}
          </div>
          <div>
            <button className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" onClick={onSave}>
              <Check size={15} />
              {isNew ? "Save issue" : "Save changes"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function Help({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">QUICK REFERENCE</p>
            <h2 id="help-title">Review shortcuts</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="shortcut-list">
          {[
            ["Space", "Play / pause"],
            ["M", "Capture issue at current time"],
            ["B", "Add quick bookmark"],
            ["← / →", "Seek by your configured interval"],
            ["Esc", "Close the current dialog"],
            ["⌘/Ctrl + S", "Confirm automatic local save"],
          ].map(([key, desc]) => (
            <div key={key}>
              <kbd>{key}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          Shortcuts pause while you type in a field. Projects and notes are
          saved in this browser. Export a review ZIP for a portable backup.
        </p>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </section>
    </div>
  );
}

export function ExportDialog({
  onClose,
  onExport,
  hasEpisode,
  hasSource,
}: {
  onClose: () => void;
  onExport: (format: string, scope: string, includeSource: boolean) => void;
  hasEpisode: boolean;
  hasSource: boolean;
}) {
  const [scope, setScope] = useState("project");
  const [includeSource, setIncludeSource] = useState(false);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">PORTABLE REVIEW</p>
            <h2 id="export-title">Export review</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <p className="muted">
          Choose a shareable report format. The original video is not included
          in these exports.
        </p>
        <label className="field export-scope">
          <span>Export scope</span>
          <select
            aria-label="Export scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="project">Entire project</option>
            <option value="episode" disabled={!hasEpisode}>
              Current episode
            </option>
            <option value="filtered">Visible issue filter</option>
          </select>
        </label>
        <label className="source-export-option">
          <input
            type="checkbox"
            checked={includeSource}
            disabled={!hasSource}
            onChange={(e) => setIncludeSource(e.target.checked)}
          />
          <span>
            <b>Include the currently loaded source video</b>
            <small>
              Adds a full copy of this episode's source to the ZIP. It can make
              the package very large. Source files are never included in text or
              HTML reports.
            </small>
          </span>
        </label>
        <div className="export-options">
          {[
            [
              "zip",
              "Review package ZIP",
              "Project data, video metadata and issue notes",
            ],
            [
              "html",
              "Standalone HTML",
              "Readable report that opens in any browser",
            ],
            ["md", "Markdown", "Portable text with headings"],
            ["txt", "Plain text", "For email and production chat"],
            ["json", "JSON", "Structured interchange format"],
          ].map(([key, title, desc]) => (
            <button
              key={key}
              onClick={() =>
                onExport(key, scope, key === "zip" && includeSource)
              }
            >
              <FileArchive size={18} />
              <span>
                <b>{title}</b>
                <small>{desc}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function NameDialog({
  type,
  mode,
  value,
  onChange,
  onClose,
  onCreate,
}: {
  type: "project" | "episode";
  mode: "create" | "rename";
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="help-dialog name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-title"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">
              {mode === "rename" ? "RENAME" : "NEW"} {type.toUpperCase()}
            </p>
            <h2 id="name-title">
              {mode === "rename" ? "Rename this" : "Name this"} {type}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </header>
        <label className="field full name-field">
          <span>{type === "project" ? "Project name" : "Episode name"}</span>
          <input
            autoFocus
            required
            value={value}
            maxLength={120}
            placeholder={
              type === "project"
                ? "e.g. Northstar — Season 1"
                : "e.g. Episode 01"
            }
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <footer className="modal-foot">
          <span />
          <div>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit">
              <Plus size={15} />
              {mode === "rename" ? "Save name" : `Create ${type}`}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="help-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">CONFIRM ACTION</p>
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <X />
          </button>
        </header>
        <p className="muted">{message}</p>
        <footer className="modal-foot">
          <span />
          <div>
            <button className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button className="danger-button" onClick={onConfirm}>
              <Trash2 size={15} />
              Delete issue
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function SettingsDialog({
  reviewer,
  interval,
  onSave,
  onClose,
}: {
  reviewer: string;
  interval: number;
  onSave: (name: string, seconds: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(reviewer);
  const [seconds, setSeconds] = useState(interval);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="help-dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim(), seconds);
        }}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">LOCAL PREFERENCES</p>
            <h2 id="settings-title">Review settings</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </header>
        <div className="settings-fields">
          <label className="field full">
            <span>Reviewer name or initials</span>
            <input
              maxLength={80}
              value={name}
              placeholder="Optional"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field full">
            <span>Arrow-key seek interval</span>
            <select
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            >
              {[1, 2, 5, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="modal-foot">
          <span />
          <div>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit">
              <Check size={15} />
              Save settings
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
