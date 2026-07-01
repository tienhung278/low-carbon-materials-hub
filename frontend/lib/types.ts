export type LifecycleModule =
  | "A1"
  | "A2"
  | "A3"
  | "A1-A3"
  | "A4"
  | "A5"
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6"
  | "B7"
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "D";

export type CarbonStatus = "declared" | "not_declared" | "missing";

export type Provenance = {
  pdf?: string | null;
  pdfFile?: string | null;
  registration?: string | null;
  sourcePage?: number | string | null;
  page?: number | string | null;
  tableLabel?: string | null;
  table?: string | null;
  quote?: string | null;
  excerpt?: string | null;
};

export type EpdMetadata = Provenance & {
  standard?: string | null;
  scope?: string | null;
};

export type CarbonStage = {
  module: LifecycleModule | string;
  indicator?: string | null;
  unit?: string | null;
  value: number | null;
  status: CarbonStatus | string;
  provenance?: Provenance | null;
};

export type ProductScope = {
  description?: string | null;
  standard?: string | null;
};

export type Product = {
  id: string;
  productName: string | null;
  manufacturer: string | null;
  manufacturingLocation: string | null;
  strengthMpa: number | null;
  declaredUnit: string | null;
  declaredUnitMassKg?: number | null;
  scope?: ProductScope | null;
  carbonStages: CarbonStage[];
  epd?: EpdMetadata | null;
};

export type ProductFilters = {
  strength: string;
  location: string;
};
