import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const originalCwd = process.cwd();
  const originalDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    delete process.env.DATA_DIR;
    process.chdir(resolve(__dirname, '..'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as Record<string, unknown>;

        expect(body.status).toBe('ok');
        expect(typeof body.documents).toBe('number');
        expect(typeof body.products).toBe('number');
      });
  });

  it('/products (GET) loads backend-local data', () => {
    return request(app.getHttpServer())
      .get('/products')
      .expect(200)
      .expect((response) => {
        const body = response.body as Array<Record<string, unknown>>;

        expect(body.length).toBeGreaterThan(0);
        expect(body.map((product) => product.id)).toContain(
          'envirocrete-40-32mpa',
        );
      });
  });

  it('/products/:id (GET) returns backend-local product data', () => {
    return request(app.getHttpServer())
      .get('/products/envirocrete-40-32mpa')
      .expect(200)
      .expect((response) => {
        const body = response.body as Record<string, unknown>;

        expect(body.id).toBe('envirocrete-40-32mpa');
        expect(body.manufacturer).toBe('Boral Limited');
        expect(body.carbonStages).toEqual(expect.any(Array));
      });
  });

  afterEach(async () => {
    await app.close();
    process.chdir(originalCwd);
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
  });
});
