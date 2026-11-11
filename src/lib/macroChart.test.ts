import { describe, expect, it } from 'vitest';
import { macroShares, ringSegments, segmentPath } from './macroChart';

describe('macroShares', () => {
  it('splits calories 4, 9 and 4 per gram', () => {
    // 25 g protein = 100 kcal, 20 g fat = 180, 30 g carbs = 120.
    const shares = macroShares({ protein: 25, fat: 20, carbs: 30 });
    expect(shares.map((s) => s.key)).toEqual(['protein', 'fat', 'carbs']);
    expect(shares.map((s) => s.grams)).toEqual([25, 20, 30]);
    expect(shares.map((s) => s.share)).toEqual([0.25, 0.45, 0.3]);
  });

  it('is all zero without macros', () => {
    expect(macroShares({ protein: 0, fat: 0, carbs: 0 }).every((s) => s.share === 0)).toBe(true);
  });
});

describe('ringSegments', () => {
  it('goes clockwise from the top with gaps between segments', () => {
    const segments = ringSegments(macroShares({ protein: 25, fat: 20, carbs: 30 }), 4).map((s) => ({
      ...s,
      start: Math.round(s.start * 1000) / 1000,
      end: Math.round(s.end * 1000) / 1000,
    }));
    expect(segments).toEqual([
      { key: 'protein', start: 2, end: 88 },
      { key: 'fat', start: 92, end: 250 },
      { key: 'carbs', start: 254, end: 358 },
    ]);
  });

  it('is one full ring for a single macro, and leaves out empty ones', () => {
    expect(ringSegments(macroShares({ protein: 0, fat: 10, carbs: 0 }))).toEqual([
      { key: 'fat', start: 0, end: 360 },
    ]);
  });
});

describe('segmentPath', () => {
  it('starts at the top of the outer edge and closes on the inner edge', () => {
    const path = segmentPath(60, 60, 50, 40, 0, 90);
    expect(path.startsWith('M60.00 10.00')).toBe(true);
    expect(path).toContain('L110.00 60.00');
    expect(path).toContain('L100.00 60.00');
    expect(path.endsWith('L60.00 20.00Z')).toBe(true);
    expect(segmentPath(60, 60, 50, 40, 90, 90)).toBe('');
  });
});
