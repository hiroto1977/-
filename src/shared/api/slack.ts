import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class SlackClient implements ServiceClient {
  readonly id = 'slack';
  constructor(private readonly creds: ServiceCredentials = {}) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  async searchChannels(_query: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }

  async sendMessage(_channelId: string, _text: string): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { ok: true };
  }

  async readThread(_channelId: string, _threadTs: string): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return null;
  }
}
