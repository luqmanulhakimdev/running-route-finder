import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deduplicateRoutes,
  elevationTotals,
  geometryDistance,
  haversine,
  isWithinTolerance,
  validGeometry,
  type Route,
  type Position,
} from "@/lib/routes";
const requestSchema = z.object({
  startLatitude: z.number().min(-85).max(85),
  startLongitude: z.number().min(-180).max(180),
  targetDistanceMeters: z.number().min(1000).max(50000),
  distanceTolerancePercent: z.number().min(1).max(20).default(5),
  routeShape: z.enum(["loop", "out-and-back", "point-to-point"]),
  elevationPreference: z
    .enum(["any", "flat", "rolling", "hilly"])
    .default("any"),
  maximumAscentMeters: z.number().min(0).optional(),
  paceSecondsPerKm: z.number().min(180).max(1200).default(360),
  maximumResults: z.number().min(1).max(3).default(3),
  destinationLatitude: z.number().min(-85).max(85).optional(),
  destinationLongitude: z.number().min(-180).max(180).optional(),
});
export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Data pencarian tidak valid.", details: parsed.error.flatten() },
      { status: 400 },
    );
  const input = parsed.data,
    key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key)
    return NextResponse.json(
      {
        error:
          "Kunci openrouteservice belum tersedia. Tambahkan OPENROUTESERVICE_API_KEY di .env.local untuk membuat rute nyata.",
      },
      { status: 503 },
    );
  if (
    input.routeShape === "point-to-point" &&
    (input.destinationLatitude === undefined ||
      input.destinationLongitude === undefined)
  )
    return NextResponse.json(
      { error: "Tentukan titik tujuan untuk rute titik ke titik." },
      { status: 400 },
    );
  const start: Position = [input.startLongitude, input.startLatitude],
    target = input.targetDistanceMeters;
  const lengths = [
    target,
    target * 0.97,
    target * 1.03,
    target * 0.94,
    target * 1.06,
  ];
  const names = [
    "Alternatif 1",
    "Alternatif 2",
    "Alternatif 3",
    "Alternatif 4",
    "Alternatif 5",
  ];
  const routes: Route[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < Math.min(5, input.maximumResults + 2); i++) {
    try {
      let endpoint =
        "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";
      let payload: any;
      if (input.routeShape === "loop") {
        payload = {
          coordinates: [start],
          elevation: true,
          options: {
            round_trip: {
              length: Math.round(lengths[i]),
              points: 5,
              seed: 197 + i * 53,
            },
          },
        };
      } else if (input.routeShape === "out-and-back") {
        const bearing = i * 0.72,
          delta = target / 2 / 111000;
        const turn: Position = [
          start[0] +
            (Math.cos(bearing) * delta) /
              Math.max(0.2, Math.cos((start[1] * Math.PI) / 180)),
          start[1] + Math.sin(bearing) * delta,
        ];
        payload = { coordinates: [start, turn, start], elevation: true };
      } else {
        endpoint =
          "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";
        payload = {
          coordinates: [
            start,
            [input.destinationLongitude!, input.destinationLatitude!],
          ],
          elevation: true,
        };
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) {
        if ([401, 403, 429].includes(response.status))
          return NextResponse.json(
            {
              error:
                response.status === 429 || response.status === 403
                  ? "Kuota atau akses routing sedang dibatasi. Coba kembali nanti atau periksa kunci API."
                  : "Kunci openrouteservice tidak valid.",
            },
            { status: response.status === 429 ? 429 : 502 },
          );
        warnings.push(
          `Layanan routing mengembalikan status ${response.status}.`,
        );
        continue;
      }
      const data = await response.json();
      const feature = data.features?.[0];
      if (!feature?.geometry?.coordinates) continue;
      const rawCoordinates = feature.geometry.coordinates as number[][];
      const geometry = rawCoordinates.map(
        ([lon, lat]) => [lon, lat] as Position,
      );
      if (!validGeometry(geometry)) continue;
      if (input.routeShape === "loop" || input.routeShape === "out-and-back") {
        if (
          geometry[0] &&
          geometry.at(-1) &&
          geometryDistance([geometry[0], geometry.at(-1)!]) > 100
        )
          continue;
      } else if (
        geometry.at(-1) &&
        geometryDistance([
          geometry.at(-1)!,
          [input.destinationLongitude!, input.destinationLatitude!],
        ]) > 100
      )
        continue;
      const distance = geometryDistance(geometry);
      if (!isWithinTolerance(distance, target, input.distanceTolerancePercent))
        continue;
      const duration = (distance / 1000) * input.paceSecondsPerKm;
      const rawElevations = rawCoordinates.map((point) =>
        point.length > 2 && Number.isFinite(point[2]) ? point[2] : null,
      );
      const totals = elevationTotals(rawElevations);
      const elevationSamples: {
        distanceMeters: number;
        elevationMeters: number | null;
      }[] = [];
      const sampleEvery = Math.max(1, Math.ceil(rawElevations.length / 80));
      let routeProgress = 0;
      for (
        let pointIndex = 0;
        pointIndex < rawElevations.length;
        pointIndex++
      ) {
        if (pointIndex > 0)
          routeProgress += haversine(
            geometry[pointIndex - 1],
            geometry[pointIndex],
          );
        if (
          pointIndex === 0 ||
          pointIndex === rawElevations.length - 1 ||
          pointIndex % sampleEvery === 0
        )
          elevationSamples.push({
            distanceMeters: routeProgress,
            elevationMeters: rawElevations[pointIndex],
          });
      }
      const elevationPenalty =
        totals.ascent == null
          ? 0
          : input.elevationPreference === "flat"
            ? Math.min(30, totals.ascent / 5)
            : input.elevationPreference === "hilly"
              ? -Math.min(30, totals.ascent / 8)
              : input.elevationPreference === "rolling"
                ? Math.min(
                    25,
                    Math.abs(totals.ascent - (distance / 1000) * 5) / 4,
                  )
                : 0;
      routes.push({
        id: `route-${i}`,
        name: names[i],
        category: "alternative",
        geometry,
        distanceMeters: distance,
        ascentMeters: totals.ascent,
        descentMeters: totals.descent,
        elevationSamples,
        durationSeconds: duration,
        rankingScore: Math.max(
          0,
          100 - (Math.abs(distance - target) / target) * 100 - elevationPenalty,
        ),
        rankingExplanation:
          "Peringkat mempertimbangkan kedekatan jarak dan elevasi yang tersedia; fasilitas jalur belum dinilai.",
        dataSource: "openrouteservice · OpenStreetMap",
        warnings: totals.ascent == null ? ["Data elevasi belum tersedia."] : [],
      });
      if (input.routeShape === "point-to-point") break;
    } catch (e) {
      warnings.push(
        e instanceof Error && e.name === "TimeoutError"
          ? "Permintaan routing melewati batas waktu."
          : "Sambungan ke layanan routing gagal.",
      );
    }
  }
  if (routes.some((route) => route.ascentMeters == null))
    warnings.push(
      "Data elevasi tidak tersedia untuk sebagian rute; pilihan elevasi mungkin kurang akurat.",
    );
  const unique = deduplicateRoutes(routes)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, input.maximumResults);
  if (!unique.length)
    return NextResponse.json(
      {
        routes: [],
        error:
          warnings.find((message) => !message.startsWith("Data elevasi")) ??
          "Tidak ditemukan rute dalam rentang jarak. Coba lokasi atau jarak lain.",
        warnings,
      },
      { status: 404 },
    );
  return NextResponse.json({
    searchId: crypto.randomUUID(),
    routes: unique,
    warnings,
    provenance:
      "Geometri rute dari openrouteservice dengan data OpenStreetMap. Verifikasi kondisi lapangan sebelum berlari.",
  });
}
