import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalJwtAuthGuard } from '../common/guards/global-jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { ADMIN_ROLES, Role } from './enums/roles.enum';
import type { AuthenticatedPrincipal } from './services/identity.service';
import {
  IdentityService,
  JwtPayload,
} from './services/identity.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Controller()
class SecurityVerificationController {
  @Get('protected')
  getProtected(@CurrentUser() user: AuthenticatedPrincipal) {
    return { ok: true, role: user.role, userId: user.userId };
  }

  @Get('admin-only')
  @Roles(...ADMIN_ROLES)
  getAdminOnly() {
    return { ok: true };
  }
}

describe('Authentication risk verification', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let identityService: jest.Mocked<IdentityService>;

  beforeAll(async () => {
    identityService = {
      resolveActivePrincipal: jest
        .fn<Promise<AuthenticatedPrincipal>, [JwtPayload]>()
        .mockImplementation(async (payload) => ({
          id: String(payload.sub),
          userId: String(payload.sub),
          userid: `user-${String(payload.sub).slice(-4)}`,
          email: String(payload.email ?? '').trim().toLowerCase(),
          name: 'Security Test User',
          role: String(payload.role ?? Role.EMPLOYEE),
          accountType: payload.accountType ?? 'user',
          active: true,
        })),
    } as unknown as jest.Mocked<IdentityService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'test-secret',
        }),
      ],
      controllers: [SecurityVerificationController],
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
          provide: APP_GUARD,
          useClass: GlobalJwtAuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
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
  });

  it('returns 401 for protected routes without a token', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);
  });

  it('allows valid access tokens on protected routes', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439011',
      email: 'ops@example.com',
      accountType: 'user',
      role: Role.MANAGER,
    });

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ok: true,
          role: Role.MANAGER,
          userId: '507f1f77bcf86cd799439011',
        });
      });
  });

  it('returns 403 for authenticated users with insufficient roles', async () => {
    const token = signToken({
      sub: '507f1f77bcf86cd799439012',
      email: 'employee@example.com',
      accountType: 'user',
      role: Role.EMPLOYEE,
    });

    await request(app.getHttpServer())
      .get('/admin-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 401 for malformed tokens', async () => {
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', 'Bearer definitely-not-a-jwt')
      .expect(401);
  });

  it('returns 401 for expired tokens', async () => {
    const token = signToken(
      {
        sub: '507f1f77bcf86cd799439013',
        email: 'admin@example.com',
        accountType: 'admin',
        role: Role.MANAGER,
      },
      { expiresIn: -10 },
    );

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('returns 401 when a password-reset token is used as an access token', async () => {
    const token = jwtService.sign({
      sub: '507f1f77bcf86cd799439014',
      email: 'admin@example.com',
      accountType: 'admin',
      role: Role.MANAGER,
      purpose: 'password-reset',
    });

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
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
