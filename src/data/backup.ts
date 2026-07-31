/**
 * Export / import / wipe.
 *
 * The data is yours and lives only on this device, so an export that
 * round-trips exactly is the substitute for a cloud backup. It is also the
 * migration path: this JSON maps 1:1 onto the corrected Postgres schema in
 * Part 3 of the build map.
 */

import { getDB, resetDBCache, DB_NAME } from './db';

export const BACKUP_FORMAT = 'praxis.backup.v1';

const STORES = [
  'settings',
  'categories',
  'commitments',
  'options',
  'predictions',
  'resolutions',
  'premortems',
  'constraints',
  'stocks',
  'flows',
  'flowLogs',
  'stockLogs',
  'interventions',
  'habitLoops',
  'reframingLogs',
  'gameSketches',
  'alerts',
] as const;

export interface Backup {
  format: string;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportAll(): Promise<Backup> {
  const db = await getDB();
  const data: Record<string, unknown[]> = {};
  for (const store of STORES) {
    data[store] = await db.getAll(store);
  }
  return { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data };
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportAll();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `praxis-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  ok: boolean;
  message: string;
  counts: Record<string, number>;
}

/**
 * Replaces everything. Destructive by design — the caller confirms first,
 * and the UI offers to download a backup of the current state before it runs.
 */
export async function importBackup(json: string): Promise<ImportResult> {
  let parsed: Backup;
  try {
    parsed = JSON.parse(json) as Backup;
  } catch {
    return { ok: false, message: 'That file is not valid JSON.', counts: {} };
  }
  if (parsed.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      message: `Unrecognised backup format "${parsed.format ?? 'none'}". Expected ${BACKUP_FORMAT}.`,
      counts: {},
    };
  }

  const db = await getDB();
  const counts: Record<string, number> = {};
  for (const store of STORES) {
    const rows = (parsed.data?.[store] ?? []) as unknown[];
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    for (const row of rows) {
      await tx.store.put(row as never);
    }
    await tx.done;
    counts[store] = rows.length;
  }
  return { ok: true, message: 'Restored.', counts };
}

export async function wipeEverything(): Promise<void> {
  const db = await getDB();
  db.close();
  resetDBCache();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
