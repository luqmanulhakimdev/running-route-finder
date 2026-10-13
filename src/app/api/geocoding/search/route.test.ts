import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/geocoding/search", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty results when query parameter 'q' is missing", async () => {
    const req = new Request("http://localhost:3000/api/geocoding/search");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
  });

  it("returns empty results when query parameter 'q' has less than 3 characters", async () => {
    const req = new Request("http://localhost:3000/api/geocoding/search?q=ab");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ results: [] });

    const trimmedReq = new Request(
      "http://localhost:3000/api/geocoding/search?q=%20%20a%20%20",
    );
    const trimmedRes = await GET(trimmedReq);
    expect((await trimmedRes.json()).results).toEqual([]);
  });

  it("returns 503 when OPENROUTESERVICE_API_KEY is not configured", async () => {
    delete process.env.OPENROUTESERVICE_API_KEY;
    const req = new Request(
      "http://localhost:3000/api/geocoding/search?q=Surabaya",
    );
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("OPENROUTESERVICE_API_KEY");
  });

  it("returns mapped place results on successful upstream response", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    const mockUpstreamData = {
      features: [
        {
          properties: { label: "Surabaya, Jawa Timur, Indonesia" },
          geometry: { coordinates: [112.7521, -7.2575] },
        },
        {
          properties: { label: "Surabaya Gubeng" },
          geometry: { coordinates: [112.7516, -7.2654] },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockUpstreamData,
    } as Response);

    const req = new Request(
      "http://localhost:3000/api/geocoding/search?q=Surabaya",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.results).toEqual([
      {
        name: "Surabaya, Jawa Timur, Indonesia",
        longitude: 112.7521,
        latitude: -7.2575,
      },
      {
        name: "Surabaya Gubeng",
        longitude: 112.7516,
        latitude: -7.2654,
      },
    ]);
  });

  it("handles upstream response with empty or missing features", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const req = new Request(
      "http://localhost:3000/api/geocoding/search?q=LokasiTakDitemukan",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns 429 when upstream rate limit is hit", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    const req = new Request(
      "http://localhost:3000/api/geocoding/search?q=Surabaya",
    );
    const res = await GET(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Pencarian lokasi sedang tidak tersedia.");
  });

  it("returns 502 when upstream server returns an error status", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const req = new Request(
      "http://localhost:3000/api/geocoding/search?q=Surabaya",
    );
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Pencarian lokasi sedang tidak tersedia.");
  });

  it("returns 502 when fetch throws a network error", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network connection failed"),
    );

    const req = new Request(
      "http://localhost:3000/api/geocoding/search?q=Surabaya",
    );
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe(
      "Tidak dapat menghubungi layanan pencarian lokasi.",
    );
  });
});
