import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { defaultMessageFor, FieldError } from '../../common/http/api-response';

/** Same shape as the REST error envelope (minus path/timestamp). */
interface WsErrorPayload {
  status: 'error';
  statusCode: number;
  message: string;
  errors?: FieldError[];
  data: null;
}

/**
 * Converts exceptions thrown by handlers or shared services (NotFound, Forbidden, validation, ...)
 * into socket errors. If the client sent an acknowledgement callback it receives the error there;
 * otherwise an `exception` event is emitted.
 */
@Catch()
export class WsExceptionsFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger('ChatsGateway');

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const ack = host.getArgs().find((arg, index) => index > 0 && typeof arg === 'function') as
      | ((payload: WsErrorPayload) => void)
      | undefined;

    const payload = this.toPayload(exception);
    if (ack) {
      ack(payload);
    } else {
      client.emit('exception', payload);
    }
  }

  private toPayload(exception: unknown): WsErrorPayload {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return { status: 'error', statusCode, ...extract(exception.getResponse(), statusCode), data: null };
    }
    if (exception instanceof WsException) {
      return { status: 'error', statusCode: 400, ...extract(exception.getError(), 400), data: null };
    }

    this.logger.error('Unhandled WebSocket error', exception instanceof Error ? exception.stack : exception);
    return { status: 'error', statusCode: 500, message: defaultMessageFor(500), data: null };
  }
}

function extract(body: unknown, statusCode: number): { message: string; errors?: FieldError[] } {
  if (typeof body === 'string') return { message: body };
  const { message, errors } = (body ?? {}) as { message?: unknown; errors?: FieldError[] };
  const text = Array.isArray(message)
    ? message.join('; ')
    : typeof message === 'string' && message
      ? message
      : defaultMessageFor(statusCode);
  return errors?.length ? { message: text, errors } : { message: text };
}
