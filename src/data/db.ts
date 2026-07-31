/**
 * Local-first persistence.
 *
 * All data lives in IndexedDB on this device. No account, no server, no
 * third party. §6.3's privacy claim is therefore trivially true here in a
 * way it was not in the v2.0 spec: there is nowhere else for it to go.
 *
 * F32. The spec listed `expo-sqlite` for "local persistence with AUTOMATIC
 * sync" to Supabase. No such automatic sync exists — you would be writing a
 * conflict-resolution layer, one of the harder things in client engineering,
 * and it appeared nowhere in the roadmap's estimates. The store shape here
 * maps 1:1 onto the corrected Postgres schema, and every write goes through
 * `repo`, so adding a sync backend later is a contained change rather than
 * a rewrite.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Category,
  Commitment,
  CommitmentOption,
  Constraint,
  Flow,
  FlowLog,
  GameSketch,
  HabitLoop,
  Intervention,
  PredictionSet,
  Premortem,
  ReframingLog,
  Resolution,
  Settings,
  Stock,
  StockLog,
} from '../domain/types';

export const DB_NAME = 'praxis';
export const DB_VERSION = 1;

/** Records the last time each flow raised an alert, for the 7-day cooldown. */
export interface AlertRecord {
  flowId: string;
  lastAlertedOn: string;
}

export interface PraxisDB extends DBSchema {
  settings: { key: string; value: Settings };
  categories: { key: string; value: Category };
  commitments: {
    key: string;
    value: Commitment;
    indexes: {
      'by-date': string;
      'by-tier': string;
      'by-status': string;
      'by-tier-date': [string, string];
      'by-review-due': string;
    };
  };
  options: { key: string; value: CommitmentOption; indexes: { 'by-commitment': string } };
  predictions: { key: string; value: PredictionSet; indexes: { 'by-commitment': string } };
  resolutions: { key: string; value: Resolution; indexes: { 'by-commitment': string } };
  premortems: { key: string; value: Premortem; indexes: { 'by-commitment': string } };
  constraints: { key: string; value: Constraint };
  stocks: { key: string; value: Stock };
  flows: { key: string; value: Flow; indexes: { 'by-stock': string } };
  flowLogs: {
    key: string;
    value: FlowLog;
    indexes: { 'by-flow': string; 'by-flow-date': [string, string]; 'by-date': string };
  };
  stockLogs: {
    key: string;
    value: StockLog;
    indexes: { 'by-stock': string; 'by-date': string };
  };
  interventions: { key: string; value: Intervention; indexes: { 'by-stock': string } };
  habitLoops: { key: string; value: HabitLoop; indexes: { 'by-flow': string } };
  reframingLogs: { key: string; value: ReframingLog };
  gameSketches: { key: string; value: GameSketch };
  alerts: { key: string; value: AlertRecord };
}

let dbPromise: Promise<IDBPDatabase<PraxisDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<PraxisDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PraxisDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('settings', { keyPath: 'id' });
        db.createObjectStore('categories', { keyPath: 'id' });

        const commitments = db.createObjectStore('commitments', { keyPath: 'id' });
        commitments.createIndex('by-date', 'localDate');
        commitments.createIndex('by-tier', 'tier');
        commitments.createIndex('by-status', 'status');
        commitments.createIndex('by-tier-date', ['tier', 'localDate']);
        commitments.createIndex('by-review-due', 'reviewDueAt');

        for (const name of ['options', 'predictions', 'resolutions', 'premortems'] as const) {
          const s = db.createObjectStore(name, { keyPath: 'id' });
          s.createIndex('by-commitment', 'commitmentId');
        }

        db.createObjectStore('constraints', { keyPath: 'id' });
        db.createObjectStore('stocks', { keyPath: 'id' });

        const flows = db.createObjectStore('flows', { keyPath: 'id' });
        flows.createIndex('by-stock', 'stockId');

        const flowLogs = db.createObjectStore('flowLogs', { keyPath: 'id' });
        flowLogs.createIndex('by-flow', 'flowId');
        flowLogs.createIndex('by-flow-date', ['flowId', 'localDate']);
        flowLogs.createIndex('by-date', 'localDate');

        const stockLogs = db.createObjectStore('stockLogs', { keyPath: 'id' });
        stockLogs.createIndex('by-stock', 'stockId');
        stockLogs.createIndex('by-date', 'localDate');

        const interventions = db.createObjectStore('interventions', { keyPath: 'id' });
        interventions.createIndex('by-stock', 'stockId');

        const habitLoops = db.createObjectStore('habitLoops', { keyPath: 'id' });
        habitLoops.createIndex('by-flow', 'flowId');

        db.createObjectStore('reframingLogs', { keyPath: 'id' });
        db.createObjectStore('gameSketches', { keyPath: 'id' });
        db.createObjectStore('alerts', { keyPath: 'flowId' });
      },
    });
  }
  return dbPromise;
}

/** Test hook — drops the cached connection so a fresh DB can be opened. */
export function resetDBCache(): void {
  dbPromise = null;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
