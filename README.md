# RunRoute

RunRoute is a map-first running route discovery MVP. The interface is in Bahasa Indonesia. It uses real pedestrian route geometry from openrouteservice (OpenStreetMap data) and never fabricates a route when a provider is unavailable.

## Architecture

- Next.js App Router, TypeScript, React.
- MapLibre GL JS with the CARTO Positron hosted vector style and visible OpenStreetMap/CARTO attribution.
- Server-side openrouteservice requests for walking routes and geocoding. The API key is never sent to the browser.
- Nominatim is deliberately not used: its public service policy restricts generic geocoding integration in generated applications.
- Route distance is recalculated from returned geometry. Loop candidates use ORS round-trip requests with different seeds and length targets; results outside the configured distance tolerance and duplicate geometries are discarded. Out-and-back and point-to-point are built from actual provider routes.
- When ORS returns elevation samples with route geometry, the app calculates ascent/descent and plots the selected route; absent samples are shown as unavailable, not invented.

## Requirements

- Node.js 20.9 or later and npm.
- An openrouteservice API key for real routes and name search. The provider's free tier is subject to quotas, feature limits, and its current terms. The app can start without a key; the API explains how to enable real route search. A user can still choose a map point as the starting location.

## Local development

```sh
cp .env.example .env.local
# Set OPENROUTESERVICE_API_KEY in .env.local
npm install
npm run dev
```

Open http://localhost:3000. The map style loads from CARTO's hosted basemap service and requires internet access. `NEXT_PUBLIC_MAP_STYLE_URL` can point to another compatible style; maintain its required attribution and usage terms.

## Commands

```sh
npm run dev       # development server
npm run typecheck # TypeScript validation
npm run lint      # ESLint
npm test          # deterministic geometry unit tests
npm run build     # production build
npm start         # serve the production build
```

GitHub Actions runs lint, type checks, unit tests, and a production build on pushes and pull requests targeting `main`. To make the key available during the workflow build, create the `OPENROUTESERVICE_API_KEY` repository secret in **Settings → Secrets and variables → Actions**. This CI workflow does not deploy the app; configure the same variable in the eventual hosting provider for runtime routing and geocoding.

A separate **Deploy GitHub Pages** workflow publishes a static preview at `https://luqmanulhakimdev.github.io/running-route-finder/` after pushes to `main`. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not already selected. The Pages preview supports the map, device location, and manual point selection. It does not run route search or geocoding because GitHub Pages cannot host the app’s dynamic API handlers; no ORS key is exposed in the static bundle. Use a Next.js-capable server deployment for the complete route-discovery workflow.

## Environment

- `OPENROUTESERVICE_API_KEY` — required for live route generation and geocoding; server-only.
- `NEXT_PUBLIC_MAP_STYLE_URL` — optional MapLibre style URL. Defaults to CARTO Positron.

## Providers, licensing, and limits

- Routes and geocoding: openrouteservice. Create a key with the provider and review current free quota, request limits, and terms before use. A missing key, timeout, quota error, or unreachable provider is surfaced in the interface.
- Underlying route data: OpenStreetMap, © OpenStreetMap contributors, ODbL. Completeness and pedestrian access tags vary by place; verify local conditions.
- Map tiles/style: hosted CARTO basemap with © CARTO and © OpenStreetMap attribution displayed on-map. CARTO's hosted basemap terms can change; confirm suitability for deployment and expected traffic. The hosted map service is not an unlimited production tile service.
- Geocoding: ORS geocoding via the same server-side key. Requests are debounced by the client and response caching is enabled.
- Elevation samples are requested with ORS route geometry and used for ascent/descent, profile display, and a basic elevation-preference ranking when the provider returns them. Missing values stay unknown; terrain preference becomes less reliable without those samples. Safety/accessibility/green-space claims and ranking are not implemented.
- Local/demo mode does not return fake route geometry. Without an ORS key, live route search is unavailable.

## Current limitations

- The ORS round-trip engine may not find enough distinct loops in every location or within the requested distance tolerance. It searches a small bounded set of alternatives and reports when it cannot.
- Out-and-back selection uses a generated turning coordinate and then validates the provider's actual returned distance. Point-to-point lets the user mark an endpoint on the map.
- Elevation depends on ORS returning elevation in route geometry; if unavailable, profile and totals remain blank and terrain ranking is limited.
- Road surface, green-space, lighting, sidewalk, and traffic ranking are not claimed by this MVP.

## Safety

Route recommendations do not guarantee safety or current access. Check signs, access restrictions, weather, and current conditions, and follow local traffic laws. OpenStreetMap content may be incomplete or outdated.
