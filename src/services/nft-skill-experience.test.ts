import {
  levelToXp,
  xpToLevel,
  getXpBounds,
  computeProgress,
} from '../utils/xp-level';

describe('nft-skill-experience', () => {
  describe('levelToXp', () => {
    it('returns 0 XP for level 1', () => {
      expect(levelToXp(1)).toBe(0);
    });
    it('clamps level to 1..99', () => {
      expect(levelToXp(0)).toBe(levelToXp(1));
      expect(levelToXp(100)).toBe(levelToXp(99));
    });
  });

  describe('xpToLevel', () => {
    it('returns 1 for zero or negative XP', () => {
      expect(xpToLevel(0)).toBe(1);
      expect(xpToLevel(-1)).toBe(1);
    });
    it('returns 1 for small positive XP', () => {
      expect(xpToLevel(1)).toBe(1);
    });
    it('round-trips with levelToXp for levels 1, 2, 50, 99', () => {
      for (const level of [1, 2, 50, 99]) {
        const xp = levelToXp(level);
        expect(xpToLevel(xp)).toBe(level);
      }
    });
  });

  describe('getXpBounds', () => {
    it('returns current and next XP for a level', () => {
      const b = getXpBounds(5);
      expect(b.xpForCurrentLevel).toBeLessThanOrEqual(b.xpForNextLevel);
      expect(b.xpForCurrentLevel).toBe(levelToXp(5));
      expect(b.xpForNextLevel).toBe(levelToXp(6));
    });
    it('for level 99 next equals current', () => {
      const b = getXpBounds(99);
      expect(b.xpForNextLevel).toBe(b.xpForCurrentLevel);
    });
  });

  describe('computeProgress', () => {
    it('returns level 1 and 0% for 0 XP', () => {
      const p = computeProgress(0);
      expect(p.level).toBe(1);
      expect(p.progressPct).toBe(0);
    });
    it('progressPct is between 0 and 100', () => {
      const p = computeProgress(levelToXp(50) + 1000);
      expect(p.progressPct).toBeGreaterThanOrEqual(0);
      expect(p.progressPct).toBeLessThanOrEqual(100);
    });
  });
});
