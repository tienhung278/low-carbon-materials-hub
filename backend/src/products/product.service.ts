import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import {
  CarbonStage,
  ProductFilters,
  ProductRecord,
  ProductSummary,
} from './types';

const GWP_TOTAL = 'GWP-total';
const A1_A3 = 'A1-A3';
const MODULE_ORDER = [
  'A1-A3',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B7',
  'C1',
  'C2',
  'C3',
  'C4',
  'D',
];

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  listProducts(filters: ProductFilters = {}): ProductSummary[] {
    return this.productRepository
      .getProducts()
      .filter((product) => matchesFilters(product, filters))
      .map((product) => toSummary(product));
  }

  getFilters() {
    const products = this.productRepository.getProducts();

    return {
      strengths: uniqueSortedNumbers(
        products
          .map((product) => product.strengthMpa)
          .filter((strength): strength is number => strength !== null),
      ),
      locations: uniqueSortedStrings(
        products.map((product) => product.manufacturingLocation),
      ),
      manufacturers: uniqueSortedStrings(
        products.map((product) => product.manufacturer),
      ),
    };
  }

  getProduct(id: string): ProductRecord | undefined {
    return this.productRepository.findProduct(id);
  }

  compareProducts(ids: string[]) {
    const products = ids.map((id) => {
      const product = this.productRepository.findProduct(id);
      if (!product) {
        throw new BadRequestException(`Unknown product id: ${id}`);
      }

      return product;
    });

    const modules = sortModules(
      uniqueSortedStrings(
        products.flatMap((product) =>
          product.carbonStages
            .filter((stage) => stage.indicator === GWP_TOTAL)
            .map((stage) => stage.module),
        ),
      ),
    );

    return {
      products: products.map((product) => toSummary(product)),
      lifecycleModules: modules.map((module) => ({
        module,
        products: products.map((product) =>
          stageForComparison(product, module),
        ),
      })),
      warnings: compareWarnings(products, modules),
    };
  }
}

function matchesFilters(
  product: ProductRecord,
  filters: ProductFilters,
): boolean {
  if (
    filters.strengthMin !== undefined &&
    (product.strengthMpa === null || product.strengthMpa < filters.strengthMin)
  ) {
    return false;
  }

  if (
    filters.strengthMax !== undefined &&
    (product.strengthMpa === null || product.strengthMpa > filters.strengthMax)
  ) {
    return false;
  }

  if (
    filters.location &&
    !(product.manufacturingLocation ?? '')
      .toLowerCase()
      .includes(filters.location.toLowerCase())
  ) {
    return false;
  }

  if (
    filters.manufacturer &&
    !(product.manufacturer ?? '')
      .toLowerCase()
      .includes(filters.manufacturer.toLowerCase())
  ) {
    return false;
  }

  return true;
}

function toSummary(product: ProductRecord): ProductSummary {
  const a1a3 = findGwpStage(product, A1_A3);
  const warningFlags: string[] = [];

  if (!a1a3) {
    warningFlags.push('missing-a1-a3-gwp-total');
  } else if (a1a3.status !== 'declared' || a1a3.value === null) {
    warningFlags.push('not-declared-a1-a3-gwp-total');
  }

  if (
    product.carbonStages.some(
      (stage) => stage.status !== 'declared' || stage.value === null,
    )
  ) {
    warningFlags.push('has-missing-or-not-declared-stages');
  }

  return {
    id: product.id,
    productName: product.productName,
    manufacturer: product.manufacturer,
    manufacturingLocation: product.manufacturingLocation,
    strengthMpa: product.strengthMpa,
    declaredUnit: product.declaredUnit,
    declaredUnitMassKg: product.declaredUnitMassKg,
    epd: product.epd,
    a1a3GwpTotal:
      a1a3?.status === 'declared' && a1a3.value !== null ? a1a3 : null,
    warningFlags,
  };
}

function findGwpStage(
  product: ProductRecord,
  module: string,
): CarbonStage | undefined {
  return product.carbonStages.find(
    (stage) => stage.module === module && stage.indicator === GWP_TOTAL,
  );
}

function stageForComparison(product: ProductRecord, module: string) {
  const stage = findGwpStage(product, module);

  return {
    productId: product.id,
    value: stage?.value ?? null,
    status: stage?.status ?? 'missing',
    unit: stage?.unit ?? null,
    provenance: stage?.provenance ?? null,
  };
}

function compareWarnings(
  products: ProductRecord[],
  modules: string[],
): string[] {
  const warnings: string[] = [];

  const declaredUnits = products
    .map((product) => product.declaredUnit)
    .filter(isNonEmptyString);
  if (new Set(declaredUnits).size > 1) {
    warnings.push('Products use different declared units.');
  }

  const missingDeclaredUnits = products.filter(
    (product) => !isNonEmptyString(product.declaredUnit),
  );
  if (missingDeclaredUnits.length > 0) {
    warnings.push(
      `Declared unit is missing for ${missingDeclaredUnits
        .map((product) => product.id)
        .join(', ')}.`,
    );
  }

  if (
    new Set(products.map((product) => product.epd.standard).filter(Boolean))
      .size > 1
  ) {
    warnings.push('Products cite different EPD standards.');
  }

  const missingA1A3 = products.filter((product) => {
    const stage = findGwpStage(product, A1_A3);
    return !stage || stage.status !== 'declared' || stage.value === null;
  });

  if (missingA1A3.length > 0) {
    warnings.push(
      `A1-A3 GWP-total is missing or not declared for ${missingA1A3
        .map((product) => product.id)
        .join(', ')}.`,
    );
  }

  for (const module of modules) {
    const missing = products.filter((product) => {
      const stage = findGwpStage(product, module);
      return !stage || stage.status !== 'declared' || stage.value === null;
    });

    if (missing.length > 0) {
      warnings.push(
        `${module} GWP-total is missing or not declared for ${missing
          .map((product) => product.id)
          .join(', ')}.`,
      );
    }
  }

  return uniqueSortedStrings(warnings);
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniqueSortedStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter(isNonEmptyString))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sortModules(modules: string[]): string[] {
  return [...modules].sort((left, right) => {
    const leftIndex = MODULE_ORDER.indexOf(left);
    const rightIndex = MODULE_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}
