import { describe, expect, it } from "vitest";
import { filterProducts, getFilterOptions } from "./filtering";
import type { Product } from "./types";

describe("filtering helpers", () => {
  const products: Product[] = [
    product("a", 25, "Brisbane"),
    product("b", 32, "Melbourne"),
    product("c", null, ""),
  ];

  it("returns sorted strength and location filter options", () => {
    expect(getFilterOptions(products)).toEqual({
      strengths: [25, 32],
      locations: ["Brisbane", "Melbourne"],
    });
  });

  it("filters by strength, location, both filters, and all filters", () => {
    expect(filterProducts(products, { strength: "all", location: "all" })).toHaveLength(3);
    expect(filterProducts(products, { strength: "25", location: "all" })).toEqual([
      products[0],
    ]);
    expect(filterProducts(products, { strength: "all", location: "Melbourne" })).toEqual([
      products[1],
    ]);
    expect(filterProducts(products, { strength: "25", location: "Melbourne" })).toEqual([]);
  });
});

function product(id: string, strengthMpa: number | null, location: string): Product {
  return {
    id,
    productName: id,
    manufacturer: "Maker",
    manufacturingLocation: location,
    strengthMpa,
    declaredUnit: "1 m3",
    carbonStages: [],
  };
}

