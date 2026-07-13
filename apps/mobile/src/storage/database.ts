import type { SQLiteBindParams, SQLiteRunResult } from 'expo-sqlite';

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult>;
  getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]>;
}

export async function openMobileDatabase(): Promise<SqlDatabase> {
  const SQLite = await import('expo-sqlite');
  return SQLite.openDatabaseAsync('viraha.db');
}
