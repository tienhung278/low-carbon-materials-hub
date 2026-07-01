import { AppService } from './app.service';
import { ProductRepository } from './products/product.repository';

describe('AppService', () => {
  it('returns health counts from the product repository snapshot', () => {
    const service = new AppService({
      getSnapshot: () => ({
        documentCount: 3,
        products: [{ id: 'p1' }, { id: 'p2' }],
        diagnostics: [{ path: '$.products[0].id' }],
      }),
    } as ProductRepository);

    expect(service.getHealth()).toEqual({
      status: 'ok',
      documents: 3,
      products: 2,
      skippedProducts: 1,
    });
  });
});
