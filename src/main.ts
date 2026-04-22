import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { webcrypto } from 'crypto';
import { join } from 'path';
import { AppModule } from './app.module';
import { SWAGGER_RELATIVE_PATH } from './swagger.constants';
import 'dotenv/config';

// Workaround for environments where globalThis.crypto is missing.
// Required by @nestjs/schedule on some Node versions.
const g = globalThis as unknown as { crypto?: unknown };
if (!g.crypto) g.crypto = webcrypto as unknown;

function maskSecret(value: string | undefined) {
  if (!value) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function parseDbInfo(databaseUrl: string | undefined) {
  if (!databaseUrl) return null;
  try {
    const u = new URL(databaseUrl);
    return {
      driver: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port || '',
      database: u.pathname?.replace(/^\//, '') || '',
      username: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
    };
  } catch {
    return { raw: databaseUrl };
  }
}

function parseOllamaInfo() {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  const model = process.env.OLLAMA_MODEL?.trim();
  const timeoutMs = process.env.OLLAMA_TIMEOUT_MS?.trim();

  return {
    baseUrl: baseUrl || '',
    model: model || '',
    timeoutMs: timeoutMs || '',
  };
}

function buildCorsConfig(): CorsOptions {
  return {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableCors(buildCorsConfig());

  // /uploads/** static fayllarni serve qiladi (avatarlar uchun)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  app.set('trust proxy', true);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ElektroLearn Backend API')
    .setDescription(
      'MVP API docs. Auth, permission, request body, response va headerlar to`liq hujjatlashtirilgan.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Auth/login endpointdan olingan tokenni Bearer formatda yuboring.',
      },
      'bearer',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(SWAGGER_RELATIVE_PATH, app, swaggerDocument, {
    customSiteTitle: 'ElektroLearn API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customCss: `
      :root {
        color-scheme: light dark;
      }

      @media (prefers-color-scheme: dark) {
        body, .swagger-ui {
          background: #0b1220 !important;
        }

        .swagger-ui .opblock,
        .swagger-ui .scheme-container,
        .swagger-ui .topbar {
          background: #111827 !important;
          color: #e5e7eb !important;
        }
      }
    `,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  const showBootInfo = (process.env.SHOW_BOOT_INFO ?? '').toLowerCase();
  if (showBootInfo === 'true' || showBootInfo === 'full') {
    const localBaseUrl = `http://localhost:${port}/api`;
    const publicDomain = process.env.PUBLIC_DOMAIN?.trim();
    const domainBaseUrl = publicDomain
      ? `${publicDomain.replace(/\/$/, '')}/api`
      : '';

    const dbInfo = parseDbInfo(process.env.DATABASE_URL);
    const ollamaInfo = parseOllamaInfo();
    const adminEmail = process.env.SUPERADMIN_EMAIL;
    const adminPassword = process.env.SUPERADMIN_PASSWORD;

    const showFull = showBootInfo === 'full';

    console.log('\n================== ElektroLearn Backend ==================');
    console.log('Status: ishlayapti');
    console.log(`Local API:   ${localBaseUrl}`);
    if (domainBaseUrl) {
      console.log(`Domain API:  ${domainBaseUrl}`);
    }
    console.log(`Swagger:     ${localBaseUrl}/${SWAGGER_RELATIVE_PATH}`);

    if (dbInfo) {
      if ('raw' in dbInfo) {
        console.log(`DB:          ${dbInfo.raw}`);
      } else {
        const userPart = dbInfo.username
          ? `${dbInfo.username}${dbInfo.password ? ':***' : ''}@`
          : '';
        const safeUrl = `${dbInfo.driver}://${userPart}${dbInfo.host}${dbInfo.port ? `:${dbInfo.port}` : ''}/${dbInfo.database}`;

        console.log(
          `DB host:     ${dbInfo.host}${dbInfo.port ? `:${dbInfo.port}` : ''}`,
        );
        console.log(`DB name:     ${dbInfo.database || '-'}`);
        console.log(
          `DB url:      ${showFull ? process.env.DATABASE_URL : safeUrl}`,
        );
      }
    }

    console.log(`Admin email: ${adminEmail ?? '-'}`);
    console.log(
      `Admin pass:  ${showFull ? (adminPassword ?? '-') : maskSecret(adminPassword) || '-'}`,
    );
    console.log(`AI base:     ${ollamaInfo.baseUrl || '-'}`);
    console.log(`AI model:    ${ollamaInfo.model || '-'}`);
    console.log(`AI timeout:  ${ollamaInfo.timeoutMs || '-'} ms`);
    console.log('SHOW_BOOT_INFO: true (mask) | full (no mask)');
    console.log('==========================================================\n');
  }
}
void bootstrap();
