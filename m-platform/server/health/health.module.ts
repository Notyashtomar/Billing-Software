import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Isolated operational health endpoints (`/health`, `/ready`, `/health/full`).
 * Does not import business feature modules.
 */
@Module({
  imports: [TerminusModule.forRoot()],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
