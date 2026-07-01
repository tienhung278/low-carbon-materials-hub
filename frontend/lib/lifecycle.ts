import type { CarbonStage, LifecycleModule, Product } from "./types";

export const LIFECYCLE_MODULES: LifecycleModule[] = [
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

const moduleGroups: Record<string, string> = {
  A1: "Product",
  A2: "Product",
  A3: "Product",
  "A1-A3": "Product total",
  A4: "Construction",
  A5: "Construction",
  B1: "Use",
  B2: "Use",
  B3: "Use",
  B4: "Use",
  B5: "Use",
  B6: "Use",
  B7: "Use",
  C1: "End of life",
  C2: "End of life",
  C3: "End of life",
  C4: "End of life",
  D: "Benefits beyond boundary",
};

export function getModuleGroup(module: string): string {
  return moduleGroups[module] ?? "Other";
}

export function getStage(product: Product, module: string): CarbonStage | null {
  return product.carbonStages.find((stage) => stage.module === module) ?? null;
}

export function getA1A3(product: Product): number | null {
  const stage = getStage(product, "A1-A3");
  return stage?.status === "declared" && typeof stage.value === "number"
    ? stage.value
    : null;
}

export function sortByHeadlineCarbon(products: Product[]): Product[] {
  return [...products].sort((left, right) => {
    const leftValue = getA1A3(left);
    const rightValue = getA1A3(right);

    if (leftValue === null && rightValue === null) {
      return displayName(left).localeCompare(displayName(right));
    }

    if (leftValue === null) {
      return 1;
    }

    if (rightValue === null) {
      return -1;
    }

    return leftValue - rightValue;
  });
}

function displayName(product: Product): string {
  return product.productName ?? "Unknown product";
}
