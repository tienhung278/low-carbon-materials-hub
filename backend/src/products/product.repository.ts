import { Inject, Injectable, Optional } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  CarbonProvenance,
  CarbonStage,
  EpdMetadata,
  LoaderDiagnostic,
  ProductRecord,
  ProductSnapshot,
} from './types';

export const DATA_DIRECTORY = Symbol('DATA_DIRECTORY');
const ALLOWED_STAGE_STATUSES = new Set(['declared', 'not_declared', 'missing']);
const PRODUCT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NOT_DECLARED_EVIDENCE_PATTERN =
  /(?:\bND\b|not declared|system boundary|modules declared)/i;

@Injectable()
export class ProductRepository {
  private readonly snapshot: ProductSnapshot;

  constructor(@Optional() @Inject(DATA_DIRECTORY) dataDirectory?: string) {
    this.snapshot = loadProducts(dataDirectory ?? findDataDirectory());
  }

  getSnapshot(): ProductSnapshot {
    return this.snapshot;
  }

  getProducts(): ProductRecord[] {
    return this.snapshot.products;
  }

  findProduct(id: string): ProductRecord | undefined {
    return this.snapshot.products.find((product) => product.id === id);
  }
}

function loadProducts(dataDirectory: string | null): ProductSnapshot {
  const products: ProductRecord[] = [];
  const diagnostics: LoaderDiagnostic[] = [];

  if (!dataDirectory) {
    return { documentCount: 0, products, diagnostics };
  }

  const files = readdirSync(dataDirectory)
    .filter((file) => file.endsWith('.json'))
    .sort();

  for (const file of files) {
    const fullPath = join(dataDirectory, file);
    let raw: unknown;

    try {
      raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
    } catch (error) {
      diagnostics.push({
        file,
        path: '$',
        message: `Invalid JSON: ${getErrorMessage(error)}`,
      });
      continue;
    }

    const rawProducts = getRecord(raw).products;
    if (!isUnknownArray(rawProducts)) {
      diagnostics.push({
        file,
        path: '$.products',
        message: 'Expected products to be an array',
      });
      continue;
    }

    rawProducts.forEach((rawProduct, index) => {
      const result = normalizeProduct(raw, rawProduct, file, index);
      if ('product' in result) {
        products.push(result.product);
      } else {
        diagnostics.push(result.diagnostic);
      }
    });
  }

  return { documentCount: files.length, products, diagnostics };
}

function normalizeProduct(
  rawDocument: unknown,
  rawProduct: unknown,
  file: string,
  productIndex: number,
): { product: ProductRecord } | { diagnostic: LoaderDiagnostic } {
  const path = `$.products[${productIndex}]`;
  const product = getRecord(rawProduct);
  const epd = normalizeEpdMetadata(rawDocument, product);

  const id = product.id;

  if (!isNonEmptyString(id)) {
    return invalidStringDiagnostic(file, path, 'id');
  }

  if (!PRODUCT_ID_PATTERN.test(id)) {
    return {
      diagnostic: {
        file,
        path: `${path}.id`,
        message: 'Expected id to be a lowercase slug',
      },
    };
  }

  const productName = normalizeNullableString(product.productName);
  if ('diagnostic' in productName)
    return { diagnostic: nullableStringDiagnostic(file, path, 'productName') };

  const manufacturer = normalizeNullableString(product.manufacturer);
  if ('diagnostic' in manufacturer)
    return { diagnostic: nullableStringDiagnostic(file, path, 'manufacturer') };

  const manufacturingLocation = normalizeNullableString(
    product.manufacturingLocation,
  );
  if ('diagnostic' in manufacturingLocation)
    return {
      diagnostic: nullableStringDiagnostic(file, path, 'manufacturingLocation'),
    };

  const declaredUnit = normalizeNullableString(product.declaredUnit);
  if ('diagnostic' in declaredUnit)
    return { diagnostic: nullableStringDiagnostic(file, path, 'declaredUnit') };

  const strengthMpa = product.strengthMpa;
  if (strengthMpa !== null && !isFiniteNumber(strengthMpa)) {
    return {
      diagnostic: {
        file,
        path: `${path}.strengthMpa`,
        message: 'Expected strengthMpa to be a finite number or null',
      },
    };
  }

  const declaredUnitMassKg = product.declaredUnitMassKg;
  if (
    declaredUnitMassKg !== undefined &&
    declaredUnitMassKg !== null &&
    !isFiniteNumber(declaredUnitMassKg)
  ) {
    return {
      diagnostic: {
        file,
        path: `${path}.declaredUnitMassKg`,
        message: 'Expected declaredUnitMassKg to be a finite number or null',
      },
    };
  }

  const rawStages = product.carbonStages;
  if (!isUnknownArray(rawStages)) {
    return {
      diagnostic: {
        file,
        path: `${path}.carbonStages`,
        message: 'Expected carbonStages to be an array',
      },
    };
  }

  const carbonStages: CarbonStage[] = [];
  for (let index = 0; index < rawStages.length; index += 1) {
    const result = normalizeStage(
      rawStages[index],
      file,
      `${path}.carbonStages[${index}]`,
    );

    if ('diagnostic' in result) {
      return { diagnostic: result.diagnostic };
    }

    carbonStages.push(result.stage);
  }

  return {
    product: {
      id,
      productName: productName.value,
      manufacturer: manufacturer.value,
      manufacturingLocation: manufacturingLocation.value,
      strengthMpa,
      declaredUnit: declaredUnit.value,
      declaredUnitMassKg: declaredUnitMassKg ?? null,
      epd,
      carbonStages,
    },
  };
}

