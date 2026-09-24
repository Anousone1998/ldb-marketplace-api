import 'reflect-metadata';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { IncomingMessage } from 'node:http';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/adapters/socket-io.adapter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { flattenValidationErrors } from './common/utils/validation.util';
import { parseCorsOrigins, parseTrustProxy } from './config/env.helpers';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['log', 'warn', 'error', 'fatal'] : undefined,
    bodyParser: false, // registered below so GET/HEAD bodies are ignored
  });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const logger = new Logger('Bootstrap');

  const corsOrigin = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));

  // Behind cloudflared / a load balancer: use X-Forwarded-For so req.ip (and rate limits) see the real client.
  app.set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  // GET/HEAD bodies have no meaning here; skipping them avoids 400s when a client (e.g. Postman)
  // attaches a leftover or malformed JSON body to a GET request.
  const hasBody = (req: IncomingMessage) => req.method !== 'GET' && req.method !== 'HEAD';
  app.useBodyParser('json', {
    limit: '1mb',
    type: (req: IncomingMessage) => hasBody(req) && /^application\/([\w.+-]+\+)?json/i.test(req.headers['content-type'] ?? ''),
  });
  app.useBodyParser('urlencoded', {
    limit: '1mb',
    extended: true,
    type: (req: IncomingMessage) => hasBody(req) && /^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] ?? ''),
  });
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
      exceptionFactory: (errors) =>
        new BadRequestException({ message: 'Validation failed', errors: flattenValidationErrors(errors) }),
    }),
  );
  // Uniform envelope: { status, statusCode, message, data, meta?, timestamp, path }
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useWebSocketAdapter(new SocketIoAdapter(app, corsOrigin));
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  logger.log(`HTTP API     → http://localhost:${port}/api/v1`);
  logger.log(`Socket.io    → ws://localhost:${port}/chat`);
}

void bootstrap();
