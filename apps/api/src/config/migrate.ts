import { CompanyProfile } from '../models/index.js';

/**
 * Idempotent data migrations run at boot. Each guard makes re-runs safe.
 */
export async function runMigrations(): Promise<void> {
  // Collapse company profiles to a single canonical doc keyed by singletonKey.
  // Older code paths could fork a second profile; merge any non-empty legacy
  // fields into the canonical one, then remove the extras.
  const profiles = await CompanyProfile.find().sort({ createdAt: 1 });
  if (profiles.length) {
    const canonical =
      profiles.find((p) => p.get('singletonKey') === 'company') ?? profiles[0];
    canonical.set('singletonKey', 'company');
    for (const other of profiles) {
      if (String(other._id) === String(canonical._id)) continue;
      for (const [key, val] of Object.entries(other.toObject())) {
        if (['_id', '__v', 'singletonKey', 'createdAt', 'updatedAt'].includes(key)) continue;
        const cur = canonical.get(key);
        if ((cur === undefined || cur === null || cur === '') && val) {
          canonical.set(key, val);
        }
      }
      await other.deleteOne();
    }
    await canonical.save();
    if (profiles.length > 1) console.log('[migrate] merged duplicate company profiles');
  }
  // Ensure indexes declared on schemas exist (unique singletonKey, etc.).
  await CompanyProfile.syncIndexes();
}
