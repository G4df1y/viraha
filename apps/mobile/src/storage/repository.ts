import type {
  CompanionCategory,
  CompanionProfile,
  ModelConnection,
  UserAgeBand,
} from '@viraha/companion-core';

import type { SqlDatabase } from './database';

interface CompanionRow {
  id: string;
  template_id: string;
  category: CompanionCategory;
  name: string;
  user_display_name: string;
  user_age_band: UserAgeBand;
  description: string;
  created_at: string;
}

interface ConnectionRow {
  id: string;
  kind: ModelConnection['kind'];
  base_url: string;
  model: string;
  credential_id: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: StoredMessage['role'];
  content: string;
  created_at: string;
}

export interface StoredSession {
  id: string;
  companionId: string;
  createdAt: string;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

function mapCompanion(row: CompanionRow): CompanionProfile {
  return {
    id: row.id,
    templateId: row.template_id,
    category: row.category,
    name: row.name,
    userDisplayName: row.user_display_name,
    userAgeBand: row.user_age_band,
    description: row.description,
    createdAt: row.created_at,
  };
}

function mapConnection(row: ConnectionRow): ModelConnection {
  return {
    kind: row.kind,
    baseUrl: row.base_url,
    model: row.model,
    credentialId: row.credential_id,
  };
}

function mapMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export class MobileRepository {
  constructor(private readonly database: SqlDatabase) {}

  async saveCompanion(companion: CompanionProfile): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO companions (
        id, template_id, category, name, user_display_name, user_age_band,
        description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        template_id = excluded.template_id,
        category = excluded.category,
        name = excluded.name,
        user_display_name = excluded.user_display_name,
        user_age_band = excluded.user_age_band,
        description = excluded.description,
        created_at = excluded.created_at`,
      [
        companion.id,
        companion.templateId,
        companion.category,
        companion.name,
        companion.userDisplayName,
        companion.userAgeBand,
        companion.description,
        companion.createdAt,
      ],
    );
  }

  async getCompanion(): Promise<CompanionProfile | null> {
    const row = await this.database.getFirstAsync<CompanionRow>(
      `SELECT * FROM companions
      ORDER BY created_at ASC, rowid ASC
      LIMIT 1`,
      [],
    );
    return row ? mapCompanion(row) : null;
  }

  async saveConnection(id: string, value: ModelConnection): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO model_connections (id, kind, base_url, model, credential_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        base_url = excluded.base_url,
        model = excluded.model,
        credential_id = excluded.credential_id`,
      [id, value.kind, value.baseUrl, value.model, value.credentialId],
    );
  }

  async getConnection(id = 'primary'): Promise<ModelConnection | null> {
    const row = await this.database.getFirstAsync<ConnectionRow>(
      'SELECT * FROM model_connections WHERE id = ?',
      [id],
    );
    return row ? mapConnection(row) : null;
  }

  async createSession(session: StoredSession): Promise<void> {
    await this.database.runAsync(
      'INSERT OR IGNORE INTO sessions (id, companion_id, created_at) VALUES (?, ?, ?)',
      [session.id, session.companionId, session.createdAt],
    );
  }

  async addMessage(message: StoredMessage): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO messages (id, session_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)`,
      [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.createdAt,
      ],
    );
  }

  async listMessages(sessionId: string): Promise<StoredMessage[]> {
    const rows = await this.database.getAllAsync<MessageRow>(
      `SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY created_at ASC, rowid ASC`,
      [sessionId],
    );
    return rows.map(mapMessage);
  }
}
