import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class MiddlewaresMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MiddlewaresMiddleware.name);

  // Logging every request floods the dev console (frontend polls the
  // notification feed every few seconds). Keep it opt-in so the terminal stays
  // readable; set HTTP_REQUEST_LOG=true to re-enable verbose request logging.
  private static readonly enabled = process.env.HTTP_REQUEST_LOG === 'true';

  use(req: Request, res: Response, next: NextFunction): void {
    if (MiddlewaresMiddleware.enabled) {
      this.logger.log(`${req.method} ${req.url}`);
    }
    next();
  }
}
