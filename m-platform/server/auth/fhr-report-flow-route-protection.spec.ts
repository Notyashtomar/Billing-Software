import { ForbiddenException, INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { GlobalJwtAuthGuard } from '../common/guards/global-jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import {
  FRIS_PAGE_PERMISSION_ANY_KEY,
  FRIS_PAGE_PERMISSION_KEY,
  type FrisPagePermissionMeta,
} from './decorators/fris-page-permission.decorator';
import { Role } from './enums/roles.enum';
import {
  AuthenticatedPrincipal,
  IdentityService,
  JwtPayload,
} from './services/identity.service';
import { JwtStrategy } from './strategies/jwt.strategy';

jest.mock('../reports/services/reports.service', () => ({
  ReportsService: class ReportsService {},
}));

type StringMetadataReflector = {
  getAllAndOverride<T>(
    metadataKey: string,
    targets: (object | Function)[],
  ): T;
};
jest.mock('../reports/services/report-aggregation.service', () => ({
  ReportAggregationService: class ReportAggregationService {},
}));
jest.mock('../main-details/services/main-details.service', () => ({
  MainDetailsService: class MainDetailsService {},
}));
jest.mock('../raw-flight-data/services/raw-flight-data.service', () => ({
  RawFlightDataService: class RawFlightDataService {},
}));
jest.mock('../dashboard-summary/services/dashboard-summary-precompute.service', () => ({
  DashboardSummaryPrecomputeService: class DashboardSummaryPrecomputeService {},
}));
jest.mock('../reports/services/delay-analytics.service', () => ({
  DelayAnalyticsService: class DelayAnalyticsService {},
}));
jest.mock('../reports/services/delay-report-summary.service', () => ({
  DelayReportSummaryService: class DelayReportSummaryService {},
}));
jest.mock('../fhr-collection/services/fhr-collection.service', () => ({
  FhrCollectionService: class FhrCollectionService {
    static queryParamToYmd(value?: string) {
      if (!value) return undefined;
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    }
  },
}));
jest.mock('../fhr-collection/services/shared-reports-email.service', () => ({
  SharedReportsEmailService: class SharedReportsEmailService {},
}));
jest.mock('../fhr-collection/services/fhr-signature.service', () => ({
  FhrSignatureService: class FhrSignatureService {},
}));

import { ReportsController } from '../reports/controllers/reports.controller';
import { ReportsService } from '../reports/services/reports.service';
import { ReportAggregationService } from '../reports/services/report-aggregation.service';
import { MainDetailsService } from '../main-details/services/main-details.service';
import { RawFlightDataService } from '../raw-flight-data/services/raw-flight-data.service';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import { DashboardSummaryPrecomputeService } from '../dashboard-summary/services/dashboard-summary-precompute.service';
import { DelayAnalyticsService } from '../reports/services/delay-analytics.service';
import { DelayReportSummaryService } from '../reports/services/delay-report-summary.service';
import { SharedReportsEmailService } from '../fhr-collection/services/shared-reports-email.service';
import { FhrSignatureService } from '../fhr-collection/services/fhr-signature.service';
import { FhrCollectionController } from '../fhr-collection/controllers/fhr-collection.controller';

