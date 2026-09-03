import { pingDatabase } from '@siteops/database';
import { createServer, type Server } from 'node:http';

import { createLogger } from '../logging/logger.js';

const logger = createLogger('health');

export interface WorkerHealthState {
  /** False once shutdown has begun, so the platform stops routing to this instance. */
  readonly accepting: () => boolean;
  /** Epoch milliseconds of the last completed scheduler tick, or null before the first. */
  readonly lastTickAt: () => number | null;
}

/**
 * Minimal HTTP surface for platform probes.
 *
 * A background worker with no listening port is treated as crashed by most
 * low-cost hosts, and `/ready` is what stops traffic being routed to an
 * instance whose database has gone away. `/health` deliberately performs no
 * dependency I/O: a slow database must not trigger a restart loop.
 */
export function startHealthServer(port: number, state: WorkerHealthState): Server {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';

    const send = (status: number, body: unknown): void => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (url === '/health') {
      send(200, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
      return;
    }

    if (url === '/ready') {
      if (!state.accepting()) {
        send(503, { status: 'shutting_down' });
        return;
      }
      void pingDatabase().then((databaseReachable) => {
        if (!databaseReachable) {
          send(503, { status: 'not_ready', checks: { database: 'unreachable' } });
          return;
        }
        send(200, {
          status: 'ready',
          checks: { database: 'ok' },
          lastTickAt: state.lastTickAt(),
        });
      });
      return;
    }

    send(404, { status: 'not_found' });
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'health_server.listening');
  });

  return server;
}
