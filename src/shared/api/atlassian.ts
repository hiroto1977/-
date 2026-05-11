import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class AtlassianClient implements ServiceClient {
  readonly id = 'atlassian';
  constructor(private readonly creds: ServiceCredentials = {}) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token && this.creds.baseUrl);
  }

  async searchJira(_jql: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }

  async getConfluencePage(_pageId: string): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return null;
  }

  async listCompassComponents(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
}
