import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class DriveClient implements ServiceClient {
  readonly id = 'drive';
  constructor(private readonly creds: ServiceCredentials = {}) {}
  isConfigured(): boolean { return Boolean(this.creds.token); }

  async listRecent(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
  async search(_query: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
}

export class CalendarClient implements ServiceClient {
  readonly id = 'calendar';
  constructor(private readonly creds: ServiceCredentials = {}) {}
  isConfigured(): boolean { return Boolean(this.creds.token); }

  async listEvents(_timeMin?: string, _timeMax?: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
  async createEvent(_payload: unknown): Promise<unknown> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return { ok: true };
  }
}

export class GmailClient implements ServiceClient {
  readonly id = 'gmail';
  constructor(private readonly creds: ServiceCredentials = {}) {}
  isConfigured(): boolean { return Boolean(this.creds.token); }

  async searchThreads(_query: string): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
  async listLabels(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
}
