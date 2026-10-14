import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { buildTestPrincipal } from '../../fixtures/users.fixture';

@Injectable()
export class TestUserMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const userid = String(req.headers['x-test-user-id'] ?? '').trim();
    if (userid) {
      const role = String(req.headers['x-test-user-role'] ?? 'employee').trim();
      (req as Request & { user?: unknown }).user = buildTestPrincipal(
        userid,
        role,
      );
    }
    next();
  }
}
