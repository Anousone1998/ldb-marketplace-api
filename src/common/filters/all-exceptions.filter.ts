import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ApiErrorResponse, defaultMessageFor, FieldError } from '../http/api-response';
import { getPgErrorCode, PgErrorCode } from '../utils/sql.util';

const DB_ERROR_MAPPINGS: Record<string, { status: HttpStatus; message: string }> = {
  [PgErrorCode.UNIQUE_VIOLATION]: { status: HttpStatus.CONFLICT, message: 'Resource already exists' },
  [PgErrorCode.FOREIGN_KEY_VIOLATION]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Referenced record does not exist or is still in use',
  },
  [PgErrorCode.CHECK_VIOLATION]: { status: HttpStatus.BAD_REQUEST, message: 'Value violates a data constraint' },
  [PgErrorCode.NOT_NULL_VIOLATION]: { status: HttpStatus.BAD_REQUEST, message: 'A required value is missing' },
  [PgErrorCode.INVALID_TEXT_REPRESENTATION]: { status: HttpStatus.BAD_REQUEST, message: 'Invalid input value' },
  [PgErrorCode.NUMERIC_VALUE_OUT_OF_RANGE]: { status: HttpStatus.BAD_REQUEST, message: 'Numeric value out of range' },
  [PgErrorCode.LOCK_NOT_AVAILABLE]: {
    status: HttpStatus.CONFLICT,
    message: 'The resource is being modified by another request, please retry',
  },
  [PgErrorCode.DEADLOCK_DETECTED]: {
    status: HttpStatus.CONFLICT,
    message: 'Concurrent update conflict, please retry',
  },
  [PgErrorCode.SERIALIZATION_FAILURE]: {
    status: HttpStatus.CONFLICT,
    message: 'Concurrent update conflict, please retry',
  },
};

/** Body-parser and multer errors are cryptic; add the usual client-side fix. */
function withUploadHint(message: string): string {
  if (/boundary not found/i.test(message)) {
    return (
      `${message}. Do not set the Content-Type header yourself when sending FormData; ` +
      'the browser/HTTP client must add it with the multipart boundary'
    );
  }
  if (/JSON at position|in JSON|is not valid JSON|Unexpected end of JSON/i.test(message)) {
    return `Request body is not valid JSON (${message}). Check for trailing commas, single quotes or unquoted keys`;
  }
  if (/^Unexpected end of form$/i.test(message)) {
    return `${message}. The multipart body was truncated or malformed`;
  }
  return message;
}

/**
 * Formats every HTTP error as `{ status: 'error', statusCode, message, errors?, data: null, timestamp, path }`.
 * Database errors are mapped to meaningful statuses without leaking SQL; unknown errors become 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { statusCode, message, errors } = this.resolve(exception);
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      status: 'error',
      statusCode,
      message,
      ...(errors && errors.length > 0 ? { errors } : {}),
      data: null,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };
    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): { statusCode: number; message: string; errors?: FieldError[] } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') return { statusCode, message: res };

      const { message, errors } = res as { message?: unknown; errors?: FieldError[] };
      if (Array.isArray(message)) {
        return { statusCode, message: message.join('; ') };
      }
      const text = typeof message === 'string' && message ? message : defaultMessageFor(statusCode);
      return { statusCode, message: withUploadHint(text), errors };
    }

    if (exception instanceof QueryFailedError) {
      const code = getPgErrorCode(exception);
      const mapping = code ? DB_ERROR_MAPPINGS[code] : undefined;
      if (mapping) return { statusCode: mapping.status, message: mapping.message };
    }

    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: defaultMessageFor(500) };
  }
}
