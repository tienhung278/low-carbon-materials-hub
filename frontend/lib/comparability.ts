import { LIFECYCLE_MODULES, getStage } from "./lifecycle";
import type { Product } from "./types";

function uniquePresent(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getProductStandard(product: Product): string | null | undefined {
  return product.scope?.standard ?? product.epd?.standard;
}

function getProductScope(product: Product): string | null | undefined {
  return product.scope?.description ?? product.epd?.scope;
}

export function getComparabilityWarnings(products: Product[]): string[] {
  if (products.length < 2) {
    return ["Select at least two products to assess comparability."];
  }

  const warnings: string[] = [];
  const units = uniquePresent(products.map((product) => product.declaredUnit));
  const standards = uniquePresent(products.map(getProductStandard));
  const scopes = uniquePresent(products.map(getProductScope));

  if (units.length > 1) {
    warnings.push(`Declared units differ: ${units.join("; ")}.`);
  }

  if (standards.length > 1) {
    warnings.push(`EPD standards differ: ${standards.join("; ")}.`);
  }

  if (scopes.length > 1) {
    warnings.push("Lifecycle scopes differ. Compare stage by stage, not just totals.");
  }

  const notDeclared = new Set<string>();
  const missing = new Set<string>();

  for (const product of products) {
    for (const lifecycleModule of LIFECYCLE_MODULES) {
      const stage = getStage(product, lifecycleModule);

      if (!stage || stage.status === "missing") {
        missing.add(lifecycleModule);
        continue;
      }

      if (stage.status === "not_declared") {
        notDeclared.add(lifecycleModule);
      }
    }
  }

  if (notDeclared.size > 0) {
    warnings.push(
      `Not declared in at least one selected EPD: ${[...notDeclared].join(", ")}.`,
    );
  }

  if (missing.size > 0) {
    warnings.push(
      `Missing from extracted data for at least one selected product: ${[
        ...missing,
      ].join(", ")}.`,
    );
  }

  return warnings.length > 0
    ? warnings
    : ["Selected products use matching units, standards, and extracted stage coverage."];
}
