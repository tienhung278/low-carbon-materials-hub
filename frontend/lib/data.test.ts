import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProducts } from "./data";

const fsMocks = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: fsMocks.readdir,
    readFile: fsMocks.readFile,
  },
  readdir: fsMocks.readdir,
  readFile: fsMocks.readFile,
}));

describe("data loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("loads and normalizes local data when no API base URL is configured", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["ignore.txt", "one.json"] as never);
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        products: [
          {
            productName: "Fallback mix",
            manufacturer: "Concrete Co",
            manufacturingLocation: "Brisbane",
            strengthMpa: 32,
            declaredUnit: "1 cubic metre",
            carbonStages: [],
          },
        ],
      }) as never,
    );

    const products = await loadProducts();

    expect(readdir).toHaveBeenCalledWith(
      path.resolve(process.cwd(), "..", "backend", "data"),
    );
    expect(products).toMatchObject([
      {
        id: "Fallback mix",
        productName: "Fallback mix",
        strengthMpa: 32,
        declaredUnitMassKg: null,
      },
    ]);
  });

  it("uses API product details when the API returns products", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test/");
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response(true, [{ id: "api-a" }]) as never)
      .mockResolvedValueOnce(
        response(true, {
          id: "api-a",
          productName: "API mix",
          manufacturer: "API Concrete",
          manufacturingLocation: "Melbourne",
          declaredUnit: "1 cubic metre",
          epd: {
            standard: "EN 15804+A2",
            scope: "A1-A5",
            registration: "EPD-API-1",
          },
          carbonStages: [
            {
              module: "A1-A3",
              indicator: "GWP-total",
              unit: "kg CO2 eq.",
              value: 120,
              status: "declared",
              provenance: {
                pdfFile: "api-epd.pdf",
                page: 7,
              },
            },
          ],
        }) as never,
      );

    const products = await loadProducts();

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: "api-a",
      productName: "API mix",
      strengthMpa: null,
      scope: {
        standard: "EN 15804+A2",
        description: "A1-A5",
      },
      carbonStages: [
        {
          provenance: {
            pdfFile: "api-epd.pdf",
          },
        },
      ],
    });
    expect(readdir).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.example.test/products",
      {
        next: { revalidate: 60 },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.test/products/api-a",
      {
        next: { revalidate: 60 },
      },
    );
  });

  it("normalizes nullable metadata and empty stage arrays from local data", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["partial.json"] as never);
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        products: [
          {
            id: "partial",
            productName: null,
            manufacturer: null,
            manufacturingLocation: null,
            declaredUnit: null,
            strengthMpa: null,
            carbonStages: [],
          },
        ],
      }) as never,
    );

    const products = await loadProducts();

    expect(products).toMatchObject([
      {
        id: "partial",
        productName: "Unnamed product",
        manufacturer: "Unknown manufacturer",
        manufacturingLocation: "Unknown location",
        declaredUnit: "Unknown declared unit",
        carbonStages: [],
      },
    ]);
  });


  it("returns empty without reading local data when the configured API is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.mocked(fetch).mockResolvedValueOnce(response(false, []) as never);

    await expect(loadProducts()).resolves.toEqual([]);
    expect(readdir).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns empty without reading local data when configured API detail fetch throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(true, [{ id: "api-a" }]) as never)
      .mockRejectedValueOnce(new Error("network"));

    await expect(loadProducts()).resolves.toEqual([]);
    expect(readdir).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns empty safely when no API base URL or local data exists", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("no local data"));

    await expect(loadProducts()).resolves.toEqual([]);
  });
});

function response(ok: boolean, body: unknown) {
  return {
    ok,
    json: async () => body,
  };
}
