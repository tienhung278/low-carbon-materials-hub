import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { AppService } from './app.service';
import { ProductService } from './products/product.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly productService: ProductService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('products/filters')
  getProductFilters() {
    return this.productService.getFilters();
  }

  @Get('products')
  getProducts(
    @Query('strengthMin') strengthMin?: string,
    @Query('strengthMax') strengthMax?: string,
    @Query('location') location?: string,
    @Query('manufacturer') manufacturer?: string,
  ) {
    const filters = {
      strengthMin: parseOptionalNumber('strengthMin', strengthMin),
      strengthMax: parseOptionalNumber('strengthMax', strengthMax),
      location,
      manufacturer,
    };

    if (
      filters.strengthMin !== undefined &&
      filters.strengthMax !== undefined &&
      filters.strengthMin > filters.strengthMax
    ) {
      throw new BadRequestException(
        'strengthMin must be less than or equal to strengthMax',
      );
    }

    return this.productService.listProducts(filters);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    const product = this.productService.getProduct(id);

    if (!product) {
      throw new NotFoundException(`Product not found: ${id}`);
    }

    return product;
  }

  @Get('compare')
  compareProducts(@Query('ids') ids?: string) {
    const productIds = parseIds(ids);

    if (productIds.length < 2) {
      throw new BadRequestException(
        'Compare requires at least two product ids in the ids query parameter',
      );
    }

    return this.productService.compareProducts(productIds);
  }
}

function parseOptionalNumber(name: string, value?: string): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${name} must be a number`);
  }

  return parsed;
}

function parseIds(ids?: string): string[] {
  if (!ids) {
    return [];
  }

  return ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
