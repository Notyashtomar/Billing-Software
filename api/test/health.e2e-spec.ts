import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseHealthIndicator,
  TerminusModule,
} from '@nestjs/terminus';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthModule } from '../src/health/health.module';

describe('Health (e2e)', () => {
  describe('GET /health (liveness)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [TerminusModule.forRoot(), HealthModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with status, timestamp, and uptime', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'ok',
      });
      expect(typeof res.body.timestamp).toBe('string');
      expect(res.body.uptime).toMatchObject({
        seconds: expect.any(Number),
        human: expect.any(String),
      });
      expect(res.body.uptime.seconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/full (diagnostics)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [TerminusModule.forRoot(), HealthModule],
      })
        .overrideProvider(MongooseHealthIndicator)
        .useValue({
          pingCheck: jest.fn().mockResolvedValue({
            mongodb: { status: 'up' },
          }),
        })
        .compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns human-readable memory and uptime alongside raw values', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/full')
        .expect(200);

      const processInfo = res.body.info?.process ?? res.body.details?.process;
      expect(processInfo).toBeDefined();
      expect(processInfo.uptime).toMatchObject({
        seconds: expect.any(Number),
        human: expect.any(String),
      });
      expect(processInfo.memory?.rss).toMatchObject({
        bytes: expect.any(Number),
        human: expect.stringMatching(/Bytes|KB|MB|GB/),
      });
      expect(processInfo.memory?.heapUsed?.human).toMatch(/^~?\d+/);
    });
  });

  describe('GET /ready (readiness)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [TerminusModule.forRoot(), HealthModule],
      })
        .overrideProvider(MongooseHealthIndicator)
        .useValue({
          pingCheck: jest.fn().mockResolvedValue({
            mongodb: { status: 'down', message: 'unavailable in test' },
          }),
        })
        .compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 503 when MongoDB is unavailable', async () => {
      await request(app.getHttpServer()).get('/ready').expect(503);
    });
  });

  describe('GET /ready with healthy MongoDB (mock)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [TerminusModule.forRoot(), HealthModule],
      })
        .overrideProvider(MongooseHealthIndicator)
        .useValue({
          pingCheck: jest.fn().mockResolvedValue({
            mongodb: { status: 'up' },
          }),
        })
        .compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 when MongoDB ping succeeds', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info?.mongodb?.status).toBe('up');
    });
  });
});
