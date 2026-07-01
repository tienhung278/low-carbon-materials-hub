import type { CarbonStage, Provenance } from "./types";

export function formatNumber(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 100) {
    return value.toFixed(0);
  }

  if (abs >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

export function formatCarbonValue(stage: CarbonStage | null): string {
  if (!stage) {
    return "Missing";
  }

  if (stage.status === "not_declared") {
    return "ND";
  }

  if (stage.status !== "declared" || typeof stage.value !== "number") {
    return "Missing";
  }

  return formatNumber(stage.value);
}

export function getStatusLabel(stage: CarbonStage | null): string {
  if (!stage) {
    return "Missing from extraction";
  }

  if (stage.status === "declared" && typeof stage.value === "number") {
    return "Declared";
  }

  if (stage.status === "not_declared") {
    return "Not declared";
  }

  return "Missing";
}

export function getStatusTone(stage: CarbonStage | null): string {
  if (stage?.status === "declared" && typeof stage.value === "number") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (stage?.status === "not_declared") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-800";
}

export function formatStrength(strengthMpa: number | null): string {
  return typeof strengthMpa === "number" ? `${strengthMpa} MPa` : "Unknown";
}

export function getProvenanceParts(provenance?: Provenance | null): string[] {
  if (!provenance) {
    return ["No provenance supplied"];
  }

  const source = getProvenanceSource(provenance);
  const page = provenance.sourcePage ?? provenance.page;
  const table = provenance.tableLabel ?? provenance.table;
  const excerpt = provenance.quote ?? provenance.excerpt;
  const parts: string[] = [];

  if (source) {
    parts.push(source);
  }

  if (page !== null && page !== undefined && page !== "") {
    parts.push(`p. ${page}`);
  }

  if (table) {
    parts.push(table);
  }

  if (excerpt) {
    parts.push(`Excerpt: ${excerpt}`);
  }

  return parts.length > 0 ? parts : ["No provenance supplied"];
}

export function formatProvenance(provenance?: Provenance | null): string {
  return getProvenanceParts(provenance).join(" | ");
}

export function getProvenanceSource(provenance?: Provenance | null): string {
  return provenance?.pdf ?? provenance?.pdfFile ?? provenance?.registration ?? "";
}
