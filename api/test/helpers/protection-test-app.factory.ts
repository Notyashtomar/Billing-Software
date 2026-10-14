import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProtectionHarnessModule } from './protection-harness/protection-harness.module';
import { CapturingProtectionLogger } from './protection-log-capture';
import { ProtectionLoggerService } from '../../src/protection/logging/protection-logger.service';
import { InMemoryThrottleStore } from '../../src/protection/stores/in-memory-throttle.store';
import {
  EnvSnapshot,
  PROTECTION_ENV_KEYS,
} from '../utils/env-snapshot';
import type { ProtectionEnvOverrides } from '../fixtures/protection-env.defaults';
import { PROTECTION_ENV_OFF } from '../fixtures/protection-env.defaults';

export type ProtectionTestContext = {
  app: INestApplication<App>;
  agent: ReturnType<typeof request>;
  logs: CapturingProtectionLogger;
  resetThrottle: () => void;
  envSnapshot: EnvSnapshot;
};

export async function createProtectionTestApp(
  envOverrides: ProtectionEnvOverrides = PROTECTION_ENV_OFF,
): Promise<ProtectionTestContext> {
  const envSnapshot = new EnvSnapshot([...PROTECTION_ENV_KEYS]);
  envSnapshot.apply(envOverrides);

  const captureLogger = new CapturingProtectionLogger();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [ProtectionHarnessModule],
  })
    .overrideProvider(ProtectionLoggerService)
    .useValue(captureLogger)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  const memoryStore = app.get(InMemoryThrottleStore);

  return {
    app,
    agent: request(app.getHttpServer()),
    logs: captureLogger,
    resetThrottle: () => {
      memoryStore.clearBuckets();
      captureLogger.clear();
    },
    envSnapshot,
  };
}

export async function destroyProtectionTestApp(
  ctx: ProtectionTestContext,
): Promise<void> {
  await ctx.app.close();
  ctx.envSnapshot.restore();
}
