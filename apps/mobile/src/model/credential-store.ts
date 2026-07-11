import * as SecureStore from 'expo-secure-store';

export interface SecretStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export class ProviderCredentialStore {
  constructor(private readonly storage: SecretStorage = SecureStore) {}

  save(id: string, apiKey: string): Promise<void> {
    return this.storage.setItemAsync(`provider:${id}`, apiKey);
  }

  read(id: string): Promise<string | null> {
    return this.storage.getItemAsync(`provider:${id}`);
  }

  remove(id: string): Promise<void> {
    return this.storage.deleteItemAsync(`provider:${id}`);
  }
}
