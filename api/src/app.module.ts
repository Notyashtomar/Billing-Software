import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { MiddlewaresMiddleware } from './user/middlewares/middlewares.middleware';
import { GlobalJwtAuthGuard } from './common/guards/global-jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { FrisPagePermissionGuard } from './auth/guards/fris-page-permission.guard';
import { ProtectionModule } from './protection/protection.module';
import { RequestIdMiddleware } from './protection/middleware/request-id.middleware';
import { HealthModule } from './health/health.module';
import { StationModule } from './common/station/station.module';
import { BillingModule } from './billing/billing.module';
import { FileStorageModule } from './common/storage/file-storage.module';

/**
 * Billing-only API shell. Flight, admin, and reporting Nest modules that are
 * not in this checkout are not registered here. Login stays wired up.
 */
@Module({
  imports: [
    ProtectionModule,
    FileStorageModule,
    StationModule,
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'env'],
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
    HealthModule,
    UserModule,
    AuthModule,
    BillingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GlobalJwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FrisPagePermissionGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer.apply(MiddlewaresMiddleware).forRoutes('*');
  }
}
