import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductRepository } from './product.repository';

describe('ProductRepository', () => {
  let dataDirectory: string;
  const originalCwd = process.cwd();
  const originalDataDir = process.env.DATA_DIR;

  beforeEach(() => {
    dataDirectory = mkdtempSync(join(tmpdir(), 'lcmh-data-'));
    delete process.env.DATA_DIR;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  it('loads expected contract data and normalizes provenance', () => {
    writeJson('valid.json', {
      epd: {
        id: 'epd-1',
        registrationNumber: 'IES-1',
        pdfFile: 'source.pdf',
        programOperator: 'EPD Australasia',
        standard: 'EN 15804:A2',
        scope: 'cradle-to-grave',
        publishedDate: '2025-01-01',
        validUntil: '2030-01-01',
      },
      products: [productFixture()],
    });

    const repository = new ProductRepository(dataDirectory);
    const snapshot = repository.getSnapshot();

    expect(snapshot.documentCount).toBe(1);
    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.products[0].epd).toMatchObject({
      id: 'epd-1',
      pdfFile: 'source.pdf',
      standard: 'EN 15804:A2',
    });
    expect(snapshot.products[0].carbonStages[0].provenance).toEqual({
      pdfFile: 'source.pdf',
      page: 12,
      table: 'Indicators',
      excerpt: 'GWP-total 120',
    });
    expect(repository.findProduct('p1')?.productName).toBe('Concrete 25 MPa');
  });

  it('loads backend-local data by default when cwd is backend', () => {
    process.chdir(resolve(__dirname, '..', '..'));

    const snapshot = new ProductRepository().getSnapshot();

    expect(snapshot.documentCount).toBe(20);
    expect(snapshot.products.length).toBeGreaterThan(0);
    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.products.map((product) => product.id)).toContain(
      'envirocrete-40-32mpa',
    );
  });

  it('uses DATA_DIR before backend-local data', () => {
    writeJson('override.json', {
      products: [productFixture({ id: 'data-dir-product' })],
    });
    process.env.DATA_DIR = dataDirectory;
    process.chdir(resolve(__dirname, '..', '..'));

    const snapshot = new ProductRepository().getSnapshot();

    expect(snapshot.documentCount).toBe(1);
    expect(snapshot.products.map((product) => product.id)).toEqual([
      'data-dir-product',
    ]);
  });

  it('loads extraction-shaped data without coercing not declared nulls', () => {
    writeJson('legacy.json', {
      source: { pdf: 'legacy.pdf' },
      products: [
        {
          ...productFixture(),
          scope: {
            description: 'A1-A3 only',
            standard: 'PCR 2019:14',
          },
          carbonStages: [
            {
              module: 'A1-A3',
              indicator: 'GWP-total',
              unit: 'kg CO2 eq.',
              value: null,
              status: 'not_declared',
              provenance: {
                pdf: 'legacy.pdf',
                sourcePage: 7,
                tableLabel: 'Indicators',
                quote: 'ND',
              },
            },
          ],
        },
      ],
    });

    const product = new ProductRepository(dataDirectory).getProducts()[0];

    expect(product.epd.pdfFile).toBe('legacy.pdf');
    expect(product.epd.standard).toBe('PCR 2019:14');
    expect(product.carbonStages[0]).toMatchObject({
      value: null,
      status: 'not_declared',
    });
  });

  it('loads products with null strength values', () => {
    writeJson('null-strength.json', {
      products: [productFixture({ strengthMpa: null })],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.products[0].strengthMpa).toBeNull();
  });

  it('loads nullable product metadata and empty carbon stage arrays', () => {
    writeJson('partial.json', {
      products: [
        productFixture({
          productName: null,
          manufacturer: '',
          manufacturingLocation: null,
          declaredUnit: '',
          carbonStages: [],
        }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.products[0]).toMatchObject({
      productName: null,
      manufacturer: null,
      manufacturingLocation: null,
      declaredUnit: null,
      carbonStages: [],
    });
  });

  it('skips malformed product records with a clear error path', () => {
    writeJson('mixed.json', {
      epd: { pdfFile: 'source.pdf' },
      products: [
        productFixture({ id: 'valid-product' }),
        productFixture({ id: '', strengthMpa: '25' }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products.map((product) => product.id)).toEqual([
      'valid-product',
    ]);
    expect(snapshot.diagnostics).toEqual([
      {
        file: 'mixed.json',
        path: '$.products[1].id',
        message: 'Expected id to be a non-empty string',
      },
    ]);
  });

  it('skips product records with malformed slug ids', () => {
    writeJson('malformed-id.json', {
      products: [productFixture({ id: '../bad id' })],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({
      path: '$.products[0].id',
      message: 'Expected id to be a lowercase slug',
    });
  });

  it('skips declared values without PDF provenance', () => {
    writeJson('bad-provenance.json', {
      products: [
        productFixture({
          carbonStages: [
            {
              module: 'A1-A3',
              indicator: 'GWP-total',
              unit: 'kg CO2 eq.',
              value: 1,
              status: 'declared',
              provenance: { page: 1 },
            },
          ],
        }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({
      path: '$.products[0].carbonStages[0].provenance.pdfFile',
    });
  });

  it('reports document-level parse and shape errors', () => {
    writeFileSync(join(dataDirectory, 'invalid.json'), '{', 'utf8');
    writeJson('missing-products.json', { epd: { pdfFile: 'source.pdf' } });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        file: 'invalid.json',
        path: '$',
      }),
      {
        file: 'missing-products.json',
        path: '$.products',
        message: 'Expected products to be an array',
      },
    ]);
  });

  it.each([
    ['productName', { productName: 12 }],
    ['manufacturer', { manufacturer: 12 }],
    ['manufacturingLocation', { manufacturingLocation: 12 }],
    ['declaredUnit', { declaredUnit: 12 }],
    ['strengthMpa', { strengthMpa: '25' }],
    ['declaredUnitMassKg', { declaredUnitMassKg: 'heavy' }],
    ['carbonStages', { carbonStages: null }],
  ])('skips product records with invalid %s', (field, overrides) => {
    writeJson(`${field}.json`, {
      products: [productFixture(overrides)],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0].path).toBe(`$.products[0].${field}`);
  });

  it.each([
    ['module', { module: '' }],
    ['indicator', { indicator: '' }],
    ['unit', { unit: '' }],
    ['status', { status: '' }],
    ['status', { status: 'estimated' }],
    ['value', { value: 'ND' }],
  ])('skips product records with invalid stage %s', (field, overrides) => {
    writeJson(`stage-${field}.json`, {
      products: [
        productFixture({
          carbonStages: [
            {
              module: 'A1-A3',
              indicator: 'GWP-total',
              unit: 'kg CO2 eq.',
              value: 120,
              status: 'declared',
              provenance: { pdfFile: 'source.pdf' },
              ...overrides,
            },
          ],
        }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0].path).toBe(
      `$.products[0].carbonStages[0].${field}`,
    );
  });

  it('skips declared stages without numeric values', () => {
    writeJson('declared-null.json', {
      products: [
        productFixture({
          carbonStages: [
            {
              module: 'A1-A3',
              indicator: 'GWP-total',
              unit: 'kg CO2 eq.',
              value: null,
              status: 'declared',
              provenance: { pdfFile: 'source.pdf' },
            },
          ],
        }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({
      path: '$.products[0].carbonStages[0].value',
    });
  });

  it('skips non-declared stages with numeric values', () => {
    writeJson('not-declared-number.json', {
      products: [
        productFixture({
          carbonStages: [
            {
              module: 'A1-A3',
              indicator: 'GWP-total',
              unit: 'kg CO2 eq.',
              value: 1,
              status: 'not_declared',
              provenance: null,
            },
          ],
        }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({
      path: '$.products[0].carbonStages[0].value',
    });
  });

  it('skips not declared null values without explicit evidence', () => {
    writeJson('not-declared-no-provenance.json', {
      products: [
        productFixture({
          carbonStages: [
            {
              module: 'A1-A3',
              indicator: 'GWP-total',
              unit: 'kg CO2 eq.',
              value: null,
              status: 'not_declared',
              provenance: null,
            },
          ],
        }),
      ],
    });

    const snapshot = new ProductRepository(dataDirectory).getSnapshot();

    expect(snapshot.products).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({
      path: '$.products[0].carbonStages[0].provenance.excerpt',
    });
  });

  function writeJson(file: string, value: unknown) {
    writeFileSync(join(dataDirectory, file), JSON.stringify(value), 'utf8');
  }
});

function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    productName: 'Concrete 25 MPa',
    manufacturer: 'Example Concrete',
    manufacturingLocation: 'Brisbane, Queensland, Australia',
    strengthMpa: 25,
    declaredUnit: '1 m3',
    declaredUnitMassKg: 2400,
    carbonStages: [
      {
        module: 'A1-A3',
        indicator: 'GWP-total',
        unit: 'kg CO2 eq.',
        value: 120,
        status: 'declared',
        provenance: {
          pdfFile: 'source.pdf',
          page: 12,
          table: 'Indicators',
          excerpt: 'GWP-total 120',
        },
      },
    ],
    ...overrides,
  };
}
