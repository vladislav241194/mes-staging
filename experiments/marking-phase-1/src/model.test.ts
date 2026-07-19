import { describe, expect, it } from "vitest";
import { createKits, findCode, opaqueCode, taskStats } from "./model";
import { createInitialState } from "./testData";
import type { MarkingTask } from "./types";

describe("marking phase 1 domain model", () => {
  it("creates one opaque master and N unique individual codes per kit", () => {
    const state = createInitialState();
    const task: MarkingTask = { ...state.tasks[1], kits: [] };
    const kits = createKits(task, 3, 20, false);
    const all = kits.flatMap((kit) => [kit.masterCode, ...kit.individualCodes]);
    expect(kits).toHaveLength(3);
    expect(kits[0].individualCodes).toHaveLength(20);
    expect(new Set(all).size).toBe(63);
    expect(all.every((code) => /^[A-Z0-9]{12}$/.test(code))).toBe(true);
  });

  it("calculates high-volume totals without rendering a flat code list", () => {
    const state = createInitialState();
    const task: MarkingTask = { ...state.tasks[1], kits: [] };
    task.kits = createKits(task, 1200, 20, false);
    expect(taskStats(task)).toMatchObject({ masterCodes: 1200, individualCodes: 24000, totalLabels: 25200 });
  });

  it("finds master and individual codes in local test state", () => {
    const state = createInitialState();
    const kit = state.tasks[0].kits[0];
    expect(findCode(state.tasks, kit.masterCode)?.type).toBe("master");
    expect(findCode(state.tasks, kit.individualCodes[4])?.type).toBe("individual");
    expect(findCode(state.tasks, "NOT-EXISTS")).toBeNull();
  });

  it("keeps generated codes deterministic and independent of product data", () => {
    expect(opaqueCode("MKG-1", 1, 0)).toBe(opaqueCode("MKG-1", 1, 0));
    expect(opaqueCode("MKG-1", 1, 0)).not.toContain("MKG");
  });
});
