/* eslint-disable no-console -- this is an operator-facing CLI script */
import {
  AuditLogModel,
  IncidentModel,
  NotificationModel,
  NotificationSettingsModel,
  OrganizationMemberModel,
  OrganizationModel,
  WebsiteCheckModel,
  WebsiteModel,
} from '../models';
import { connectToDatabase, disconnectFromDatabase } from '../connection';

/**
 * Applies every declared index to the connected database.
 *
 * Runtime `autoIndex` is disabled in production because an index build issued
 * by a starting process can stall a live cluster. Index changes are therefore
 * an explicit deployment step: run this script, then deploy.
 */
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exitCode = 1;
    return;
  }

  await connectToDatabase({ uri, appName: 'siteops-index-sync' });

  const models = [
    OrganizationModel,
    OrganizationMemberModel,
    WebsiteModel,
    WebsiteCheckModel,
    IncidentModel,
    NotificationModel,
    NotificationSettingsModel,
    AuditLogModel,
  ];

  for (const model of models) {
    await model.syncIndexes();
    const indexes = await model.listIndexes();
    console.log(`${model.collection.collectionName}: ${indexes.length} indexes`);
  }

  await disconnectFromDatabase();
}

main().catch((error: unknown) => {
  console.error('Index sync failed:', error);
  process.exitCode = 1;
});
