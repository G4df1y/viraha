import * as SecureStore from 'expo-secure-store';

export interface SecretStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

function providerKey(id: string): string {
  const credentialId = id.trim();
  if (!credentialId) {
    throw new Error('Credential id is required');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(credentialId)) {
    throw new Error('Credential id contains invalid characters');
  }

  return `provider.${credentialId}`;
}

export class ProviderCredentialStore {
  constructor(private readonly storage: SecretStorage = SecureStore) {}

  async save(id: string, apiKey: string): Promise<void> {
    await this.storage.setItemAsync(providerKey(id), apiKey);
  }

  async read(id: string): Promise<string | null> {
    return this.storage.getItemAsync(providerKey(id));
  }

  async remove(id: string): Promise<void> {
    await this.storage.deleteItemAsync(providerKey(id));
  }
}
