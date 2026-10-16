import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Plus,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  type Project,
  type Severity,
  type Status,
} from "../lib/model";
import {
  parseElapsedTimestamp,
  parseQcNotes,
  type ParsedQcEpisode,
  type ParsedQcNotes,
} from "../lib/qcNotes";

const severityOptions: Severity[] = [
  "Unassigned",
  "Critical",
  "Major",
  "Minor",
  "Cosmetic",
];
const statusOptions: Status[] = [
  "Open",
  "In progress",
  "Resolved",
  "Needs verification",
];

export function QcNotesStudio({
  projects,
  initialProjectId,
  onClose,
  onCreateProject,
  onImport,
}: {
  projects: Project[];
  initialProjectId?: string;
  onClose: () => void;
  onCreateProject: (name: string) => string;
  onImport: (
    projectId: string,
    episodes: ParsedQcEpisode[],
    sourceText: string,
  ) => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const [newName, setNewName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [parsed, setParsed] = useState<ParsedQcNotes | null>(null);
  const [step, setStep] = useState<"paste" | "review" | "preview">("paste");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [issueState, setIssueState] = useState<
    Record<string, { timestamp: string; severity: Severity; status: Status }>
  >({});

  const selectedProject = projects.find((project) => project.id === projectId);
  const issueCount =
    parsed?.episodes.reduce(
      (total, episode) => total + episode.issues.length,
      0,
    ) || 0;
  const observationCount =
    parsed?.episodes.reduce(
      (total, episode) => total + episode.observations.length,
      0,
    ) || 0;
  const invalidEditedTimestamps = useMemo(() => {
    if (!parsed) return [];
    return parsed.episodes.flatMap((episode) =>
      episode.issues.flatMap((issue) => {
        const value = issueState[issue.id]?.timestamp || issue.sourceTimestamp;
        return parseElapsedTimestamp(value).ok ? [] : [issue.id];
      }),
    );
  }, [issueState, parsed]);

  function updateEpisode(
    episodeId: string,
    update: (episode: ParsedQcEpisode) => ParsedQcEpisode,
  ) {
    setParsed(
      (current) =>
        current && {
          ...current,
          episodes: current.episodes.map((episode) =>
            episode.id === episodeId ? update(episode) : episode,
          ),
        },
    );
  }

  function parseSource() {
    if (!sourceText.trim()) {
      setError("Paste the QC notes before parsing.");
      return;
    }
    const next = parseQcNotes(sourceText);
    setParsed(next);
    setActiveTab(next.episodes[0]?.id || "");
    setIssueState({});
    setError("");
    setStep("review");
  }

  function createProject() {
    const name = newName.trim();
    if (!name) return setError("Enter a project name.");
    const id = onCreateProject(name);
    setProjectId(id);
    setCreatingProject(false);
    setNewName("");
    setError("");
  }

  function setTimestamp(issueId: string, value: string) {
    setIssueState((state) => ({
      ...state,
      [issueId]: {
        timestamp: value,
        severity: state[issueId]?.severity || "Unassigned",
        status: state[issueId]?.status || "Open",
      },
    }));
  }

  function importNotes() {
    if (!projectId) {
      setError("Choose a destination project or create one.");
      setStep("paste");
      return;
    }
    if (!parsed) return;
    if (invalidEditedTimestamps.length) {
      setError("Fix the invalid timestamps before importing.");
      setStep("review");
      return;
    }
    const updatedEpisodes = parsed.episodes.map((episode) => ({
      ...episode,
      issues: episode.issues.map((issue) => {
        const edited = issueState[issue.id];
        const timestamp = edited?.timestamp || issue.sourceTimestamp;
        const time = parseElapsedTimestamp(timestamp);
        return {
          ...issue,
          sourceTimestamp: issue.sourceTimestamp,
          start: time.ok ? time.seconds : issue.start,
          category: issue.category,
          severity: edited?.severity || "Unassigned",
          status: edited?.status || "Open",
        };
      }),
    }));
    onImport(projectId, updatedEpisodes, parsed.sourceText);
  }

  const shownEpisode = parsed?.episodes.find(
    (episode) => episode.id === activeTab,
  );

  return (
    <div
      className="modal-backdrop qc-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="qc-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-studio-title"
      >
        <header className="modal-head">
          <div className="qc-title">
            <span className="qc-icon">
              <FileText size={18} />
            </span>
            <div>
              <p className="eyebrow">LOCAL NOTE IMPORT</p>
              <h2 id="qc-studio-title">QC Notes Studio</h2>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close QC Notes Studio"
          >
            <X />
          </button>
        </header>
        <div className="qc-steps" aria-label="Import steps">
          {["paste", "review", "preview"].map((name, index) => (
            <span key={name} className={step === name ? "active" : ""}>
              <i>{index + 1}</i>
              {["Paste notes", "Review records", "Preview report"][index]}
            </span>
          ))}
        </div>

        {step === "paste" && (
          <div className="qc-paste-step">
            <label className="field">
              <span>Destination project</span>
              <select
                aria-label="Destination project"
                value={creatingProject ? "__create" : projectId}
                onChange={(event) => {
                  if (event.target.value === "__create")
                    setCreatingProject(true);
                  else {
                    setProjectId(event.target.value);
                    setCreatingProject(false);
                  }
                }}
              >
                <option value="">Choose a project</option>
                {projects
                  .filter((project) => !project.archived)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                <option value="__create">＋ Create a project</option>
              </select>
            </label>
            {creatingProject && (
              <div className="qc-create-row">
                <input
                  aria-label="New project name"
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Project name"
                  onKeyDown={(event) =>
                    event.key === "Enter" && createProject()
                  }
                />
                <button className="secondary" onClick={createProject}>
                  <Plus size={15} /> Create
                </button>
              </div>
            )}
            <label className="field">
              <span>Paste QC notes</span>
              <textarea
                aria-label="Paste QC notes"
                className="qc-source"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder={
                  "EPISODE 1\n\nThe lead character should wear the blue jacket throughout this episode.\n\n0:12 - Character position changes unexpectedly\n0:26 - Hand placement obscures the prop"
                }
              />
            </label>
            <p className="muted qc-private">
              Notes are parsed locally in this browser. Wrapped lines stay with
              the note; a blank line starts a separate observation. Video can be
              linked after import.
            </p>
            {error && (
              <p role="alert" className="qc-error">
                {error}
              </p>
            )}
            <footer className="qc-footer">
              <span />{" "}
              <button className="primary" onClick={parseSource}>
                Parse notes <ArrowRight size={15} />
              </button>
            </footer>
          </div>
        )}

        {step === "review" && parsed && (
          <div className="qc-review-step">
            <div className="qc-summary">
              <b>{parsed.episodes.length} episodes</b>
              <span>{issueCount} timestamped notes</span>
              <span>{observationCount} episode observations</span>
            </div>
            {parsed.warnings.length > 0 && (
              <div className="qc-warnings" role="status">
                <AlertTriangle size={16} />
                <div>
                  <b>
                    {parsed.warnings.length} parsing warning
                    {parsed.warnings.length === 1 ? "" : "s"}
                  </b>
                  {parsed.warnings.map((warning) => (
                    <p key={warning.id}>
                      Line {warning.line}: {warning.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div
              className="qc-episode-tabs"
              role="tablist"
              aria-label="Parsed episodes"
            >
              {parsed.episodes.map((episode) => (
                <button
                  key={episode.id}
                  role="tab"
                  aria-selected={activeTab === episode.id}
                  className={activeTab === episode.id ? "active" : ""}
                  onClick={() => setActiveTab(episode.id)}
                >
                  {episode.name}
                </button>
              ))}
            </div>
            {shownEpisode && (
              <div className="qc-record-list">
                <label className="field">
                  <span>Episode name</span>
                  <input
                    value={shownEpisode.name}
                    onChange={(event) =>
                      updateEpisode(shownEpisode.id, (episode) => ({
                        ...episode,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                {shownEpisode.observations.map((observation) => (
                  <article className="qc-observation" key={observation.id}>
                    <span>Episode-wide observation · original retained</span>
                    <textarea
                      aria-label={`Episode observation ${observation.id}`}
                      value={observation.cleanedText}
                      onChange={(event) =>
                        updateEpisode(shownEpisode.id, (episode) => ({
                          ...episode,
                          observations: episode.observations.map((item) =>
                            item.id === observation.id
                              ? { ...item, cleanedText: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <small>Source: {observation.sourceText}</small>
                  </article>
                ))}
                {shownEpisode.issues.map((issue) => {
                  const timestamp =
                    issueState[issue.id]?.timestamp || issue.sourceTimestamp;
                  const valid = parseElapsedTimestamp(timestamp);
                  return (
                    <article className="qc-issue-edit" key={issue.id}>
                      <div className="qc-issue-fields">
                        <label className="field">
                          <span>Original timecode</span>
                          <input
                            aria-label={`Timestamp ${issue.id}`}
                            value={timestamp}
                            onChange={(event) =>
                              setTimestamp(issue.id, event.target.value)
                            }
                          />
                          {!valid.ok && (
                            <small className="qc-error">{valid.reason}</small>
                          )}
                        </label>
                        <label className="field">
                          <span>Category suggestion</span>
                          <select
                            value={issue.category}
                            onChange={(event) =>
                              updateEpisode(shownEpisode.id, (episode) => ({
                                ...episode,
                                issues: episode.issues.map((item) =>
                                  item.id === issue.id
                                    ? {
                                        ...item,
                                        category: event.target
                                          .value as typeof issue.category,
                                      }
                                    : item,
                                ),
                              }))
                            }
                          >
                            {CATEGORIES.map((category) => (
                              <option key={category}>{category}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Severity</span>
                          <select
                            value={
                              issueState[issue.id]?.severity || "Unassigned"
                            }
                            onChange={(event) =>
                              setIssueState((state) => ({
                                ...state,
                                [issue.id]: {
                                  timestamp,
                                  severity: event.target.value as Severity,
                                  status: state[issue.id]?.status || "Open",
                                },
                              }))
                            }
                          >
                            {severityOptions.map((severity) => (
                              <option key={severity}>{severity}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Status</span>
                          <select
                            value={issueState[issue.id]?.status || "Open"}
                            onChange={(event) =>
                              setIssueState((state) => ({
                                ...state,
                                [issue.id]: {
                                  timestamp,
                                  severity:
                                    state[issue.id]?.severity || "Unassigned",
                                  status: event.target.value as Status,
                                },
                              }))
                            }
                          >
                            {statusOptions.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="field">
                        <span>
                          Cleaned note{" "}
                          <small> · original text retained in source</small>
                        </span>
                        <textarea
                          value={issue.cleanedText}
                          onChange={(event) =>
                            updateEpisode(shownEpisode.id, (episode) => ({
                              ...episode,
                              issues: episode.issues.map((item) =>
                                item.id === issue.id
                                  ? { ...item, cleanedText: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <small className="qc-original">
                        Original note: {issue.sourceText}
                      </small>
                    </article>
                  );
                })}
                {shownEpisode.issues.length === 0 &&
                  shownEpisode.observations.length === 0 && (
                    <p className="muted">No notes found in this episode.</p>
                  )}
              </div>
            )}
            {error && (
              <p role="alert" className="qc-error">
                {error}
              </p>
            )}
            <footer className="qc-footer">
              <button className="secondary" onClick={() => setStep("paste")}>
                <ArrowLeft size={15} /> Edit source text
              </button>
              <button className="secondary" onClick={() => setStep("preview")}>
                Preview report <ArrowRight size={15} />
              </button>
            </footer>
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="qc-preview-step">
            <div className="qc-preview-meta">
              <span>
                Preview for <b>{selectedProject?.name || "new project"}</b>
              </span>
              <span>
                {issueCount} issues · {observationCount} observations
              </span>
            </div>
            <div className="qc-report-preview">
              {parsed.episodes.map((episode) => (
                <section key={episode.id}>
                  <h3>{episode.name}</h3>
                  {episode.observations.map((observation) => (
                    <p className="qc-preview-observation" key={observation.id}>
                      <b>Episode-wide observation</b>
                      <br />
                      {observation.cleanedText}
                    </p>
                  ))}
                  {episode.issues.map((issue) => {
                    const timestamp =
                      issueState[issue.id]?.timestamp || issue.sourceTimestamp;
                    const time = parseElapsedTimestamp(timestamp);
                    return (
                      <article key={issue.id}>
                        <small>
                          {timestamp}{" "}
                          {time.ok
                            ? `· ${time.seconds.toFixed(3).replace(/\.000$/, "")} sec`
                            : "· invalid timestamp"}{" "}
                          · {issue.category} ·{" "}
                          {issueState[issue.id]?.severity || "Unassigned"}
                        </small>
                        <p>{issue.cleanedText}</p>
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
            <footer className="qc-footer">
              <button className="secondary" onClick={() => setStep("review")}>
                <ArrowLeft size={15} /> Back to records
              </button>
              <button
                className="primary"
                disabled={
                  !selectedProject || invalidEditedTimestamps.length > 0
                }
                onClick={importNotes}
              >
                <Check size={15} /> Import {issueCount + observationCount} notes
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
