import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class CanvaClient implements ServiceClient {
  readonly id = 'canva';
  constructor(private readonly creds: ServiceCredentials = {}) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  async searchDesigns(_query: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }

  async generateDesign(_prompt: string): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { ok: true };
  }

  async exportDesign(_designId: string, _format: string): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { ok: true };
  }
}
