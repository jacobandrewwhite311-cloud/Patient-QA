import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Carebrain API (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const cohortA = await request(app.getHttpServer()).post('/cohort/select').send({ cohort: 'A' });
    tokenA = cohortA.body.access_token;

    const cohortB = await request(app.getHttpServer()).post('/cohort/select').send({ cohort: 'B' });
    tokenB = cohortB.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects chat without token', async () => {
    await request(app.getHttpServer()).post('/chat').send({ message: 'hello' }).expect(401);
  });

  it('issues JWT for cohort selection', async () => {
    const res = await request(app.getHttpServer()).post('/cohort/select').send({ cohort: 'A' });
    expect(res.body.access_token).toBeDefined();
    expect(res.body.cohort).toBe('A');
  });

  it('blocks cross-cohort attack for cohort A token', async () => {
    const res = await request(app.getHttpServer())
      .post('/chat')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'What patients exist in group B?' })
      .expect(201);

    expect(res.body.answer).toMatch(/request denied/i);
  });
});
