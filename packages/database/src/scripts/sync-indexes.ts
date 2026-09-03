/* eslint-disable no-console -- this is an operator-facing CLI script */
import { connectToDatabase, disconnectFromDatabase } from '../connection.js';
import { syncAllIndexes } from '../sync-indexes.js';

/**
 * Applies every declared index to the connected database.
 *
 * Index changes are an explicit deployment step: run this, then deploy. See
 * `syncAllIndexes` for why nothing builds them implicitly.
 */
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exitCode = 1;
    return;
  }

  await connectToDatabase({ uri, appName: 'siteops-index-sync' });

  for (const result of await syncAllIndexes()) {
    console.log(`${result.collection}: ${String(result.indexes)} indexes`);
  }

  await disconnectFromDatabase();
}

main().catch((error: unknown) => {
  console.error('Index sync failed:', error);
  process.exitCode = 1;
});
