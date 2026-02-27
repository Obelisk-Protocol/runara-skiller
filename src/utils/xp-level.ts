/**
 * Pure XP/level math (OSRS-style). No DB, Solana, or config dependencies.
 * Used by nft-skill-experience and by tests without loading the full stack.
 */

const MAX_LEVEL = 99;

function computeOsrsThresholds(maxLevel: number): number[] {
  const thresholds: number[] = new Array(maxLevel + 1).fill(0);
  let points = 0;
  for (let level = 1; level <= maxLevel; level++) {
    points += Math.floor(level + 300 * Math.pow(2, level / 7));
    thresholds[level] = Math.floor(points / 4);
  }
  thresholds[1] = 0;
  return thresholds;
}

const XP_THRESHOLDS = computeOsrsThresholds(MAX_LEVEL);

export function levelToXp(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return XP_THRESHOLDS[l];
}

export function xpToLevel(experience: number): number {
  if (!Number.isFinite(experience) || experience <= 0) return 1;
  let low = 1;
  let high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (XP_THRESHOLDS[mid] <= experience) low = mid;
    else high = mid - 1;
  }
  return Math.max(1, Math.min(MAX_LEVEL, low));
}

export function getXpBounds(level: number): { xpForCurrentLevel: number; xpForNextLevel: number } {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const current = XP_THRESHOLDS[l];
  const next = l >= MAX_LEVEL ? XP_THRESHOLDS[MAX_LEVEL] : XP_THRESHOLDS[l + 1];
  return { xpForCurrentLevel: current, xpForNextLevel: next };
}

export type XpProgress = {
  level: number;
  experience: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progressPct: number;
};

export function computeProgress(experience: number): XpProgress {
  const level = xpToLevel(experience);
  const { xpForCurrentLevel, xpForNextLevel } = getXpBounds(level);
  const span = Math.max(1, xpForNextLevel - xpForCurrentLevel);
  const clamped = Math.max(xpForCurrentLevel, Math.min(experience, xpForNextLevel));
  const pct = level >= MAX_LEVEL ? 100 : ((clamped - xpForCurrentLevel) / span) * 100;
  return {
    level,
    experience,
    xpForCurrentLevel,
    xpForNextLevel,
    progressPct: Math.max(0, Math.min(100, pct)),
  };
}
