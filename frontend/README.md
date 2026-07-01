# Low Carbon Materials Hub Frontend

Next.js app for comparing concrete products from extracted EPD data. The UI is designed for a non-expert builder: filter by strength/location, select products, compare lifecycle carbon stages, and see where values are declared, not declared, or missing.

## Data Modes

The frontend supports two data sources:

- API mode: set `NEXT_PUBLIC_API_BASE_URL` to the backend URL, for example `http://localhost:3001` locally or `https://low-carbon-materials-hub-be.vercel.app` in Vercel.
- Local fallback mode: if no API base URL is set, the app reads repository-level `backend/data/*.json` or optional frontend-local `data/*.json` during server rendering. If no local JSON exists, the app returns an empty product list safely.

API mode is the production deploy path. When `NEXT_PUBLIC_API_BASE_URL` is set, the frontend requests products from the backend API and does not require local JSON data in the frontend Vercel root. The API base URL may include a trailing slash.

The home page is request-time rendered so Vercel does not bake build-time product data into the deployment.

## Vercel Setup

Create two Vercel projects from this repository:

- Backend project: set Root Directory to `backend`.
- Frontend project: set Root Directory to `frontend`.

The frontend project includes `vercel.json` with the deployed backend URL:

```bash
NEXT_PUBLIC_API_BASE_URL=https://low-carbon-materials-hub-be.vercel.app
```

You can also set or override the same value in the frontend Vercel project's Environment Variables if needed.

Do not copy local JSON data into the frontend Vercel root for production. With the environment variable set, products are loaded from the backend API.

## Run Locally

Install dependencies:

```bash
npm install
```

Run against the backend:

```bash
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:3001"
npm run dev
```

Run with local JSON fallback:

```bash
npm run dev
```

Open `http://localhost:3000`.

## User Experience

The app provides:

- Strength and manufacturing-location filters.
- Selectable product list, with up to four products compared at once.
- Lifecycle module comparison across `A1`, `A2`, `A3`, `A1-A3`, `A4`, `A5`, `B1-B7`, `C1-C4`, and `D` where available.
- Distinct rendering for `Declared`, `Not declared`, and `Missing`.
- Source provenance for carbon values, including source EPD file, page/table where available, and excerpt.
- Comparability warnings for different declared units, EPD standards, scopes, missing stages, and not-declared modules.

`null`, `missing`, and `not_declared` carbon values are never rendered as zero.

## Project Structure

- `app/page.tsx` - server page that loads product data.
- `app/components/CarbonComparisonApp.tsx` - interactive comparison UI.
- `lib/data.ts` - API/local data loading and normalization.
- `lib/filtering.ts` - product filtering helpers.
- `lib/lifecycle.ts` - lifecycle module ordering and stage lookup.
- `lib/formatting.ts` - carbon/status/provenance formatting.
- `lib/comparability.ts` - comparison warning logic.
- `lib/types.ts` - frontend data types.

## Checks

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

Branch coverage is enforced at `80%` in `vitest.config.ts`.

Current verified result:

- Test coverage branch coverage: `91.97%`
- Production build and lint: passing
