import { MongoClient, type Db, type ObjectId } from 'mongodb';

import { E2E_MONGODB_URI } from '../../playwright.config';

/**
 * Direct database access for test setup and teardown only.
 *
 * One thing genuinely needs it: cleanup has to remove the accounts and
 * organizations these tests create, and the API deliberately offers no route
 * to delete either. Everything else goes through the product's own screens.
 *
 * Nothing here asserts anything. A test that checked application behaviour by
 * reading the database would pass even if the API served something different.
 */

let client: MongoClient | null = null;

export async function getDb(): Promise<Db> {
  client ??= await MongoClient.connect(E2E_MONGODB_URI);
  return client.db();
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
}

/** Removes everything one test account created, so runs do not accumulate. */
export async function deleteAccount(email: string): Promise<void> {
  const db = await getDb();
  const user = await db.collection<{ _id: ObjectId }>('user').findOne({ email });
  if (!user) return;

  const userId = user._id;
  const memberships = await db
    .collection<{ organizationId: ObjectId }>('organization_members')
    .find({ userId })
    .toArray();
  const organizationIds = memberships.map((entry) => entry.organizationId);

  if (organizationIds.length > 0) {
    const filter = { organizationId: { $in: organizationIds } };
    for (const collection of [
      'websites',
      'website_checks',
      'incidents',
      'notifications',
      'notification_settings',
      'invitations',
      'audit_logs',
      'organization_members',
    ]) {
      await db.collection(collection).deleteMany(filter);
    }
    await db.collection('organizations').deleteMany({ _id: { $in: organizationIds } });
  }

  for (const collection of ['session', 'account', 'verification']) {
    await db.collection(collection).deleteMany({ userId });
  }
  await db.collection('verification').deleteMany({ identifier: { $regex: escapeRegex(email) } });
  await db.collection('user').deleteOne({ _id: userId });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
