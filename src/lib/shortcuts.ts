export type ShortcutMap = { capture: string; bookmark: string };

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  capture: "m",
  bookmark: "b",
};

export function normalizeShortcut(key: string): string {
  return key.trim().length === 1 ? key.trim().toLowerCase() : key.trim();
}

export function validateShortcuts(shortcuts: ShortcutMap): string | null {
  const capture = normalizeShortcut(shortcuts.capture);
  const bookmark = normalizeShortcut(shortcuts.bookmark);
  if (!capture || !bookmark) return "Assign a key to each action.";
  if (capture === bookmark) return "Each action needs a different shortcut.";
  if (
    ["escape", " ", "arrowleft", "arrowright"].includes(
      capture.toLowerCase(),
    ) ||
    ["escape", " ", "arrowleft", "arrowright"].includes(bookmark.toLowerCase())
  )
    return "That key is reserved for player navigation.";
  return null;
}

export function shortcutLabel(key: string): string {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}
