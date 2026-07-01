import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductRepository } from './products/product.repository';
import { ProductService } from './products/product.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ProductRepository, ProductService],
})
export class AppModule {}
