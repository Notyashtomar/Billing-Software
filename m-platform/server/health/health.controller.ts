import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly healthService: HealthService,
  ) {}

  /**
   * **Liveness** — is the Node process alive?
   *
   * Use for Kubernetes `livenessProbe`. Intentionally does **not** check MongoDB:
   * a DB outage should not restart the pod (use `/ready` for that).
   */
  @Public()
  @Get('health')
  liveness() {
    return this.healthService.getLiveness();
  }

  /**
   * **Readiness** — can this instance accept traffic?
   *
   * Use for Kubernetes `readinessProbe` and load balancer health checks.
   * Verifies MongoDB with a lightweight ping (no business queries).
   * Returns **503** when Mongo is unreachable so orchestrators stop routing traffic.
   */
  @Public()
  @Get('ready')
  async readiness() {
    try {
      return await this.health.check([
        () => this.mongoose.pingCheck('mongodb', { timeout: 3000 }),
      ]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        this.healthService.logReadinessFailure('mongodb', error.getResponse());
      }
      throw error;
    }
  }

  /**
   * Extended diagnostic snapshot: Mongo ping + process/memory metadata.
   * Not intended for high-frequency probes — prefer `/health` and `/ready`.
   */
  @Public()
  @Get('health/full')
  @HealthCheck()
  full() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb', { timeout: 3000 }),
      () => this.healthService.processDetailsCheck(),
    ]);
  }
}
