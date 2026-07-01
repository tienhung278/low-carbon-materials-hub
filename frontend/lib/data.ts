import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CarbonStage, EpdMetadata, Product, ProductScope } from "./types";

type RawDataFile = {
  products?: RawProduct[];
};

type RawProduct = Partial<Product> & {
  carbonStages?: CarbonStage[];
  epd?: EpdMetadata | null;
  scope?: ProductScope | null;
};

function normalizeScope(raw: RawProduct): ProductScope | null {
  const standard = raw.scope?.standard ?? raw.epd?.standard ?? null;
  const description = raw.scope?.description ?? raw.epd?.scope ?? null;

  return standard || description ? { standard, description } : null;
}

function normalizeProduct(raw: RawProduct): Product {
  return {
    id: String(raw.id ?? raw.productName ?? crypto.randomUUID()),
    productName: String(raw.productName ?? "Unnamed product"),
    manufacturer: String(raw.manufacturer ?? "Unknown manufacturer"),
    manufacturingLocation: String(
      raw.manufacturingLocation ?? "Unknown location",
    ),
    strengthMpa:
      typeof raw.strengthMpa === "number" ? raw.strengthMpa : null,
    declaredUnit: String(raw.declaredUnit ?? "Unknown declared unit"),
    declaredUnitMassKg:
      typeof raw.declaredUnitMassKg === "number" ? raw.declaredUnitMassKg : null,
    scope: normalizeScope(raw),
    carbonStages: raw.carbonStages ?? [],
    epd: raw.epd ?? null,
  };
}

async function readProductsFromDirectory(dataDir: string): Promise<Product[]> {
  const files = (await readdir(dataDir)).filter((file) => file.endsWith(".json"));
  const products: Product[] = [];

  for (const file of files) {
    const body = await readFile(path.join(dataDir, file), "utf8");
    const parsed = JSON.parse(body) as RawDataFile;

    for (const rawProduct of parsed.products ?? []) {
      products.push(normalizeProduct(rawProduct));
    }
  }

  return products;
}

async function readLocalProducts(): Promise<Product[]> {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "..", "backend", "data"),
    path.resolve(cwd, "backend", "data"),
    path.resolve(cwd, "frontend", "data"),
    path.basename(cwd) === "frontend" ? path.resolve(cwd, "data") : null,
  ].filter((candidate): candidate is string => candidate !== null);
  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    try {
      const products = await readProductsFromDirectory(candidate);

      if (products.length > 0) {
        return products;
      }
    } catch {
      // Try the next candidate path. This supports both repo-root and frontend cwd.
    }
  }

  return [];
}

function getApiBaseUrl(): string | null {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  return apiBaseUrl ? apiBaseUrl.replace(/\/+$/, "") : null;
}

async function readApiProducts(): Promise<Product[]> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return [];
  }

  const summariesResponse = await fetch(`${apiBaseUrl}/products`, {
    next: { revalidate: 60 },
  });

  if (!summariesResponse.ok) {
    return [];
  }

  const summaries = (await summariesResponse.json()) as Array<{ id: string }>;
  const products = await Promise.all(
    summaries.map(async (summary) => {
      const response = await fetch(`${apiBaseUrl}/products/${summary.id}`, {
        next: { revalidate: 60 },
      });

      if (!response.ok) {
        return null;
      }

      return normalizeProduct((await response.json()) as RawProduct);
    }),
  );

  return products.filter((product): product is Product => product !== null);
}

export async function loadProducts(): Promise<Product[]> {
  if (getApiBaseUrl()) {
    try {
      return await readApiProducts();
    } catch {
      return [];
    }
  }

  return readLocalProducts();
}
