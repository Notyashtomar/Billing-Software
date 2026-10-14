import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UserService } from 'src/user/services/user.service';
import { AdminService } from 'src/admin/services/admin.service';
import { OtpMailerService } from './otp-mailer.service';
import { RawFlightDataService } from 'src/raw-flight-data/services/raw-flight-data.service';
import { FlightCancellationsService } from 'src/flight-cancellations/flight-cancellations.service';
import { FlightInstanceStateService } from 'src/flight-instance-state/flight-instance-state.service';
import { MainDetailsService } from 'src/main-details/services/main-details.service';
import { AuthAttemptTrackerService } from '../../protection/services/auth-attempt-tracker.service';
import { ProtectionLoggerService } from '../../protection/logging/protection-logger.service';
import { AdminStationsService } from '../../admin-stations/services/admin-stations.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const mock = () => ({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mock() },
        { provide: AdminService, useValue: mock() },
        { provide: JwtService, useValue: mock() },
        { provide: OtpMailerService, useValue: mock() },
        { provide: RawFlightDataService, useValue: mock() },
        { provide: FlightCancellationsService, useValue: mock() },
        { provide: FlightInstanceStateService, useValue: mock() },
        { provide: MainDetailsService, useValue: mock() },
        { provide: AuthAttemptTrackerService, useValue: mock() },
        { provide: ProtectionLoggerService, useValue: mock() },
        { provide: EventEmitter2, useValue: mock() },
        { provide: AdminStationsService, useValue: mock() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
