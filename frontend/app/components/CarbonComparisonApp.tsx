"use client";

import { useMemo, useState } from "react";
import { getComparabilityWarnings } from "../../lib/comparability";
import { filterProducts, getFilterOptions } from "../../lib/filtering";
import {
  formatCarbonValue,
  formatProvenance,
  getProvenanceSource,
  formatStrength,
  getStatusLabel,
  getStatusTone,
} from "../../lib/formatting";
import {
  LIFECYCLE_MODULES,
  getA1A3,
  getModuleGroup,
  getStage,
  sortByHeadlineCarbon,
} from "../../lib/lifecycle";
import type { Product, ProductFilters } from "../../lib/types";

const maxSelectedProducts = 4;

type CarbonComparisonAppProps = {
  products: Product[];
};

function defaultSelection(products: Product[]): string[] {
  return sortByHeadlineCarbon(products)
    .slice(0, 3)
    .map((product) => product.id);
}

function productName(product: Product): string {
  return product.productName ?? "Unknown product";
}

function manufacturerName(product: Product): string {
  return product.manufacturer ?? "Unknown manufacturer";
}

function manufacturingLocation(product: Product): string {
  return product.manufacturingLocation ?? "Unknown location";
}

function declaredUnit(product: Product): string {
  return product.declaredUnit ?? "Unknown declared unit";
}

export default function CarbonComparisonApp({
  products,
}: CarbonComparisonAppProps) {
  const sortedProducts = useMemo(() => sortByHeadlineCarbon(products), [products]);
  const [filters, setFilters] = useState<ProductFilters>({
    strength: "all",
    location: "all",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(
    defaultSelection(sortedProducts),
  );
  const options = useMemo(() => getFilterOptions(sortedProducts), [sortedProducts]);
  const filteredProducts = useMemo(
    () => filterProducts(sortedProducts, filters),
    [filters, sortedProducts],
  );
  const selectedProducts = useMemo(
    () =>
      selectedIds
        .map((id) => sortedProducts.find((product) => product.id === id))
        .filter((product): product is Product => Boolean(product)),
    [selectedIds, sortedProducts],
  );
  const warnings = useMemo(
    () => getComparabilityWarnings(selectedProducts),
    [selectedProducts],
  );

  function updateFilter(key: keyof ProductFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleProduct(productId: string) {
    setSelectedIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }

      if (current.length >= maxSelectedProducts) {
        return [...current.slice(1), productId];
      }

      return [...current, productId];
    });
  }

  function clearFilters() {
    setFilters({ strength: "all", location: "all" });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Low Carbon Materials Hub
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
              Concrete embodied carbon comparison
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Compare declared GWP-total values by lifecycle module. Not declared
              and missing data are labelled separately and excluded from numeric
              comparisons.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
            <div className="border border-slate-200 bg-white px-3 py-2">
              <div className="text-lg font-semibold text-slate-950">
                {products.length}
              </div>
              products
            </div>
            <div className="border border-slate-200 bg-white px-3 py-2">
              <div className="text-lg font-semibold text-slate-950">
                {options.strengths.length}
              </div>
              strengths
            </div>
            <div className="border border-slate-200 bg-white px-3 py-2">
              <div className="text-lg font-semibold text-slate-950">
                {selectedProducts.length}
              </div>
              selected
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <section className="border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">Filters</h2>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
              <label className="mt-3 block text-xs font-medium text-slate-600">
                Compressive strength
                <select
                  value={filters.strength}
                  onChange={(event) => updateFilter("strength", event.target.value)}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                >
                  <option value="all">All strengths</option>
                  {options.strengths.map((strength) => (
                    <option key={strength} value={strength}>
                      {formatStrength(strength)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs font-medium text-slate-600">
                Manufacturing location
                <select
                  value={filters.location}
                  onChange={(event) => updateFilter("location", event.target.value)}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                >
                  <option value="all">All locations</option>
                  {options.locations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">
                  Products
                </h2>
                <span className="text-xs text-slate-500">
                  {filteredProducts.length} shown
                </span>
              </div>
              <div className="max-h-[680px] overflow-auto">
                {filteredProducts.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-600">
                    No products match the current filters.
                  </p>
                ) : (
                  filteredProducts.map((product) => {
                    const selected = selectedIds.includes(product.id);
                    const headline = getA1A3(product);
                    const headlineStage = getStage(product, "A1-A3");
                    const headlineSource = getProvenanceSource(
                      headlineStage?.provenance,
                    );

                    return (
                      <label
                        key={product.id}
                        className={`flex cursor-pointer gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50 ${
                          selected ? "bg-emerald-50" : "bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product.id)}
                          className="mt-1 h-4 w-4 accent-emerald-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-950">
                            {productName(product)}
                          </span>
                          <span className="mt-1 block text-xs text-slate-600">
                            {manufacturerName(product)} | {formatStrength(product.strengthMpa)}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {manufacturingLocation(product)}
                          </span>
                          <span className="mt-2 inline-flex border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                            A1-A3:{" "}
                            {headline === null
                              ? "Missing"
                              : `${headline.toFixed(0)} kg CO2 eq.`}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            Source: {headlineSource || "No provenance supplied"}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>
          </aside>

          <section className="min-w-0 border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">
                    Stage-by-stage comparison
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Select up to {maxSelectedProducts} products. A new selection
                    replaces the oldest when the limit is reached.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                    Declared
                  </span>
                  <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    ND: not declared
                  </span>
                  <span className="border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
                    Missing
                  </span>
                </div>
              </div>
              <div className="mt-3 border border-amber-200 bg-amber-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">
                  Comparability warnings
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-amber-950">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-600">
                  <tr>
                    <th className="sticky left-0 z-10 w-24 border-b border-slate-200 bg-slate-100 px-3 py-3">
                      Module
                    </th>
                    <th className="w-36 border-b border-slate-200 px-3 py-3">
                      Stage
                    </th>
                    {selectedProducts.map((product) => (
                      <th
                        key={product.id}
                        className="min-w-[260px] border-b border-slate-200 px-3 py-3 align-top"
                      >
                        <span className="block normal-case tracking-normal text-slate-950">
                          {productName(product)}
                        </span>
                        <span className="mt-1 block normal-case tracking-normal text-slate-500">
                          {formatStrength(product.strengthMpa)} |{" "}
                          {declaredUnit(product)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LIFECYCLE_MODULES.map((module) => (
                    <tr key={module} className="border-b border-slate-100">
                      <th className="sticky left-0 z-10 bg-white px-3 py-3 text-sm font-semibold text-slate-950">
                        {module}
                      </th>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {getModuleGroup(module)}
                      </td>
                      {selectedProducts.map((product) => {
                        const stage = getStage(product, module);
                        const declared =
                          stage?.status === "declared" &&
                          typeof stage.value === "number";

                        return (
                          <td key={`${product.id}-${module}`} className="px-3 py-3 align-top">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-mono text-lg font-semibold text-slate-950">
                                  {formatCarbonValue(stage)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {declared ? stage?.unit ?? "kg CO2 eq." : "No numeric value"}
                                </div>
                              </div>
                              <span
                                className={`whitespace-nowrap border px-2 py-1 text-xs font-medium ${getStatusTone(stage)}`}
                              >
                                {getStatusLabel(stage)}
                              </span>
                            </div>
                            <details className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600">
                              <summary className="cursor-pointer font-medium text-slate-700">
                                Source EPD
                              </summary>
                              <p className="mt-2 leading-5">
                                {formatProvenance(stage?.provenance)}
                              </p>
                            </details>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
