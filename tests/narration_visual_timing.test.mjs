import assert from "node:assert/strict";

import {
  allocateWeightedFrameWindows,
  assertContiguousFrameWindows,
} from "../remotion-editor/align/narration-visual-timing.mjs";

const pages = [
  { id: "scene_01", timingWeight: 1 },
  { id: "scene_02", timingWeight: 2 },
  { id: "scene_03", timingWeight: 1 },
];
const windows = allocateWeightedFrameWindows(0, 101, pages);
assert.equal(windows.length, 3);
assert.equal(windows.reduce((sum, window) => sum + window.frames, 0), 101);
assert.equal(assertContiguousFrameWindows(windows, 0, 101), true);
assert.ok(windows[1].frames > windows[0].frames, "el peso doble debe recibir mas frames");

const repeated = allocateWeightedFrameWindows(0, 101, pages);
assert.deepEqual(repeated, windows, "la asignacion debe ser determinista");

assert.throws(() => allocateWeightedFrameWindows(0, 2, pages), /2 frames for 3 pages/);
assert.throws(() => allocateWeightedFrameWindows(0, 10, [{ id: "bad", timingWeight: 0 }]), /invalid timingWeight/);

console.log("OK: narration/visual timing usa frames enteros, positivos, contiguos y deterministas");
