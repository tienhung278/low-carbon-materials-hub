import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductService } from './products/product.service';

describe('AppController', () => {
  let appController: AppController;
  const appService = {
    getHealth: jest.fn(),
  };
  const productService = {
    getFilters: jest.fn(),
    listProducts: jest.fn(),
    getProduct: jest.fn(),
    compareProducts: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
        { provide: ProductService, useValue: productService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns health from the app service', () => {
      appService.getHealth.mockReturnValue({
        status: 'ok',
        documents: 2,
        products: 4,
        skippedProducts: 1,
      });

      expect(appController.getHealth()).toEqual({
        status: 'ok',
        documents: 2,
        products: 4,
        skippedProducts: 1,
      });
    });
  });

  describe('products', () => {
    it('parses product filters before calling the service', () => {
      productService.listProducts.mockReturnValue([]);

      appController.getProducts('25', '40', 'brisbane', 'hanson');

      expect(productService.listProducts).toHaveBeenCalledWith({
        strengthMin: 25,
        strengthMax: 40,
        location: 'brisbane',
        manufacturer: 'hanson',
      });
    });

    it('rejects invalid strength filters', () => {
      expect(() => appController.getProducts('abc')).toThrow(
        BadRequestException,
      );
      expect(() => appController.getProducts('40', '25')).toThrow(
        BadRequestException,
      );
    });

    it('returns a product or a 404', () => {
      productService.getProduct.mockReturnValueOnce({ id: 'p1' });
      expect(appController.getProduct('p1')).toEqual({ id: 'p1' });

      productService.getProduct.mockReturnValueOnce(undefined);
      expect(() => appController.getProduct('missing')).toThrow(
        NotFoundException,
      );
    });

    it('requires at least two ids for compare', () => {
      expect(() => appController.compareProducts('one')).toThrow(
        BadRequestException,
      );

      productService.compareProducts.mockReturnValue({ products: [] });
      expect(appController.compareProducts('one, two')).toEqual({
        products: [],
      });
      expect(productService.compareProducts).toHaveBeenCalledWith([
        'one',
        'two',
      ]);
    });
  });
});
