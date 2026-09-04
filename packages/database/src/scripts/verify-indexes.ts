/* eslint-disable no-console -- this is an operator-facing CLI script */
import { connectToDatabase, disconnectFromDatabase } from '../connection.js';
import { verifyAllIndexes } from '../verify-indexes.js';

/**
 * Reports missing indexes and exits non-zero if there are any.
 *
 * Run it straight after a deploy. A database that never had `indexes:sync`
 * applied serves every request correctly and enforces none of the product's
 * uniqueness guarantees, so nothing else in the system will tell you.
 */
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exitCode = 1;
    return;
  }

  await connectToDatabase({ uri, appName: 'siteops-index-verify' });
  const report = await verifyAllIndexes();

  for (const entry of report.collections) {
    if (entry.missing.length > 0) {
      console.error(`${entry.collection}: MISSING ${entry.missing.join(', ')}`);
    } else {
      console.log(`${entry.collection}: ok`);
    }
    if (entry.unexpected.length > 0) {
      // Not a failure: an index added by hand to diagnose a slow query is a
      // normal thing to find, and this script should not demand its removal.
      console.log(`${entry.collection}: also present ${entry.unexpected.join(', ')}`);
    }
  }

  if (report.missingCount > 0) {
    console.error(
      `\n${String(report.missingCount)} index(es) missing. Run: pnpm --filter @siteops/database indexes:sync`,
    );
    process.exitCode = 1;
  } else {
    console.log('\nEvery declared index is present.');
  }

  await disconnectFromDatabase();
}

main().catch((error: unknown) => {
  console.error('Index verification failed:', error);
  process.exitCode = 1;
});
