import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { loadProjects, saveProjects } from "./store";
import type { Project } from "./model";
const sample: Project = {
  id: "persist-check",
  name: "Local project",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  episodes: [],
};
describe("local project persistence", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("openreview-studio");
  });
  it("saves project metadata in IndexedDB and recovers it", async () => {
    await saveProjects([sample]);
    expect(await loadProjects()).toEqual([sample]);
  });
});
