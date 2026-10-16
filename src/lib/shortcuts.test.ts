import { describe, expect, it } from "vitest";
import {
  normalizeShortcut,
  shortcutLabel,
  validateShortcuts,
} from "./shortcuts";

describe("keyboard shortcut preferences", () => {
  it("normalizes letters without changing named keys", () => {
    expect(normalizeShortcut(" M ")).toBe("m");
    expect(normalizeShortcut("F8")).toBe("F8");
  });
  it("rejects collisions and keys reserved for player navigation", () => {
    expect(validateShortcuts({ capture: "m", bookmark: "M" })).toContain(
      "different",
    );
    expect(validateShortcuts({ capture: "Escape", bookmark: "b" })).toContain(
      "reserved",
    );
  });
  it("shows printable shortcut labels", () => {
    expect(shortcutLabel("m")).toBe("M");
    expect(shortcutLabel("F8")).toBe("F8");
  });
});
