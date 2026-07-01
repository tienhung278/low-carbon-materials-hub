import { describe, expect, it } from "vitest";
import {
  formatCarbonValue,
  formatNumber,
  formatProvenance,
  getProvenanceParts,
  getStatusLabel,
} from "./formatting";
import type { CarbonStage } from "./types";

describe("formatting helpers", () => {
  it("formats declared numeric carbon values without treating zero as missing", () => {
    expect(formatNumber(275)).toBe("275");
    expect(formatNumber(15.12)).toBe("15.1");
    expect(formatNumber(4.236)).toBe("4.24");
    expect(formatCarbonValue(stage({ value: 0, status: "declared" }))).toBe(
      "0.00",
    );
    expect(formatCarbonValue(stage({ value: -12.2, status: "declared" }))).toBe(
      "-12.2",
    );
  });

  it("labels not declared and missing values distinctly", () => {
    expect(formatCarbonValue(stage({ value: null, status: "not_declared" }))).toBe(
      "ND",
    );
    expect(formatCarbonValue(stage({ value: null, status: "missing" }))).toBe(
      "Missing",
    );
    expect(formatCarbonValue(null)).toBe("Missing");
    expect(getStatusLabel(stage({ value: null, status: "not_declared" }))).toBe(
      "Not declared",
    );
    expect(getStatusLabel(stage({ value: null, status: "missing" }))).toBe(
      "Missing",
    );
    expect(getStatusLabel(null)).toBe("Missing from extraction");
  });

  it("builds provenance from source EPD, page, table, and excerpt", () => {
    expect(
      formatProvenance({
        pdf: "example.pdf",
        sourcePage: 9,
        tableLabel: "Core indicators",
        quote: "GWP total 2.32E+02",
      }),
    ).toBe("example.pdf | p. 9 | Core indicators | Excerpt: GWP total 2.32E+02");
  });

  it("falls back across provenance aliases and empty provenance", () => {
    expect(
      getProvenanceParts({
        pdfFile: "api-source.pdf",
        registration: "EPD-123",
        page: "12",
        table: "Impact table",
        excerpt: "A1-A3",
      }),
    ).toEqual(["api-source.pdf", "p. 12", "Impact table", "Excerpt: A1-A3"]);
    expect(formatProvenance({ registration: "EPD-123" })).toBe("EPD-123");
    expect(formatProvenance(null)).toBe("No provenance supplied");
    expect(formatProvenance({})).toBe("No provenance supplied");
  });
});

function stage(overrides: Partial<CarbonStage>): CarbonStage {
  return {
    module: "A1",
    indicator: "GWP-total",
    unit: "kg CO2 eq.",
    value: 1,
    status: "declared",
    provenance: null,
    ...overrides,
  };
}
