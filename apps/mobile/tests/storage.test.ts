import type { CompanionProfile, ModelConnection } from '@viraha/companion-core';

import type { SqlDatabase } from '../src/storage/database';
import { MobileRepository } from '../src/storage/repository';
import { createMobileSchema } from '../src/storage/schema';

function fakeDatabase(overrides: Partial<SqlDatabase> = {}): SqlDatabase {
  return {
    execAsync: async () => undefined,
    runAsync: async () => ({ changes: 1, lastInsertRowId: 0 }),
    getFirstAsync: async <T>() => null as T | null,
    getAllAsync: async <T>() => [] as T[],
    ...overrides,
  };
}

describe('mobile storage', () => {
  it('creates the local companion chat schema in WAL mode', async () => {
    const execAsync = jest.fn<Promise<void>, [string]>(async () => undefined);

    await createMobileSchema(fakeDatabase({ execAsync }));

    const sql = execAsync.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('PRAGMA journal_mode = WAL');
    expect(sql).toContain('PRAGMA foreign_keys = ON');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS companions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS model_connections/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS sessions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS messages/);
    expect(sql).toMatch(
      /companion_id TEXT NOT NULL REFERENCES companions\s*\(id\)\s*ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /session_id TEXT NOT NULL REFERENCES sessions\s*\(id\)\s*ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS sessions_companion\s+ON sessions\s*\(companion_id\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS messages_session_created\s+ON messages\s*\(session_id, created_at\)/,
    );
    expect(sql).not.toMatch(/api[_ ]?key|secret/i);
  });

  it('maps messages to camelCase in chronological order', async () => {
    const getAllAsync = jest.fn(async () => [
      {
        id: 'message-1',
        session_id: 'session-1',
        role: 'user',
        content: 'Hello',
        created_at: '2026-07-11T09:00:00.000Z',
      },
      {
        id: 'message-2',
        session_id: 'session-1',
        role: 'assistant',
        content: 'Hi',
        created_at: '2026-07-11T09:00:01.000Z',
      },
    ]);
    const repository = new MobileRepository(
      fakeDatabase({ getAllAsync: getAllAsync as SqlDatabase['getAllAsync'] }),
    );

    await expect(repository.listMessages('session-1')).resolves.toEqual([
      {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
        createdAt: '2026-07-11T09:00:00.000Z',
      },
      {
        id: 'message-2',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Hi',
        createdAt: '2026-07-11T09:00:01.000Z',
      },
    ]);
    expect(getAllAsync).toHaveBeenCalledWith(
      expect.stringMatching(
        /WHERE session_id = \?\s+ORDER BY created_at ASC, rowid ASC/,
      ),
      ['session-1'],
    );
  });

  it('persists and maps companion, connection, session, and message records', async () => {
    const companion: CompanionProfile = {
      id: 'companion-1',
      templateId: 'gentle-friend',
      category: 'gentle',
      name: 'Mira',
      userDisplayName: 'Lin',
      userAgeBand: 'adult',
      description: 'A steady companion.',
      createdAt: '2026-07-11T08:00:00.000Z',
    };
    const connection: ModelConnection = {
      kind: 'byok',
      baseUrl: 'https://api.example.com',
      model: 'example-chat',
      credentialId: 'primary-key',
    };
    const runAsync = jest.fn<
      Promise<{ changes: number; lastInsertRowId: number }>,
      Parameters<SqlDatabase['runAsync']>
    >(async () => ({ changes: 1, lastInsertRowId: 0 }));
    const getFirstAsync = jest
      .fn()
      .mockResolvedValueOnce({
        id: companion.id,
        template_id: companion.templateId,
        category: companion.category,
        name: companion.name,
        user_display_name: companion.userDisplayName,
        user_age_band: companion.userAgeBand,
        description: companion.description,
        created_at: companion.createdAt,
      })
      .mockResolvedValueOnce({
        id: 'primary',
        kind: connection.kind,
        base_url: connection.baseUrl,
        model: connection.model,
        credential_id: connection.credentialId,
      });
    const repository = new MobileRepository(
      fakeDatabase({
        runAsync,
        getFirstAsync: getFirstAsync as SqlDatabase['getFirstAsync'],
      }),
    );

    await repository.saveCompanion(companion);
    await expect(repository.getCompanion()).resolves.toEqual(companion);
    expect(getFirstAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /SELECT \* FROM companions\s+ORDER BY created_at ASC, rowid ASC\s+LIMIT 1/,
      ),
      [],
    );
    await repository.saveConnection('primary', connection);
    await expect(repository.getConnection()).resolves.toEqual(connection);
    await repository.createSession({
      id: 'session-1',
      companionId: companion.id,
      createdAt: '2026-07-11T08:30:00.000Z',
    });
    await repository.addMessage({
      id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Hello',
      createdAt: '2026-07-11T09:00:00.000Z',
    });

    expect(runAsync).toHaveBeenCalledTimes(4);
    for (const [sql, parameters] of runAsync.mock.calls) {
      expect(sql).toContain('?');
      expect(parameters).toBeInstanceOf(Array);
      expect(sql).not.toMatch(/api[_ ]?key|secret/i);
    }
    expect(runAsync.mock.calls[1]?.[1]).toEqual([
      'primary',
      'byok',
      'https://api.example.com',
      'example-chat',
      'primary-key',
    ]);
  });
});
