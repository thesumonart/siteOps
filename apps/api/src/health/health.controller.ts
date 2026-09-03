import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { pingDatabase } from '@siteops/database';

import { ApiException } from '../common/errors/api-exception';
import { Public } from '../common/decorators/public.decorator';

interface LivenessResult {
  readonly status: 'ok';
  readonly uptimeSeconds: number;
}

interface ReadinessResult {
  readonly status: 'ready';
  readonly checks: {
    readonly database: 'ok';
  };
}

/**
 * Liveness and readiness probes.
 *
 * `/health` answers "is this process running" and must never touch a
 * dependency — a slow database would otherwise cause the platform to restart a
 * healthy API. `/ready` answers "can this process serve traffic" and does check
 * dependencies, so a deploy is not routed traffic before MongoDB is reachable.
 */
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): LivenessResult {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<ReadinessResult> {
    const databaseReachable = await pingDatabase();
    if (!databaseReachable) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'The database is not reachable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ready', checks: { database: 'ok' } };
  }
}
