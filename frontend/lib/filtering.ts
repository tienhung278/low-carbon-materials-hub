import type { Product, ProductFilters } from "./types";

export function getFilterOptions(products: Product[]) {
  const strengths = new Set<number>();
  const locations = new Set<string>();

  for (const product of products) {
    if (typeof product.strengthMpa === "number") {
      strengths.add(product.strengthMpa);
    }

    if (product.manufacturingLocation) {
      locations.add(product.manufacturingLocation);
    }
  }

  return {
    strengths: [...strengths].sort((left, right) => left - right),
    locations: [...locations].sort((left, right) => left.localeCompare(right)),
  };
}

export function filterProducts(
  products: Product[],
  filters: ProductFilters,
): Product[] {
  return products.filter((product) => {
    const matchesStrength =
      filters.strength === "all" ||
      String(product.strengthMpa) === filters.strength;
    const matchesLocation =
      filters.location === "all" ||
      product.manufacturingLocation === filters.location;

    return matchesStrength && matchesLocation;
  });
}

