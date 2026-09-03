import { Module } from '@nestjs/common';

import { CheckRepository } from './check.repository.js';
import { IncidentRepository } from './incident.repository.js';

/**
 * Data access for recorded monitoring history, with no services attached.
 *
 * It exists as its own module so that both the website module (which shows a
 * 24-hour rollup on every row of its table) and the monitoring module (which
 * owns the incident and stats endpoints) can read this data without importing
 * each other — the stats service already needs the website repository, so a
 * single combined module would be a cycle.
 */
@Module({
  providers: [CheckRepository, IncidentRepository],
  exports: [CheckRepository, IncidentRepository],
})
export class MonitoringDataModule {}
