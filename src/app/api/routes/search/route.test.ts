import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/routes/search", () => {
  const originalEnv = process.env;
  const startLat = -7.2575;
  const startLon = 112.7521;
  const midLon = startLon + 0.0226646; // ~2500m east along latitude -7.2575

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Validation & Bad Requests", () => {
    it("returns 400 when request body is not valid JSON", async () => {
      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        body: "invalid-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Data pencarian tidak valid.");
    });

    it("returns 400 when required fields are missing", async () => {
      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          // startLongitude missing
          targetDistanceMeters: 5000,
          routeShape: "loop",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Data pencarian tidak valid.");
    });

    it("returns 400 when coordinates or distance exceed valid ranges", async () => {
      const invalidLatReq = new Request(
        "http://localhost:3000/api/routes/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startLatitude: 95, // out of range [-85, 85]
            startLongitude: startLon,
            targetDistanceMeters: 5000,
            routeShape: "loop",
          }),
        },
      );
      expect((await POST(invalidLatReq)).status).toBe(400);

      const invalidDistReq = new Request(
        "http://localhost:3000/api/routes/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startLatitude: startLat,
            startLongitude: startLon,
            targetDistanceMeters: 500, // < 1000
            routeShape: "loop",
          }),
        },
      );
      expect((await POST(invalidDistReq)).status).toBe(400);

      const invalidToleranceReq = new Request(
        "http://localhost:3000/api/routes/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startLatitude: startLat,
            startLongitude: startLon,
            targetDistanceMeters: 5000,
            distanceTolerancePercent: 25, // > 20
            routeShape: "loop",
          }),
        },
      );
      expect((await POST(invalidToleranceReq)).status).toBe(400);
    });

    it("returns 400 when point-to-point is requested without destination coordinates", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "point-to-point",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe(
        "Tentukan titik tujuan untuk rute titik ke titik.",
      );
    });
  });

  describe("API Key & Service Status", () => {
    it("returns 503 when OPENROUTESERVICE_API_KEY is not set", async () => {
      delete process.env.OPENROUTESERVICE_API_KEY;
      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain("OPENROUTESERVICE_API_KEY");
    });

    it("returns 429 when upstream rate limit is encountered", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toContain("Kuota atau akses routing sedang dibatasi");
    });

    it("returns 502 when upstream API key is invalid (401/403)", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "invalid-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toBe("Kunci openrouteservice tidak valid.");
    });
  });

  describe("Route Generation & Preferences", () => {
    it("generates loop route successfully with elevation data", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      const validLoopCoords = [
        [startLon, startLat, 10],
        [midLon, startLat, 25],
        [startLon, startLat, 10],
      ];

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: validLoopCoords },
            },
          ],
        }),
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
          elevationPreference: "flat",
          maximumResults: 1,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.searchId).toBeDefined();
      expect(data.routes).toHaveLength(1);
      const route = data.routes[0];
      expect(route.distanceMeters).toBeCloseTo(5000, -1);
      expect(route.ascentMeters).toBe(15);
      expect(route.descentMeters).toBe(15);
      expect(route.elevationSamples.length).toBeGreaterThan(0);
      expect(route.durationSeconds).toBeGreaterThan(0);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("generates out-and-back route successfully", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      const validOutAndBack = [
        [startLon, startLat, 15],
        [midLon, startLat, 30],
        [startLon, startLat, 15],
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: validOutAndBack },
            },
          ],
        }),
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "out-and-back",
          elevationPreference: "hilly",
          maximumResults: 1,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.routes).toHaveLength(1);
    });

    it("generates point-to-point route with destination coordinates", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      const destLon = startLon + 0.0226646 * 2; // ~5000m east
      const destLat = startLat;
      const validP2PCoords = [
        [startLon, startLat, 10],
        [destLon, destLat, 15],
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: validP2PCoords },
            },
          ],
        }),
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          destinationLatitude: destLat,
          destinationLongitude: destLon,
          targetDistanceMeters: 5000,
          routeShape: "point-to-point",
          elevationPreference: "rolling",
          maximumResults: 1,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.routes).toHaveLength(1);
    });

    it("handles elevation absence gracefully and sets warning", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      // Coordinates without elevation 3rd element
      const coordsNoElevation = [
        [startLon, startLat],
        [midLon, startLat],
        [startLon, startLat],
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: coordsNoElevation },
            },
          ],
        }),
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
          elevationPreference: "any",
          maximumResults: 1,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.routes[0].ascentMeters).toBeNull();
      expect(data.warnings.some((w: string) => w.includes("elevasi"))).toBe(
        true,
      );
    });

    it("rejects loop route when end point does not close loop within 100m", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      const unclosedLoop = [
        [startLon, startLat],
        [midLon, startLat],
        [startLon + 0.01, startLat + 0.01], // > 1000m away from start
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: unclosedLoop },
            },
          ],
        }),
      } as Response);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.routes).toEqual([]);
      expect(data.error).toContain("Tidak ditemukan rute");
    });

    it("returns error message when upstream fetch repeatedly times out or fails", async () => {
      process.env.OPENROUTESERVICE_API_KEY = "test-key";
      const timeoutError = new Error("Timeout");
      timeoutError.name = "TimeoutError";

      vi.spyOn(globalThis, "fetch").mockRejectedValue(timeoutError);

      const req = new Request("http://localhost:3000/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: startLat,
          startLongitude: startLon,
          targetDistanceMeters: 5000,
          routeShape: "loop",
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(data.error).toContain("Permintaan routing melewati batas waktu");
    });
  });
});
