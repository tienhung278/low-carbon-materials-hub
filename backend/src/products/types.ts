export interface EpdMetadata {
  id: string | null;
  registrationNumber: string | null;
  pdfFile: string | null;
  programOperator: string | null;
  standard: string | null;
  scope: string | null;
  publishedDate: string | null;
  validUntil: string | null;
}

export interface CarbonProvenance {
  pdfFile: string | null;
  page: number | null;
  table: string | null;
  excerpt: string | null;
}

export interface CarbonStage {
  module: string;
  indicator: string;
  unit: string;
  value: number | null;
  status: string;
  provenance: CarbonProvenance | null;
}

export interface ProductRecord {
  id: string;
  productName: string | null;
  manufacturer: string | null;
  manufacturingLocation: string | null;
  strengthMpa: number | null;
  declaredUnit: string | null;
  declaredUnitMassKg: number | null;
  epd: EpdMetadata;
  carbonStages: CarbonStage[];
}

export interface LoaderDiagnostic {
  file: string;
  path: string;
  message: string;
}

export interface ProductSnapshot {
  documentCount: number;
  products: ProductRecord[];
  diagnostics: LoaderDiagnostic[];
}

export interface ProductFilters {
  strengthMin?: number;
  strengthMax?: number;
  location?: string;
  manufacturer?: string;
}

export interface ProductSummary {
  id: string;
  productName: string | null;
  manufacturer: string | null;
  manufacturingLocation: string | null;
  strengthMpa: number | null;
  declaredUnit: string | null;
  declaredUnitMassKg: number | null;
  epd: EpdMetadata;
  a1a3GwpTotal: CarbonStage | null;
  warningFlags: string[];
}
