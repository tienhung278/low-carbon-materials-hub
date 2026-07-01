# Low Carbon Materials Hub Backend

NestJS API for the concrete EPD comparison app. It reads extracted JSON files from backend-local `data/`, normalizes product records, and exposes read-only endpoints for product discovery and lifecycle carbon comparison.

## Data Source

The backend does not parse PDFs at runtime. It loads one JSON file per EPD from backend-local `data/*.json`.

The canonical extraction output is `backend/data/*.json`. Regenerate and validate it from the repository root:

```bash
npm run data:generate
npm run data:validate
```

`npm run data:validate` checks `backend/data` directly and fails if a legacy repository-root `data/` directory exists.

Important data rules:

- `carbonStages[].status` is one of `declared`, `not_declared`, or `missing`.
- `not_declared` and `missing` values are `null`; they are never treated as zero.
- Every declared carbon value includes provenance back to the source PDF through the stage provenance object.
- Products with nullable metadata, such as `strengthMpa: null`, are kept unless a filter specifically requires that value.

## API

Run the backend locally:

```bash
npm install
$env:PORT=3001; npm run start:dev
```

Endpoints:

- `GET /health` - service status plus document/product counts.
- `GET /products` - product summaries. Optional query params: `strengthMin`, `strengthMax`, `location`, `manufacturer`.
- `GET /products/filters` - available strengths, locations, and manufacturers.
- `GET /products/:id` - full product detail with EPD metadata and carbon stages.
- `GET /compare?ids=id1,id2` - comparison-ready lifecycle module data and comparability warnings.

Example:

```bash
curl "http://localhost:3001/products?strengthMin=25&location=Melbourne"
curl "http://localhost:3001/compare?ids=envirocrete-40-32mpa,ge322lpf2"
```

## Vercel Deployment

Create a Vercel project for this API from the monorepo with Root Directory set to `backend`. Keep `backend/data/*.json` committed so the serverless runtime has the generated data inside the backend project.

The backend project includes `vercel.json` to force the NestJS framework preset and clear any static `public` output directory setting. If Vercel reports `No Output Directory named "public" found`, the project is being treated as a static site instead of a NestJS backend; redeploy with the checked-in config or clear the Output Directory override in Project Settings.

Deployment checklist:

- Run `npm run data:generate` and `npm run data:validate` from the repo root after EPD PDFs or text artifacts change.
- Deploy the backend project first.
- Confirm `GET https://<backend-project>.vercel.app/health` reports `documents: 20` and `products: 20`.
- Use that backend URL as the frontend project's `NEXT_PUBLIC_API_BASE_URL`.

The repository also supports `DATA_DIR` for local tests or alternate hosting environments, but Vercel should use the committed backend-local `data` folder.

## Project Structure

- `src/app.controller.ts` - HTTP route handling and query validation.
- `src/app.service.ts` - health summary.
- `src/products/product.repository.ts` - backend-local filesystem loading, validation, and normalization.
- `src/products/product.service.ts` - filters, summaries, detail lookup, and comparison logic.
- `src/products/types.ts` - shared backend domain/API types.

Controllers stay thin; data loading and comparison behavior live in repository/service classes so the implementation is easier to extend.

## Checks

```bash
npm run lint
npm test
npm run test:cov
npm run test:e2e
npm run build
```

Branch coverage is enforced at `80%` through Jest configuration in `package.json`.

Current verified result:

- Unit coverage branch coverage: `86.84%`
- E2E boot/API test: passing
- Build and lint: passing
