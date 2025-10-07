import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    compression({
      level: Number(process.env.COMPRESSION_LEVEL || 6),

      threshold: Number(process.env.COMPRESSION_THRESHOLD || 1024),

      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }

        return compression.filter(req, res);
      },

      memLevel: Number(process.env.COMPRESSION_MEM_LEVEL || 8),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('TaskFlow API')
    .setDescription('Task Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Health', 'Health check endpoints for monitoring')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`\n🚀 Application running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api`);
  console.log(`❤️  Health checks: http://localhost:${port}/health`);
  console.log(
    `🗜️  Compression: Level ${process.env.COMPRESSION_LEVEL || 6}, Threshold ${process.env.COMPRESSION_THRESHOLD || 1024} bytes`,
  );
  console.log('');
}
bootstrap();
