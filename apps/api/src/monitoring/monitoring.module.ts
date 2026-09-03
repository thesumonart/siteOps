import { Module } from '@nestjs/common';

import { WebsiteModule } from '../websites/website.module.js';
import { IncidentService } from './incident.service.js';
import {
  DashboardController,
  IncidentController,
  NotificationSettingsController,
  WebsiteMonitoringController,
} from './monitoring.controller.js';
import { MonitoringDataModule } from './monitoring-data.module.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { StatsService } from './stats.service.js';

/**
 * The read side of monitoring: incidents, uptime statistics, check history and
 * alert preferences.
 *
 * Nothing here writes monitoring data — that is the worker's job, and it has no
 * HTTP layer at all.
 */
@Module({
  imports: [MonitoringDataModule, WebsiteModule],
  controllers: [
    IncidentController,
    WebsiteMonitoringController,
    DashboardController,
    NotificationSettingsController,
  ],
  providers: [IncidentService, StatsService, NotificationSettingsService],
})
export class MonitoringModule {}
