import {
  IncidentModel,
  NotificationModel,
  NotificationSettingsModel,
  OrganizationMemberModel,
  OrganizationModel,
  UserModel,
  WebsiteCheckModel,
  WebsiteModel,
  connectToDatabase,
  disconnectFromDatabase,
} from '@siteops/database';

import { env } from '../config/env.js';

/**
 * Real-database test harness.
 *
 * The guarantees these integration tests exist to prove — the unique partial
 * index that allows at most one open incident per website, the unique
 * `dedupeKey` index that makes a duplicate notification impossible — are
 * enforced by MongoDB itself, not by application code. A mocked model can
 * never actually prove a unique index rejects a duplicate insert; only a real
 * database can. See the "Test" step in `.github/workflows/ci.yml`.
 */

/**
 * Thunks rather than a bare array of models: TypeScript's overload resolution
 * for a method call on a *union* of `Model<T>` types (`Model<A> | Model<B>`)
 * does not behave like calling each variant separately — it can silently pick
 * a mismatched overload. Closing over each concretely-typed model inside its
 * own function sidesteps the union entirely.
 */
const SYNC_INDEXES: readonly (() => Promise<unknown>)[] = [
  () => OrganizationModel.syncIndexes(),
  () => OrganizationMemberModel.syncIndexes(),
  () => UserModel.syncIndexes(),
  () => WebsiteModel.syncIndexes(),
  () => WebsiteCheckModel.syncIndexes(),
  () => IncidentModel.syncIndexes(),
  () => NotificationModel.syncIndexes(),
  () => NotificationSettingsModel.syncIndexes(),
];

const CLEAR_COLLECTIONS: readonly (() => Promise<unknown>)[] = [
  () => OrganizationModel.deleteMany({}).exec(),
  () => OrganizationMemberModel.deleteMany({}).exec(),
  () => UserModel.deleteMany({}).exec(),
  () => WebsiteModel.deleteMany({}).exec(),
  () => WebsiteCheckModel.deleteMany({}).exec(),
  () => IncidentModel.deleteMany({}).exec(),
  () => NotificationModel.deleteMany({}).exec(),
  () => NotificationSettingsModel.deleteMany({}).exec(),
];

let connected = false;

export async function connectTestDatabase(): Promise<void> {
  if (connected) return;

  await connectToDatabase({ uri: env.MONGODB_URI, appName: 'siteops-worker-test' });

  // Indexes are not built automatically outside development (see
  // `connection.ts`), so the unique indexes under test have to be created
  // explicitly here — without this, a "duplicate insert" test would pass for
  // the wrong reason: nothing would actually reject the duplicate.
  await Promise.all(SYNC_INDEXES.map((sync) => sync()));

  connected = true;
}

export async function disconnectTestDatabase(): Promise<void> {
  if (!connected) return;
  await disconnectFromDatabase();
  connected = false;
}

/** Clears every collection touched by these tests, run between test cases. */
export async function clearTestDatabase(): Promise<void> {
  await Promise.all(CLEAR_COLLECTIONS.map((clear) => clear()));
}
