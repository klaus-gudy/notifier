import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

/**
 * Logs every request twice: once on arrival, once on completion. The arrival
 * line matters for a proxy — if the downstream provider hangs, the request is
 * still visible in the terminal before a status code ever exists.
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const startedAt = Date.now();

    this.logger.log(`--> ${method} ${originalUrl}`);

    if (this.config.get<boolean>('logRequestBody') && this.hasBody(req)) {
      this.logger.debug(`    body ${JSON.stringify(req.body)}`);
    }

    res.on('finish', () => {
      const line = `<-- ${method} ${originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`;

      if (res.statusCode >= 500) {
        this.logger.error(line);
      } else if (res.statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    next();
  }

  private hasBody(req: Request): boolean {
    return (
      typeof req.body === 'object' &&
      req.body !== null &&
      Object.keys(req.body as object).length > 0
    );
  }
}
