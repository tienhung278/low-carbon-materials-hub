import { BadRequestException } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { ProductRecord } from './types';

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    service = new ProductService(repositoryWith([productA(), productB()]));
  });

  it('filters products by strength, location, and manufacturer', () => {
    const results = service.listProducts({
      strengthMin: 30,
      strengthMax: 40,
      location: 'brisbane',
      manufacturer: 'heidelberg',
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p-b');
    expect(results[0].strengthMpa).toBe(32);
    expect(results[0].a1a3GwpTotal?.value).toBe(145);
  });

  it('keeps null-strength products unless a numeric strength filter is used', () => {
    service = new ProductService(
      repositoryWith([
        productA(),
        productB(),
        productA({ id: 'p-null', strengthMpa: null }),
      ]),
    );

    expect(service.listProducts().map((product) => product.id)).toEqual([
      'p-a',
      'p-b',
      'p-null',
    ]);
    expect(
      service
        .listProducts({ manufacturer: 'hymix' })
        .map((product) => product.id),
    ).toEqual(['p-a', 'p-null']);
    expect(
      service.listProducts({ strengthMin: 20 }).map((product) => product.id),
    ).toEqual(['p-a', 'p-b']);
    expect(
      service.listProducts({ strengthMax: 30 }).map((product) => product.id),
    ).toEqual(['p-a']);
  });

  it('keeps null metadata products visible but excludes them from text filters', () => {
    service = new ProductService(
      repositoryWith([
        productA(),
        productA({
          id: 'p-null-meta',
          productName: null,
          manufacturer: null,
          manufacturingLocation: null,
          declaredUnit: null,
        }),
      ]),
    );

    expect(service.listProducts().map((product) => product.id)).toEqual([
      'p-a',
      'p-null-meta',
    ]);
    expect(
      service
        .listProducts({ manufacturer: 'hymix' })
        .map((product) => product.id),
    ).toEqual(['p-a']);
    expect(
      service
        .listProducts({ location: 'gold coast' })
        .map((product) => product.id),
    ).toEqual(['p-a']);
    expect(service.getFilters()).toEqual({
      strengths: [25],
      locations: ['Gold Coast, Queensland, Australia'],
      manufacturers: ['Hymix'],
    });
  });

  it('returns available filter values sorted and deduplicated', () => {
    expect(service.getFilters()).toEqual({
      strengths: [25, 32],
      locations: [
        'Brisbane, Queensland, Australia',
        'Gold Coast, Queensland, Australia',
      ],
      manufacturers: ['Heidelberg Materials', 'Hymix'],
    });
  });

  it('flags summaries with missing or not declared A1-A3 values', () => {
    service = new ProductService(
      repositoryWith([
        productA({
          carbonStages: [
            stage({
              module: 'A1-A3',
              value: null,
              status: 'not_declared',
            }),
          ],
        }),
      ]),
    );

    const summary = service.listProducts()[0];

    expect(summary.a1a3GwpTotal).toBeNull();
    expect(summary.warningFlags).toEqual([
      'not-declared-a1-a3-gwp-total',
      'has-missing-or-not-declared-stages',
    ]);
  });

  it('returns full normalized product details', () => {
    const product = service.getProduct('p-a');

    expect(product?.id).toBe('p-a');
    expect(product?.epd.pdfFile).toBe('a.pdf');
    expect(product?.carbonStages.map((stage) => stage.module)).toContain(
      'A1-A3',
    );
  });

  it('compares products by lifecycle modules with provenance and warnings', () => {
    service = new ProductService(
      repositoryWith([
        productA(),
        productB({
          declaredUnit: '1 tonne',
          carbonStages: [
            stage({ module: 'A1-A3', value: null, status: 'not_declared' }),
            stage({ module: 'A4', value: 3.4 }),
          ],
        }),
      ]),
    );

    const comparison = service.compareProducts(['p-a', 'p-b']);

    expect(comparison.lifecycleModules).toEqual([
      {
        module: 'A1-A3',
        products: [
          expect.objectContaining({
            productId: 'p-a',
            value: 141,
            status: 'declared',
            provenance: {
              pdfFile: 'a.pdf',
              page: 18,
              table: 'Core indicators',
              excerpt: 'GWP-total row',
            },
          }),
          expect.objectContaining({
            productId: 'p-b',
            value: null,
            status: 'not_declared',
          }),
        ],
      },
      {
        module: 'A4',
        products: [
          expect.objectContaining({
            productId: 'p-a',
            value: null,
            status: 'missing',
          }),
          expect.objectContaining({
            productId: 'p-b',
            value: 3.4,
            status: 'declared',
          }),
        ],
      },
    ]);
    expect(comparison.warnings).toEqual(
      expect.arrayContaining([
        'Products use different declared units.',
        'A1-A3 GWP-total is missing or not declared for p-b.',
        'A4 GWP-total is missing or not declared for p-a.',
      ]),
    );
  });

  it('warns when compared products have unknown declared units', () => {
    service = new ProductService(
      repositoryWith([productA(), productB({ declaredUnit: null })]),
    );

    expect(service.compareProducts(['p-a', 'p-b']).warnings).toContain(
      'Declared unit is missing for p-b.',
    );
  });

  it('rejects unknown compare ids', () => {
    expect(() => service.compareProducts(['p-a', 'missing'])).toThrow(
      BadRequestException,
    );
  });
});

function repositoryWith(products: ProductRecord[]): ProductRepository {
  return {
    getSnapshot: () => ({
      documentCount: 1,
      products,
      diagnostics: [],
    }),
    getProducts: () => products,
    findProduct: (id: string) => products.find((product) => product.id === id),
  } as ProductRepository;
}

function productA(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: 'p-a',
    productName: 'HyLo 25',
    manufacturer: 'Hymix',
    manufacturingLocation: 'Gold Coast, Queensland, Australia',
    strengthMpa: 25,
    declaredUnit: '1 m3',
    declaredUnitMassKg: 2315,
    epd: {
      id: 'epd-a',
      registrationNumber: 'IES-A',
      pdfFile: 'a.pdf',
      programOperator: 'EPD Australasia',
      standard: 'EN 15804:A2',
      scope: 'cradle-to-grave',
      publishedDate: '2025-01-01',
      validUntil: '2030-01-01',
    },
    carbonStages: [stage({ value: 141, provenancePdfFile: 'a.pdf' })],
    ...overrides,
  };
}

function productB(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    ...productA({
      id: 'p-b',
      productName: 'GE322',
      manufacturer: 'Heidelberg Materials',
      manufacturingLocation: 'Brisbane, Queensland, Australia',
      strengthMpa: 32,
      epd: {
        ...productA().epd,
        id: 'epd-b',
        pdfFile: 'b.pdf',
      },
      carbonStages: [stage({ value: 145, provenancePdfFile: 'b.pdf' })],
    }),
    ...overrides,
  };
}

function stage(
  overrides: {
    module?: string;
    value?: number | null;
    status?: string;
    provenancePdfFile?: string;
  } = {},
) {
  return {
    module: overrides.module ?? 'A1-A3',
    indicator: 'GWP-total',
    unit: 'kg CO2 eq.',
    value: Object.hasOwn(overrides, 'value') ? overrides.value : 141,
    status: overrides.status ?? 'declared',
    provenance: {
      pdfFile: overrides.provenancePdfFile ?? 'a.pdf',
      page: 18,
      table: 'Core indicators',
      excerpt: 'GWP-total row',
    },
  };
}
