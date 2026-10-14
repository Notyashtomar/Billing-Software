import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  getOrCreateRequestId,
  REQUEST_ID_HEADER,
} from '../utils/request-context.util';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = getOrCreateRequestId(req);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
