import { describe, expect, it } from "vitest";
import { getA1A3, getModuleGroup, getStage, sortByHeadlineCarbon } from "./lifecycle";
import type { Product } from "./types";

describe("lifecycle helpers", () => {
  it("finds stages, groups modules, and handles unknown modules", () => {
    const sample = product("a", 100);
    expect(getStage(sample, "A1-A3")?.value).toBe(100);
    expect(getStage(sample, "D")).toBeNull();
    expect(getModuleGroup("B4")).toBe("Use");
    expect(getModuleGroup("ZZ")).toBe("Other");
  });

  it("sorts products by declared A1-A3 and puts missing totals last", () => {
    const sorted = sortByHeadlineCarbon([
      product("missing", null),
      product("also-missing", null),
      product("high", 200),
      product("low", 100),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "low",
      "high",
      "also-missing",
      "missing",
    ]);
    expect(getA1A3(product("missing", null))).toBeNull();
  });

  it("sorts products with unknown names when headline carbon is missing", () => {
    const unnamed = product("unnamed", null);
    unnamed.productName = null;

    expect(sortByHeadlineCarbon([product("z", null), unnamed]).map((item) => item.id)).toEqual([
      "unnamed",
      "z",
    ]);
  });
});

function product(id: string, a1a3: number | null): Product {
  return {
    id,
    productName: id,
    manufacturer: "Maker",
    manufacturingLocation: "Melbourne",
    strengthMpa: 32,
    declaredUnit: "1 m3",
    carbonStages: [
      {
        module: "A1-A3",
        indicator: "GWP-total",
        unit: "kg CO2 eq.",
        value: a1a3,
        status: a1a3 === null ? "missing" : "declared",
      },
    ],
  };
}
