import { StringValue } from 'ms';
import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthService } from './services/auth.service';
import { IdentityService } from './services/identity.service';
import { FrisPagePermissionGuard } from './guards/fris-page-permission.guard';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../user/user.module';
import { AdminModule } from '../admin/admin.module';
import { OtpMailerService } from './services/otp-mailer.service';
import { OtpStoreService } from './services/otp-store.service';
import { AdminEmail, AdminEmailSchema } from './schema/admin-email.schema';
import { RawFlightDataModule } from 'src/raw-flight-data/raw-flight-data.module';
import { FlightCancellationsModule } from 'src/flight-cancellations/flight-cancellations.module';
import { FlightInstanceStateModule } from 'src/flight-instance-state/flight-instance-state.module';
import { MainDetailsModule } from 'src/main-details/main-details.module';
import { AdminMessagingModule } from '../admin-messaging/admin-messaging.module';
import { AdminStationsModule } from '../admin-stations/admin-stations.module';

@Module({
  imports: [
    UserModule,
    AdminModule,
    forwardRef(() => AdminMessagingModule),
    RawFlightDataModule,
    FlightCancellationsModule,
    FlightInstanceStateModule,
    MainDetailsModule,
    AdminStationsModule,
    MongooseModule.forFeature([
      { name: AdminEmail.name, schema: AdminEmailSchema },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // Default 1 day — cookie maxAge falls back to JWT_EXPIRES_IN when AUTH_COOKIE_MAX_AGE unset.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN')?.trim() ||
            '1d') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, IdentityService, JwtStrategy, OtpMailerService, OtpStoreService, FrisPagePermissionGuard],
  exports: [JwtModule, OtpMailerService, AuthService, IdentityService, FrisPagePermissionGuard, OtpStoreService],
})
export class AuthModule {}
