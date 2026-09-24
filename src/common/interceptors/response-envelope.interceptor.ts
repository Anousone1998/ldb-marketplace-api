import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { map, Observable } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { PaginatedResult } from '../dto/pagination.dto';
import { ApiSuccessResponse, defaultMessageFor } from '../http/api-response';

/** Wraps every successful HTTP response in `{ status, statusCode, message, data, meta?, timestamp, path }`. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const customMessage = this.reflector.getAllAndOverride<string | undefined>(RESPONSE_MESSAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((body: unknown): ApiSuccessResponse => {
        const statusCode = response.statusCode;
        const paginated = body instanceof PaginatedResult;
        return {
          status: 'success',
          statusCode,
          message: customMessage ?? defaultMessageFor(statusCode),
          data: paginated ? body.data : (body ?? null),
          ...(paginated ? { meta: body.meta } : {}),
          timestamp: new Date().toISOString(),
          path: request.originalUrl,
        };
      }),
    );
  }
}
