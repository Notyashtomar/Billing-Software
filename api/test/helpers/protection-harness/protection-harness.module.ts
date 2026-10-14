import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ProtectionModule } from '../../../src/protection/protection.module';
import { RequestIdMiddleware } from '../../../src/protection/middleware/request-id.middleware';
import { TestUserMiddleware } from './test-user.middleware';
import {
  SmokeAuthController,
  SmokeDashboardController,
  SmokeExportsController,
  SmokeImportController,
  SmokeKpiController,
  SmokeReportsController,
  SmokeUtilityController,
} from './smoke-controllers';

@Module({
  imports: [ProtectionModule],
  controllers: [
    SmokeAuthController,
    SmokeDashboardController,
    SmokeKpiController,
    SmokeReportsController,
    SmokeExportsController,
    SmokeImportController,
    SmokeUtilityController,
  ],
})
export class ProtectionHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, TestUserMiddleware).forRoutes('*');
  }
}