function normalizeStage(
  rawStage: unknown,
  file: string,
  path: string,
): { stage: CarbonStage } | { diagnostic: LoaderDiagnostic } {
  const stage = getRecord(rawStage);

  const module = stage.module;
  const indicator = stage.indicator;
  const unit = stage.unit;
  const status = stage.status;

  if (!isNonEmptyString(module)) {
    return invalidStringDiagnostic(file, path, 'module');
  }

  if (!isNonEmptyString(indicator)) {
    return invalidStringDiagnostic(file, path, 'indicator');
  }

  if (!isNonEmptyString(unit)) {
    return invalidStringDiagnostic(file, path, 'unit');
  }

  if (!isNonEmptyString(status)) {
    return invalidStringDiagnostic(file, path, 'status');
  }

  if (!ALLOWED_STAGE_STATUSES.has(status)) {
    return {
      diagnostic: {
        file,
        path: `${path}.status`,
        message: `Invalid carbon stage status: ${status}`,
      },
    };
  }

  const value = stage.value;
  if (status === 'declared' && !isFiniteNumber(value)) {
    return {
      diagnostic: {
        file,
        path: `${path}.value`,
        message: 'Declared carbon stages require a finite numeric value',
      },
    };
  }

  if (status !== 'declared' && value !== null) {
    return {
      diagnostic: {
        file,
        path: `${path}.value`,
        message: `${status} carbon stages require a null value`,
      },
    };
  }

  const normalizedValue: number | null =
    status === 'declared' && isFiniteNumber(value) ? value : null;
  const provenance = normalizeProvenance(stage.provenance);
  if (status === 'declared' && !provenance?.pdfFile) {
    return {
      diagnostic: {
        file,
        path: `${path}.provenance.pdfFile`,
        message: 'Declared carbon values require source PDF provenance',
      },
    };
  }

  if (
    status === 'not_declared' &&
    !NOT_DECLARED_EVIDENCE_PATTERN.test(provenance?.excerpt ?? '')
  ) {
    return {
      diagnostic: {
        file,
        path: `${path}.provenance.excerpt`,
        message:
          'Not declared carbon stages require explicit ND or system-boundary evidence',
      },
    };
  }

  return {
    stage: {
      module,
      indicator,
      unit,
      value: normalizedValue,
      status,
      provenance,
    },
  };
}

function normalizeEpdMetadata(
  rawDocument: unknown,
  product: Record<string, unknown>,
): EpdMetadata {
  const document = getRecord(rawDocument);
  const rawEpd = getRecord(document.epd);
  const source = getRecord(document.source);
  const productScope = getRecord(product.scope);

  return {
    id: stringOrNull(rawEpd.id ?? deriveIdFromFile(source.pdf)),
    registrationNumber: stringOrNull(rawEpd.registrationNumber),
    pdfFile: stringOrNull(rawEpd.pdfFile ?? source.pdf),
    programOperator: stringOrNull(rawEpd.programOperator),
    standard: stringOrNull(rawEpd.standard ?? productScope.standard),
    scope: stringOrNull(rawEpd.scope ?? productScope.description),
    publishedDate: stringOrNull(rawEpd.publishedDate),
    validUntil: stringOrNull(rawEpd.validUntil),
  };
}

function normalizeProvenance(value: unknown): CarbonProvenance | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const provenance = value as Record<string, unknown>;
  return {
    pdfFile: stringOrNull(provenance.pdfFile ?? provenance.pdf),
    page: numberOrNull(provenance.page ?? provenance.sourcePage),
    table: stringOrNull(provenance.table ?? provenance.tableLabel),
    excerpt: stringOrNull(provenance.excerpt ?? provenance.quote),
  };
}

function findDataDirectory(): string | null {
  const candidates = [
    process.env.DATA_DIR,
    resolve(process.cwd(), 'backend', 'data'),
    basename(process.cwd()) === 'backend'
      ? resolve(process.cwd(), 'data')
      : null,
    resolve(__dirname, '..', 'data'),
    resolve(__dirname, '..', '..', 'data'),
  ].filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.length > 0,
  );

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function deriveIdFromFile(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return basename(value, '.pdf');
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function invalidStringDiagnostic(
  file: string,
  path: string,
  field: string,
): { diagnostic: LoaderDiagnostic } {
  return {
    diagnostic: {
      file,
      path: `${path}.${field}`,
      message: `Expected ${field} to be a non-empty string`,
    },
  };
}

function nullableStringDiagnostic(
  file: string,
  path: string,
  field: string,
): LoaderDiagnostic {
  return {
    file,
    path: `${path}.${field}`,
    message: `Expected ${field} to be a string, null, or undefined`,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeNullableString(
  value: unknown,
): { value: string | null } | { diagnostic: true } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== 'string') {
    return { diagnostic: true };
  }

  const trimmed = value.trim();
  return { value: trimmed.length > 0 ? trimmed : null };
}

function stringOrNull(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
