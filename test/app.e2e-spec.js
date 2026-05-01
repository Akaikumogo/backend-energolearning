const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');

// Run e2e against compiled code to avoid ts-jest/jest version mismatch.
const { AppModule } = require('../dist/app.module');

describe('AppController (e2e)', () => {
  let app;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body.service).toBe('ElektroLearn Backend');
        expect(res.body.docsUrl).toBe('/api/docs/development/sarvarbek/swagger');
      });
  });
});

