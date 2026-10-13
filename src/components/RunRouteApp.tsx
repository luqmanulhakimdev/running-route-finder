"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
} from "@vis.gl/react-maplibre";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock3,
  Crosshair,
  Footprints,
  Info,
  LocateFixed,
  MapPin,
  Mountain,
  Navigation,
  Route as RouteIcon,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type Route } from "@/lib/routes";
const colors = ["#ef6849", "#249b74", "#7185d5"];
const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC_MODE === "true";
type Place = { name: string; latitude: number; longitude: number };
export default function RunRouteApp() {
  const [start, setStart] = useState<Place>({
    name: "Surabaya, Jawa Timur",
    latitude: -7.2575,
    longitude: 112.7521,
  });
  const [query, setQuery] = useState("Surabaya, Jawa Timur");
  const [places, setPlaces] = useState<Place[]>([]);
  const [distance, setDistance] = useState("5000");
  const [custom, setCustom] = useState("");
  const [shape, setShape] = useState("loop");
  const [elevation, setElevation] = useState("flat");
  const [pace, setPace] = useState("360");
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    112.7521, -7.2575,
  ]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const mapRef = useRef<any>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  useEffect(() => {
    if (STATIC_MODE || query.trim().length < 3 || query === start.name) {
      setPlaces([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/geocoding/search?q=${encodeURIComponent(query)}`,
        );
        const d = await r.json();
        setPlaces(d.results ?? []);
      } catch {
        setPlaces([]);
      }
    }, 550);
    return () => clearTimeout(timer);
  }, [query, start.name]);
  const target = Number(custom || distance);
  const current = routes?.[selected];
  const geojson = useMemo(
    () => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: current?.geometry ?? [],
      },
    }),
    [current],
  );
  const chart =
    current?.elevationSamples?.map((x) => ({
      km: (x.distanceMeters / 1000).toFixed(1),
      m: x.elevationMeters,
    })) ?? [];
  async function search() {
    if (STATIC_MODE) {
      setError(
        "Versi GitHub Pages hanya menyediakan preview statis. Pencarian rute memerlukan server aplikasi.",
      );
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLatitude: start.latitude,
          startLongitude: start.longitude,
          targetDistanceMeters: target,
          distanceTolerancePercent: 5,
          routeShape: shape,
          elevationPreference: elevation,
          paceSecondsPerKm: Number(pace),
          maximumResults: 3,
          ...(destination
            ? {
                destinationLatitude: destination.latitude,
                destinationLongitude: destination.longitude,
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Pencarian rute gagal.");
      }
      setRoutes(Array.isArray(data.routes) ? data.routes : []);
      setSelected(0);
      centerMap(start.longitude, start.latitude);
      setNotice(
        [data.provenance, ...(data.warnings ?? [])].filter(Boolean).join(" "),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidak dapat membuat rute.");
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }
  function centerMap(longitude: number, latitude: number) {
    setMapCenter([longitude, latitude]);
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 13 });
  }
  function locate() {
    if (!navigator.geolocation) {
      setError("Perangkat tidak mendukung lokasi.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const place = {
          name: "Lokasi saya",
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };
        setStart(place);
        setQuery(place.name);
        centerMap(place.longitude, place.latitude);
        setError("");
      },
      () =>
        setError(
          "Izin lokasi ditolak. Cari tempat atau pilih titik pada peta.",
        ),
    );
  }
  function pickOnMap(e: any) {
    const place = {
      name: "Titik pilihan di peta",
      latitude: e.lngLat.lat,
      longitude: e.lngLat.lng,
    };
    if (shape === "point-to-point") {
      setDestination(place);
      setRoutes([]);
      return;
    }
    if (!routes.length) {
      setStart(place);
      setQuery(place.name);
      centerMap(place.longitude, place.latitude);
      setRoutes([]);
    }
  }
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Footprints size={20} />
          </span>
          <span>
            run<span className="brand-accent">route</span>
          </span>
          <span className="beta">BETA</span>
        </div>
        <div className="top-meta">
          <span className="live-dot" />
          DATA OPENSTREETMAP <span className="top-divider" />{" "}
          {start.name.split(",")[0].toUpperCase()}
        </div>
        <button
          className="icon-button location-top"
          title="Gunakan lokasi saya"
          onClick={locate}
        >
          <LocateFixed size={17} />
        </button>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">RUANG LARI PRIBADIMU</div>
          <h1>
            Rute yang pas,
            <br />
            <em>lari yang lepas.</em>
          </h1>
          <p className="intro">
            Temukan jalur lari nyata sesuai target dan suasana yang kamu cari.
          </p>
          <section className="form-section">
            <label className="field-label">
              <MapPin size={14} /> LOKASI AWAL
            </label>
            <div className="searchbox">
              <Search size={16} />
              <input
                value={query}
                disabled={STATIC_MODE}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && places[0]) {
                    setStart(places[0]);
                    setQuery(places[0].name);
                    setPlaces([]);
                    centerMap(places[0].longitude, places[0].latitude);
                  }
                }}
                placeholder={
                  STATIC_MODE
                    ? "Pilih titik langsung di peta"
                    : "Cari alamat atau tempat"
                }
              />
              <button
                className="locate"
                onClick={locate}
                aria-label="Gunakan lokasi"
              >
                <Crosshair size={15} />
              </button>
            </div>
            {places.length > 0 && (
              <div className="suggestions">
                {places.map((p) => (
                  <button
                    key={`${p.latitude}:${p.longitude}`}
                    onClick={() => {
                      setStart(p);
                      setQuery(p.name);
                      setPlaces([]);
                      setMapCenter([p.longitude, p.latitude]);
                    }}
                  >
                    <MapPin size={14} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            <span className="microcopy">
              Cari lokasi atau klik peta untuk memilih titik awal.
            </span>
          </section>
          <section className="form-section">
            <div className="row-label">
              <label className="field-label">
                <RouteIcon size={14} /> JARAK LARI
              </label>
              <span className="unit-chip">KM</span>
            </div>
            <div className="distance-options">
              {[
                ["3000", "3"],
                ["5000", "5"],
                ["10000", "10"],
                ["15000", "15"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={distance === v && !custom ? "active" : ""}
                  onClick={() => {
                    setDistance(v);
                    setCustom("");
                  }}
                >
                  {l}
                </button>
              ))}
              <button
                className={custom ? "active" : ""}
                onClick={() => setCustom(custom || "8")}
              >
                Lainnya
              </button>
            </div>
            {custom && (
              <div className="custom-distance">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <span>km</span>
              </div>
            )}
            <span className="microcopy">
              Toleransi jarak ±5% untuk hasil yang realistis.
            </span>
          </section>
          <section className="form-section">
            <label className="field-label">
              <Navigation size={14} /> BENTUK RUTE
            </label>
            <div className="shape-options">
              <button
                className={shape === "loop" ? "active" : ""}
                onClick={() => {
                  setShape("loop");
                  setDestination(null);
                  setRoutes([]);
                }}
              >
                <span className="shape-art loop-art">↻</span>
                <span>
                  Loop<small>Kembali ke awal</small>
                </span>
              </button>
              <button
                className={shape === "out-and-back" ? "active" : ""}
                onClick={() => {
                  setShape("out-and-back");
                  setDestination(null);
                  setRoutes([]);
                }}
              >
                <span className="shape-art back-art">↔</span>
                <span>
                  Pulang-pergi<small>Lewat jalur sama</small>
                </span>
              </button>
              <button
                className={shape === "point-to-point" ? "active" : ""}
                onClick={() => {
                  setShape("point-to-point");
                  setRoutes([]);
                }}
              >
                <span className="shape-art point-art">⌁</span>
                <span>
                  {" "}
                  Satu arah<small>A ke titik akhir</small>
                </span>
              </button>
            </div>
            {shape === "point-to-point" && (
              <div className="inline-hint">
                <Info size={14} /> Pilih titik tujuan dengan klik peta.
              </div>
            )}
          </section>
          <section className="form-section">
            <label className="field-label">
              <Mountain size={14} /> SUASANA ELEVASI
            </label>
            <div className="elevation-options">
              {[
                ["flat", "Datar & santai", "land-flat"],
                ["rolling", "Rolling hills", "land-roll"],
                ["hilly", "Latihan tanjakan", "land-hill"],
                ["any", "Bebas", "land-any"],
              ].map(([v, l, art]) => (
                <button
                  key={v}
                  className={elevation === v ? "active" : ""}
                  onClick={() => setElevation(v)}
                >
                  <span className={`landscape ${art}`} />
                  {l}
                  {elevation === v && <span className="checkmark">✓</span>}
                </button>
              ))}
            </div>
            <span className="microcopy">
              Preferensi elevasi belum dapat diverifikasi karena sumber elevasi
              belum tersedia.
            </span>
          </section>
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <SlidersHorizontal size={15} /> Preferensi tambahan{" "}
            <ChevronDown size={15} className={showAdvanced ? "rotated" : ""} />
          </button>
          {showAdvanced && (
            <div className="advanced-fields">
              <label>
                Tempo lari
                <select value={pace} onChange={(e) => setPace(e.target.value)}>
                  <option value="300">5:00 min/km · cepat</option>
                  <option value="360">6:00 min/km · sedang</option>
                  <option value="420">7:00 min/km · santai</option>
                  <option value="480">8:00 min/km · pemula</option>
                </select>
              </label>
              <p>Estimasi durasi mengikuti tempo pilihanmu.</p>
            </div>
          )}
          {STATIC_MODE && (
            <div className="static-notice">
              <Info size={15} />
              <span>
                Preview GitHub Pages: peta dan pemilihan titik aktif. Pencarian
                rute dan nama tempat perlu backend.
              </span>
            </div>
          )}
          <button
            className="find-button"
            onClick={search}
            disabled={loading || !target || STATIC_MODE}
          >
            <span>
              {STATIC_MODE
                ? "PREVIEW STATIS"
                : loading
                  ? "MENCARI JALUR…"
                  : "TEMUKAN RUTE"}
            </span>
            {loading ? <span className="spinner" /> : <Sparkles size={17} />}
          </button>
          {error && (
            <div className="error-box">
              <Info size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="sidebar-foot">
            <span>◉</span> Selalu periksa kondisi jalur sebelum berlari.
          </div>
        </aside>
        <section className="map-area">
          <div className="map-canvas">
            <Map
              ref={mapRef}
              initialViewState={{
                longitude: mapCenter[0],
                latitude: mapCenter[1],
                zoom: 13,
              }}
              onMove={(e) =>
                setMapCenter([e.viewState.longitude, e.viewState.latitude])
              }
              onClick={pickOnMap}
              mapStyle={
                process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
                "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
              }
              attributionControl={{ compact: true }}
              dragRotate={false}
              pitchWithRotate={false}
              interactiveLayerIds={current ? ["selected-route"] : []}
              cursor="crosshair"
            >
              <NavigationControl position="bottom-right" showCompass={false} />
              {current && (
                <button
                  className="fit-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const pts = current.geometry;
                    const xs = pts.map((p) => p[0]),
                      ys = pts.map((p) => p[1]);
                    mapRef.current?.fitBounds(
                      [
                        [Math.min(...xs), Math.min(...ys)],
                        [Math.max(...xs), Math.max(...ys)],
                      ],
                      { padding: 70, duration: 700 },
                    );
                  }}
                >
                  <Crosshair size={13} /> LIHAT RUTE
                </button>
              )}
              {current && (
                <Source id="current-route" type="geojson" data={geojson}>
                  <Layer
                    id="route-glow"
                    type="line"
                    paint={{
                      "line-color": "#fff",
                      "line-width": 11,
                      "line-opacity": 0.8,
                    }}
                  />
                  <Layer
                    id="selected-route"
                    type="line"
                    paint={{
                      "line-color": colors[selected % 3],
                      "line-width": 5,
                      "line-opacity": 0.96,
                    }}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                  />
                </Source>
              )}
              <Marker
                longitude={start.longitude}
                latitude={start.latitude}
                anchor="bottom"
              >
                <div className="map-pin">
                  <span />
                  <b>MULAI</b>
                </div>
              </Marker>
              {shape === "point-to-point" && (
                <>
                  <button className="map-prompt">
                    {destination
                      ? "Tujuan ditandai · klik peta untuk memindahkan"
                      : "Klik peta untuk menandai titik akhir"}
                  </button>
                  {destination && (
                    <Marker
                      longitude={destination.longitude}
                      latitude={destination.latitude}
                      anchor="bottom"
                    >
                      <div className="map-pin destination-pin">
                        <span />
                        <b>AKHIR</b>
                      </div>
                    </Marker>
                  )}
                </>
              )}
              <div className="map-badge">
                <span className="map-badge-dot" /> PETA JALAN & JALUR
              </div>
              <div className="map-attribution">© OpenStreetMap · © CARTO</div>
              {!routes.length && (
                <div className="map-empty">
                  <span className="empty-icon">
                    <Footprints size={22} />
                  </span>
                  <strong>Petualanganmu dimulai di sini</strong>
                  <span>
                    Atur preferensi, lalu temukan rute lari di sekitarmu.
                  </span>
                  <div className="empty-line" />
                </div>
              )}
            </Map>
          </div>
        </section>
        <aside className="results">
          <div className="results-header">
            <div>
              <div className="eyebrow">PILIH JALAN CERITAMU</div>
              <h2>
                Alternatif rute
                {routes.length > 0 && (
                  <span className="result-count">0{routes.length}</span>
                )}
              </h2>
            </div>
            <div className="distance-pill">
              {(target / 1000).toFixed(target % 1000 ? 1 : 0)} <small>KM</small>
            </div>
          </div>
          {routes.length > 0 ? (
            <>
              <p className="results-sub">
                {routes.length} jalur ditemukan di sekitar{" "}
                {start.name.split(",")[0]}.
              </p>
              <div className="route-list">
                {routes.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(i)}
                    className={`route-card ${selected === i ? "selected" : ""}`}
                    style={
                      { "--route-color": colors[i % 3] } as React.CSSProperties
                    }
                  >
                    <div className="route-card-top">
                      <span className="route-dot" />
                      <span className="route-label">{r.name}</span>
                      {i === 0 && (
                        <span className="recommended">JARAK TERDEKAT</span>
                      )}
                    </div>
                    <strong className="route-distance">
                      {(r.distanceMeters / 1000).toFixed(2)}
                      <small>km</small>
                    </strong>
                    <div className="route-stats">
                      <span>
                        <Mountain size={13} />
                        {r.ascentMeters == null
                          ? "Elevasi —"
                          : `↑ ${Math.round(r.ascentMeters)} m`}
                      </span>
                      <span>
                        <Clock3 size={13} />
                        {Math.round(r.durationSeconds / 60)} mnt
                      </span>
                    </div>
                    <div className="route-card-bottom">
                      <span>
                        {r.distanceMeters > 0
                          ? `${shape === "loop" ? "Loop" : shape === "out-and-back" ? "Pulang-pergi" : "Satu arah"} · jarak aktual`
                          : "Rute lari"}
                      </span>
                      <span className="select-arrow">↗</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="profile-card">
                <div className="profile-heading">
                  <div>
                    <div className="eyebrow">LIHAT LEBIH DEKAT</div>
                    <h3>Profil elevasi</h3>
                  </div>
                  <span className="profile-unit">METER</span>
                </div>
                {chart.length > 1 ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chart}
                        margin={{ top: 12, right: 8, left: -25, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="elevationFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={colors[selected % 3]}
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor={colors[selected % 3]}
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 4"
                          vertical={false}
                          stroke="#e8e7e2"
                        />
                        <XAxis
                          dataKey="km"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 9, fill: "#99978f" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 9, fill: "#99978f" }}
                        />
                        <Tooltip formatter={(v) => [`${v} m`, "Elevasi"]} />
                        <Area
                          dataKey="m"
                          type="monotone"
                          stroke={colors[selected % 3]}
                          strokeWidth={2}
                          fill="url(#elevationFill)"
                          connectNulls={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="chart-placeholder">
                    <div className="placeholder-land">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="chart-msg">
                      <Mountain size={16} />
                      <span>
                        Profil elevasi belum tersedia
                        <br />
                        <small>Data elevasi tidak dikembalikan penyedia.</small>
                      </span>
                    </div>
                  </div>
                )}
                <div className="elevation-summary">
                  <span>
                    <ArrowUp size={13} /> Tanjakan{" "}
                    <b>
                      {current?.ascentMeters == null
                        ? "—"
                        : `${Math.round(current.ascentMeters)} m`}
                    </b>
                  </span>
                  <span>
                    <ArrowDown size={13} /> Turunan{" "}
                    <b>
                      {current?.descentMeters == null
                        ? "—"
                        : `${Math.round(current.descentMeters)} m`}
                    </b>
                  </span>
                </div>
              </div>
              <div className="route-source">
                <Info size={14} />
                <span>{notice}</span>
              </div>
            </>
          ) : (
            <>
              <p className="results-sub">Rute pilihanmu akan muncul di sini.</p>
              <div className="results-empty">
                <div className="route-scribble">〰</div>
                <div className="empty-orbit">
                  <Footprints size={21} />
                </div>
                <h3>
                  Belum ada rute
                  <br />
                  yang dipilih
                </h3>
                <p>
                  Rute akan dibuat dari jaringan jalan dan jalur OpenStreetMap.
                </p>
                <div className="empty-tags">
                  <span>JARAK AKTUAL</span>
                  <span>RUTE BERAGAM</span>
                </div>
              </div>
              <div className="compare-note">
                <span className="note-icon">
                  <Mountain size={15} />
                </span>
                <span>
                  <b>Setiap langkah punya cerita</b>Bandingkan profil dan pilih
                  tantangan yang tepat untukmu.
                </span>
              </div>
            </>
          )}
          <div className="safety-note">
            <Info size={14} />
            <span>
              Data peta bisa berubah. Pastikan jalur dapat diakses dan ikuti
              aturan lalu lintas setempat.
            </span>
          </div>
          <footer className="results-footer">
            <span>BUKAN SOAL SEBERAPA JAUH.</span>
            <b>SOAL KE MANA KAMU MELANGKAH.</b>
            <div>
              RUNROUTE <i>·</i> DIBUAT UNTUK SETIAP LANGKAH
            </div>
          </footer>
        </aside>
      </div>
    </main>
  );
}
