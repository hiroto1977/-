export interface ServiceCredentials {
  token?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface ServiceClient {
  readonly id: string;
  isConfigured(): boolean;
}

export class NotConfiguredError extends Error {
  constructor(serviceId: string) {
    super(`Service "${serviceId}" is not configured. Provide credentials before calling APIs.`);
    this.name = 'NotConfiguredError';
  }
}
