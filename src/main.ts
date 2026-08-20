import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Notifier')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // Lets the queue consumer stop cleanly on SIGTERM/SIGINT instead of
  // dropping its connection mid-message.
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<number>('port') ?? 3000;
  await app.listen(port);
  Logger.log(
    `Notifier listening on http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
  Logger.log(`Swagger UI on http://localhost:${port}/docs`, 'Bootstrap');
}
void bootstrap();
