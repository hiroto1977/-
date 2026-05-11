import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class WordPressClient implements ServiceClient {
  readonly id = 'wordpress';
  constructor(private readonly creds: ServiceCredentials = {}) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  async listSites(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    // TODO: GET https://public-api.wordpress.com/rest/v1.1/me/sites
    return [];
  }

  async createPostDraft(_siteId: string, _payload: unknown): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { ok: true };
  }

  async checkDomainAvailability(_domain: string): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { available: false };
  }
}
