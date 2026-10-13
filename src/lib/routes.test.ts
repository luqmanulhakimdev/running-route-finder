import { describe, expect, it } from "vitest";
import {
  deduplicateRoutes,
  elevationTotals,
  geometryDistance,
  haversine,
  isWithinTolerance,
  validGeometry,
  type Position,
} from "./routes";

const a: Position = [112.75, -7.25];
const b: Position = [112.76, -7.25];
const c: Position = [112.76, -7.26];

describe("haversine", () => {
  it("returns zero for identical coordinates", () => {
    expect(haversine(a, a)).toBe(0);
  });

  it("calculates haversine distance in meters accurately", () => {
    const dist = haversine(a, b);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1200);
  });

  it("calculates distance crossing the equator", () => {
    const p1: Position = [0, -1];
    const p2: Position = [0, 1];
    const dist = haversine(p1, p2);
    expect(dist).toBeGreaterThan(220000);
    expect(dist).toBeLessThan(225000);
  });

  it("calculates distance crossing the prime meridian", () => {
    const p1: Position = [-1, 0];
    const p2: Position = [1, 0];
    const dist = haversine(p1, p2);
    expect(dist).toBeGreaterThan(220000);
    expect(dist).toBeLessThan(225000);
  });
});

describe("geometryDistance", () => {
  it("returns zero for an empty line", () => {
    expect(geometryDistance([])).toBe(0);
  });

  it("returns zero distance for a single point", () => {
    expect(geometryDistance([a])).toBe(0);
  });

  it("calculates distance for a two-point segment", () => {
    expect(geometryDistance([a, b])).toBe(haversine(a, b));
  });

  it("accumulates distances for multi-segment polylines", () => {
    const total = geometryDistance([a, b, c]);
    expect(total).toBeCloseTo(haversine(a, b) + haversine(b, c), 5);
  });
});

describe("elevationTotals", () => {
  it("represents empty values as unknown", () => {
    expect(elevationTotals([])).toEqual({ ascent: null, descent: null });
  });

  it("represents single-point elevation as unknown", () => {
    expect(elevationTotals([100])).toEqual({ ascent: null, descent: null });
  });

  it("represents all-null elevation as unknown", () => {
    expect(elevationTotals([null, null, null])).toEqual({
      ascent: null,
      descent: null,
    });
  });

  it("returns zero ascent and descent for completely flat terrain", () => {
    expect(elevationTotals([50, 50, 50])).toEqual({ ascent: 0, descent: 0 });
  });

  it("calculates purely ascending elevation", () => {
    expect(elevationTotals([10, 25, 40])).toEqual({ ascent: 30, descent: 0 });
  });

  it("calculates purely descending elevation", () => {
    expect(elevationTotals([40, 25, 10])).toEqual({ ascent: 0, descent: 30 });
  });

  it("calculates mixed elevation profile correctly", () => {
    expect(elevationTotals([10, 25, 15, 30])).toEqual({
      ascent: 30,
      descent: 10,
    });
  });

  it("sums ascent and descent while skipping missing/null samples", () => {
    expect(elevationTotals([20, 28, 24, null, 40])).toEqual({
      ascent: 8,
      descent: 4,
    });
    expect(elevationTotals([null, 10, 25, null, 30, 20, null])).toEqual({
      ascent: 15,
      descent: 10,
    });
  });
});

describe("isWithinTolerance", () => {
  it("accepts exact match", () => {
    expect(isWithinTolerance(5000, 5000, 5)).toBe(true);
  });

  it("accepts lower and upper boundary values", () => {
    // 5000 with 5% tolerance: [4750, 5250]
    expect(isWithinTolerance(4750, 5000, 5)).toBe(true);
    expect(isWithinTolerance(5250, 5000, 5)).toBe(true);
  });

  it("rejects values outside tolerance range", () => {
    expect(isWithinTolerance(4749.9, 5000, 5)).toBe(false);
    expect(isWithinTolerance(5250.1, 5000, 5)).toBe(false);
  });

  it("works with various tolerance percentages", () => {
    expect(isWithinTolerance(990, 1000, 1)).toBe(true);
    expect(isWithinTolerance(989, 1000, 1)).toBe(false);
    expect(isWithinTolerance(12000, 10000, 20)).toBe(true);
    expect(isWithinTolerance(12001, 10000, 20)).toBe(false);
  });
});

describe("validGeometry", () => {
  it("accepts valid two-point line", () => {
    expect(validGeometry([a, b])).toBe(true);
  });

  it("accepts valid multi-point line", () => {
    expect(validGeometry([a, b, c])).toBe(true);
  });

  it("rejects line with fewer than 2 points", () => {
    expect(validGeometry([])).toBe(false);
    expect(validGeometry([a])).toBe(false);
  });

  it("rejects identical coordinates with zero length distance", () => {
    expect(validGeometry([a, a])).toBe(false);
  });

  it("rejects coordinates with latitude out of bounds [-90, 90]", () => {
    expect(validGeometry([[112.75, -91], b])).toBe(false);
    expect(validGeometry([[112.75, 95], b])).toBe(false);
  });

  it("rejects coordinates with longitude out of bounds [-180, 180]", () => {
    expect(validGeometry([[185, -7.25], b])).toBe(false);
    expect(validGeometry([[-185, -7.25], b])).toBe(false);
  });

  it("rejects non-finite values (NaN, Infinity)", () => {
    expect(validGeometry([[NaN, -7.25], b])).toBe(false);
    expect(validGeometry([[112.75, Infinity], b])).toBe(false);
  });

  it("rejects points with invalid tuple length", () => {
    expect(validGeometry([[112.75] as any, b])).toBe(false);
    expect(validGeometry([[112.75, -7.25, 10] as any, b])).toBe(false);
  });
});

describe("deduplicateRoutes", () => {
  it("handles empty list", () => {
    expect(deduplicateRoutes([])).toEqual([]);
  });

  it("keeps single route", () => {
    const single = [{ geometry: [a, b], distanceMeters: 1100 }];
    expect(deduplicateRoutes(single)).toEqual(single);
  });

  it("removes duplicate route with similar distance and geometry", () => {
    const routes = [
      { geometry: [a, b], distanceMeters: 1100 },
      { geometry: [a, b], distanceMeters: 1120 }, // diff < 80, start < 15, same path
    ];
    expect(deduplicateRoutes(routes)).toHaveLength(1);
  });

  it("preserves candidate when distance difference is >= 80m", () => {
    const routes = [
      { geometry: [a, b], distanceMeters: 1100 },
      { geometry: [a, b], distanceMeters: 1190 }, // diff >= 80
    ];
    expect(deduplicateRoutes(routes)).toHaveLength(2);
  });

  it("preserves candidate when start point difference is >= 15m", () => {
    const differentStart: Position = [112.7505, -7.2505];
    const routes = [
      { geometry: [a, b], distanceMeters: 1100 },
      { geometry: [differentStart, b], distanceMeters: 1100 },
    ];
    expect(deduplicateRoutes(routes)).toHaveLength(2);
  });

  it("preserves candidate when geometry path diverges (> 65m difference)", () => {
    const detourPoint: Position = [112.755, -7.28];
    const routes = [
      { geometry: [a, b], distanceMeters: 2500 },
      { geometry: [a, detourPoint, b], distanceMeters: 2520 },
    ];
    expect(deduplicateRoutes(routes)).toHaveLength(2);
  });
});