describe('FHR report flow route protection', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let identityService: jest.Mocked<IdentityService>;
  let authService: {
    assertFrisPageAccess: jest.Mock;
    hasFrisPageAccess: jest.Mock;
  };
  let upsertMerge: jest.Mock;

  beforeAll(async () => {
    identityService = {
      resolveActivePrincipal: jest
        .fn<Promise<AuthenticatedPrincipal>, [JwtPayload]>()
        .mockImplementation(async (payload) => ({
          id: String(payload.sub),
          userId: String(payload.sub),
          userid: `user-${String(payload.sub).slice(-4)}`,
          email: String(payload.email ?? '').trim().toLowerCase(),
          name: 'FHR Flow Test User',
          role: String(payload.role ?? Role.EMPLOYEE),
          accountType: payload.accountType ?? 'user',
          active: true,
        })),
    } as unknown as jest.Mocked<IdentityService>;

    authService = {
      assertFrisPageAccess: jest.fn().mockResolvedValue(undefined),
      hasFrisPageAccess: jest.fn().mockResolvedValue(true),
    };

    const reportAggregationService = {
      getMainReportData: jest.fn().mockResolvedValue({ serialNo: 16626, ok: true }),
      getEquipmentSheetData: jest
        .fn()
        .mockResolvedValue({ serialNo: 16626, equipment: [] }),
      getFlightReportData: jest
        .fn()
        .mockResolvedValue({ serialNo: 16626, airlineName: 'SpiceJet' }),
    };

    upsertMerge = jest.fn().mockResolvedValue({ SerialNo: 16626 });
    const fhrCollectionService = {
      findBySerial: jest
        .fn()
        .mockResolvedValue({ SerialNo: 16626, mainDetails: { Airline: 'SpiceJet' } }),
      listCleaningServicesForStaYmdWindow: jest
        .fn()
        .mockResolvedValue([{ serialNo: 16626, cleaningFrom: '05:00' }]),
      upsertMerge,
      refreshFromSourceCollections: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'test-secret',
        }),
      ],
      controllers: [ReportsController, FhrCollectionController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: IdentityService,
          useValue: identityService,
        },
        {
          provide: ReportsService,
          useValue: {},
        },
        {
          provide: MainDetailsService,
          useValue: {},
        },
        {
          provide: ReportAggregationService,
          useValue: reportAggregationService,
        },
        {
          provide: RawFlightDataService,
          useValue: {},
        },
        {
          provide: FhrCollectionService,
          useValue: fhrCollectionService,
        },
        {
          provide: SharedReportsEmailService,
          useValue: {},
        },
        {
          provide: FhrSignatureService,
          useValue: {},
        },
        {
          provide: DashboardSummaryPrecomputeService,
          useValue: {},
        },
        {
          provide: DelayAnalyticsService,
          useValue: {},
        },
        {
          provide: DelayReportSummaryService,
          useValue: {},
        },
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
          useFactory: (reflector: Reflector) => ({
            canActivate: async (context: {
              getHandler: () => unknown;
              getClass: () => unknown;
              switchToHttp: () => {
                getRequest: () => { user?: AuthenticatedPrincipal };
              };
            }) => {
              const metadataReflector = reflector as unknown as StringMetadataReflector;
              const anyPages = metadataReflector.getAllAndOverride<
                FrisPagePermissionMeta[] | undefined
              >(FRIS_PAGE_PERMISSION_ANY_KEY, [
                context.getHandler() as object,
                context.getClass() as object,
              ]);
              const { user } = context.switchToHttp().getRequest();

              if (anyPages && anyPages.length > 0) {
                for (const page of anyPages) {
                  if (
                    await authService.hasFrisPageAccess(
                      user,
                      page.tab,
                      page.pageLabel,
                    )
                  ) {
                    return true;
                  }
                }
                const labels = anyPages.map((p) => p.pageLabel).join(', ');
                throw new ForbiddenException(
                  `You do not have permission to access any of: ${labels}`,
                );
              }

              const meta = metadataReflector.getAllAndOverride<
                FrisPagePermissionMeta | undefined
              >(FRIS_PAGE_PERMISSION_KEY, [
                context.getHandler() as object,
                context.getClass() as object,
              ]);
              if (!meta) return true;
              await authService.assertFrisPageAccess(
                user,
                meta.tab,
                meta.pageLabel,
              );
              return true;
            },
          }),
          inject: [Reflector],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    identityService.resolveActivePrincipal.mockClear();
    authService.assertFrisPageAccess.mockReset();
    authService.assertFrisPageAccess.mockResolvedValue(undefined);
    authService.hasFrisPageAccess.mockReset();
    authService.hasFrisPageAccess.mockResolvedValue(true);
  });

  it('returns 401 for anonymous FHR report flow endpoints', async () => {
    await request(app.getHttpServer()).get('/reports/flight-report/16626').expect(401);
    await request(app.getHttpServer()).get('/fhr-collection/flight/16626').expect(401);
  });

  it('returns 401 for malformed tokens on protected report endpoints', async () => {
    await request(app.getHttpServer())
      .get('/reports/flight-report/16626')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('returns 401 for expired tokens on protected FHR endpoints', async () => {
    const token = signToken(
      {
        sub: '507f1f77bcf86cd799439099',
        email: 'ops@example.com',
        accountType: 'user',
        role: 'operations',
      },
      { expiresIn: -10 },
    );

    await request(app.getHttpServer())
      .get('/fhr-collection/flight/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('allows employee-role tokens to READ generated FHR report data', async () => {
    // Admin-created panel users carry role `employee`. Once they are granted the
    // "FHR Report" page permission, they must be able to view the generated
    // report; access is governed by per-page permission flags, not the role.
    const token = signToken({
      sub: '507f1f77bcf86cd799439012',
      email: 'employee@example.com',
      accountType: 'user',
      role: Role.EMPLOYEE,
    });

    await request(app.getHttpServer())
      .get('/reports/flight-report/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ serialNo: 16626, airlineName: 'SpiceJet' });
      });

    await request(app.getHttpServer())
      .get('/fhr-collection/flight/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ SerialNo: 16626 });
      });
  });

  it('still blocks employee-role tokens without Scheduled or Non-Scheduled Airlines page access from MUTATING FHR data', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439012',
      email: 'employee@example.com',
      accountType: 'user',
      role: Role.EMPLOYEE,
    });

    authService.hasFrisPageAccess.mockResolvedValue(false);

    // Upsert is gated by page permission (Scheduled or Non-Scheduled Airlines).
    await request(app.getHttpServer())
      .put('/fhr-collection/flight/16626')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });

  it('allows employee-role tokens with Non-Scheduled Airlines access to mutate FHR data', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439015',
      email: 'ns-employee@example.com',
      accountType: 'user',
      role: Role.EMPLOYEE,
    });

    authService.hasFrisPageAccess.mockImplementation(
      async (_user: unknown, _tab: string, pageLabel: string) =>
        pageLabel === 'Non-Scheduled Airlines',
    );
    upsertMerge.mockResolvedValue({ SerialNo: 16626 });

    await request(app.getHttpServer())
      .put('/fhr-collection/flight/16626')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainDetails: { Airline: 'CharterCo' } })
      .expect(200);
  });

  it('allows manager-role tokens with Scheduled Airlines access to mutate FHR data', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439014',
      email: 'duty-manager@example.com',
      accountType: 'user',
      role: Role.MANAGER,
    });

    upsertMerge.mockResolvedValue({ SerialNo: 16626 });

    await request(app.getHttpServer())
      .put('/fhr-collection/flight/16626')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainDetails: { Airline: 'SpiceJet' } })
      .expect(200);
  });

  it('allows operations-role tokens on FHR report endpoints', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439011',
      email: 'ops@example.com',
      accountType: 'user',
      role: 'operations',
    });

    await request(app.getHttpServer())
      .get('/reports/flight-report/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ serialNo: 16626, airlineName: 'SpiceJet' });
      });

    await request(app.getHttpServer())
      .get('/fhr-collection/flight/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ SerialNo: 16626 });
      });
  });

  it('allows admin-role tokens on related report read endpoints', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439013',
      email: 'admin@example.com',
      accountType: 'admin',
      role: 'admin',
    });

    await request(app.getHttpServer())
      .get('/reports/main-report/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/reports/equipment-sheet/16626')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/fhr-collection/cleaning-services?fromDate=2026-03-01&tillDate=2026-03-02')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  function signToken(
    payload: Omit<JwtPayload, 'purpose'>,
    options?: JwtSignOptions,
  ) {
    return jwtService.sign(
      {
        ...payload,
        purpose: 'access',
      },
      options,
    );
  }
});
