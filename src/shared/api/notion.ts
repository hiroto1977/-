import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class NotionClient implements ServiceClient {
  readonly id = 'notion';
  constructor(private readonly creds: ServiceCredentials = {}) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  async search(_query: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }

  async createPage(_payload: unknown): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { ok: true };
  }
}
