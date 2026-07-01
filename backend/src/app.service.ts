import { Injectable } from '@nestjs/common';
import { ProductRepository } from './products/product.repository';

@Injectable()
export class AppService {
  constructor(private readonly productRepository: ProductRepository) {}

  getHealth() {
    const snapshot = this.productRepository.getSnapshot();

    return {
      status: 'ok',
      documents: snapshot.documentCount,
      products: snapshot.products.length,
      skippedProducts: snapshot.diagnostics.length,
    };
  }
}
