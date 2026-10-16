export const CATEGORIES = [
  "Continuity",
  "Character identity or appearance",
  "Character positioning",
  "Dialogue-to-visual mismatch",
  "Lip-sync",
  "Hand or body positioning",
  "Props and object continuity",
  "Wardrobe",
  "Camera axis / 180-degree rule",
  "Eyeline",
  "Motion or animation",
  "Repeated shots",
  "Composition or framing",
  "Text, graphics, or HUD",
  "Audio or dialogue",
  "Transition or edit",
  "Technical defect",
  "Other",
] as const;
export type Severity =
  "Critical" | "Major" | "Minor" | "Cosmetic" | "Unassigned";
export type Status = "Open" | "In progress" | "Resolved" | "Needs verification";
export type Issue = {
  id: string;
  title: string;
  description: string;
  fix: string;
  category: string;
  severity: Severity;
  status: Status;
  scope: string;
  start: number;
  end?: number;
  versionId?: string;
  reviewer?: string;
  createdAt: string;
  updatedAt: string;
  screenshot?: string;
  annotatedScreenshot?: string;
  annotations?: Annotation[];
  sourceTimestamp?: string;
  sourceText?: string;
  cleanedText?: string;
  importBatchId?: string;
};
export type EpisodeObservation = {
  id: string;
  sourceText: string;
  cleanedText: string;
  importBatchId?: string;
};
export type NoteImportBatch = {
  id: string;
  sourceText: string;
  importedAt: string;
};
export type Annotation = {
  id: string;
  type: "arrow" | "rect" | "ellipse" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
};
export type Version = {
  id: string;
  label: string;
  filename: string;
  duration?: number;
  size: number;
  addedAt: string;
  fingerprint?: string;
};
export type Episode = {
  id: string;
  name: string;
  versions: Version[];
  activeVersionId?: string;
  issues: Issue[];
  observations?: EpisodeObservation[];
};
export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  episodes: Episode[];
  noteImports?: NoteImportBatch[];
};
export const uid = () => crypto.randomUUID();
export const timecode = (seconds: number) => {
  const s = Math.max(0, seconds || 0);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(Math.floor(s) % 60).padStart(2, "0")}`;
};
export const formatBytes = (n: number) =>
  n < 1024 * 1024
    ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
export function frameIndex(seconds: number, fps: number) {
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error("Frame rate must be positive");
  return Math.floor(seconds * fps + 1e-6);
}
