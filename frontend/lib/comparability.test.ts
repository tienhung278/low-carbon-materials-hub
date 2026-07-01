import { describe, expect, it } from "vitest";
import { getComparabilityWarnings } from "./comparability";
import type { CarbonStage, Product } from "./types";

describe("comparability warnings", () => {
  it("asks for another product when only one product is selected", () => {
    expect(getComparabilityWarnings([product("a")])).toEqual([
      "Select at least two products to assess comparability.",
    ]);
  });

  it("reports unit, standard, scope, not declared, and missing differences", () => {
    const warnings = getComparabilityWarnings([
      product("a", {
        declaredUnit: "1 cubic metre",
        standard: "EN 15804+A2",
        scope: "A1-A3",
        stages: [
          stage("A1-A3", "declared", 100),
          stage("A4", "not_declared", null),
          stage("C1", "missing", null),
        ],
      }),
      product("b", {
        declaredUnit: "1 tonne",
        standard: "ISO 21930",
        scope: "A1-A5",
        stages: [
          stage("A1-A3", "declared", 120),
          stage("A4", "declared", 4),
        ],
      }),
    ]);

    expect(warnings).toContain("Declared units differ: 1 cubic metre; 1 tonne.");
    expect(warnings).toContain("EPD standards differ: EN 15804+A2; ISO 21930.");
    expect(warnings).toContain(
      "Lifecycle scopes differ. Compare stage by stage, not just totals.",
    );
    expect(warnings.some((warning) => warning.includes("Not declared"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("Missing from extracted data"))).toBe(true);
  });

  it("confirms matching selections when comparable metadata and coverage match", () => {
    const stages = completeStages(100);
    expect(
      getComparabilityWarnings([
        product("a", { stages }),
        product("b", { stages: completeStages(110) }),
      ]),
    ).toContain(
      "Selected products use matching units, standards, and extracted stage coverage.",
    );
  });

  it("compares API-shaped EPD standard and scope metadata", () => {
    const warnings = getComparabilityWarnings([
      apiProduct("api-a", "EN 15804+A2", "A1-A3"),
      apiProduct("api-b", "ISO 21930", "A1-A5"),
    ]);

    expect(warnings).toContain("EPD standards differ: EN 15804+A2; ISO 21930.");
    expect(warnings).toContain(
      "Lifecycle scopes differ. Compare stage by stage, not just totals.",
    );
  });
});

type ProductOverrides = {
  declaredUnit?: string;
  standard?: string;
  scope?: string;
  stages?: CarbonStage[];
};

function product(id: string, overrides: ProductOverrides = {}): Product {
  return {
    id,
    productName: id,
    manufacturer: "Maker",
    manufacturingLocation: "Melbourne",
    strengthMpa: 32,
    declaredUnit: overrides.declaredUnit ?? "1 cubic metre",
    scope: {
      standard: overrides.standard ?? "EN 15804+A2",
      description: overrides.scope ?? "A1-A3",
    },
    carbonStages: overrides.stages ?? [stage("A1-A3", "declared", 100)],
  };
}

function apiProduct(id: string, standard: string, scope: string): Product {
  return {
    id,
    productName: id,
    manufacturer: "API Maker",
    manufacturingLocation: "Sydney",
    strengthMpa: 32,
    declaredUnit: "1 cubic metre",
    epd: {
      standard,
      scope,
      registration: `${id}-registration`,
    },
    carbonStages: completeStages(100),
  };
}

function stage(
  module: string,
  status: CarbonStage["status"],
  value: number | null,
): CarbonStage {
  return {
    module,
    indicator: "GWP-total",
    unit: "kg CO2 eq.",
    value,
    status,
    provenance: { pdf: "source.pdf" },
  };
}

function completeStages(a1a3: number): CarbonStage[] {
  const modules = [
    "A1",
    "A2",
    "A3",
    "A1-A3",
    "A4",
    "A5",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "C1",
    "C2",
    "C3",
    "C4",
    "D",
  ];

  return modules.map((moduleName) =>
    stage(moduleName, "declared", moduleName === "A1-A3" ? a1a3 : 1),
  );
}
