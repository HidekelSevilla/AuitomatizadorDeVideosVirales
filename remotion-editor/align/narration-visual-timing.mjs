// Deterministic integer-frame allocator for Manhwa V7's decoupled narration and
// visual-page tracks. Weights are normalized inside one narration unit only.

export function allocateWeightedFrameWindows(startFrame, endFrame, weightedPages) {
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || endFrame <= startFrame) {
    throw new Error(`invalid narration frame interval [${startFrame}, ${endFrame})`);
  }
  if (!Array.isArray(weightedPages) || weightedPages.length === 0) {
    throw new Error("a narration unit must own at least one visual page");
  }
  const totalFrames = endFrame - startFrame;
  if (totalFrames < weightedPages.length) {
    throw new Error(`narration interval has ${totalFrames} frames for ${weightedPages.length} pages`);
  }
  const weights = weightedPages.map((page, index) => {
    const value = Number(page?.timingWeight);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`page ${page?.id || index} has invalid timingWeight ${page?.timingWeight}`);
    }
    return value;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const remaining = totalFrames - weightedPages.length;
  const quotas = weights.map((weight) => (remaining * weight) / weightTotal);
  const extras = quotas.map(Math.floor);
  let residue = remaining - extras.reduce((sum, value) => sum + value, 0);
  const residueOrder = quotas
    .map((quota, index) => ({ index, fraction: quota - Math.floor(quota) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < residue; index++) extras[residueOrder[index].index]++;

  let cursor = startFrame;
  return weightedPages.map((page, index) => {
    const frames = 1 + extras[index];
    const start = cursor;
    cursor += frames;
    const end = index === weightedPages.length - 1 ? endFrame : cursor;
    return { id: page.id, startFrame: start, endFrame: end, frames: end - start };
  });
}

export function assertContiguousFrameWindows(windows, expectedStart, expectedEnd) {
  if (!Array.isArray(windows) || windows.length === 0) throw new Error("windows are required");
  if (windows[0].startFrame !== expectedStart) throw new Error("first window does not start at narration boundary");
  for (let index = 0; index < windows.length; index++) {
    const current = windows[index];
    if (!Number.isInteger(current.startFrame) || !Number.isInteger(current.endFrame)
        || current.endFrame <= current.startFrame) throw new Error(`window ${index} is not positive`);
    if (index > 0 && current.startFrame !== windows[index - 1].endFrame) {
      throw new Error(`window ${index} is not contiguous`);
    }
  }
  if (windows.at(-1).endFrame !== expectedEnd) throw new Error("last window does not end at narration boundary");
  return true;
}
