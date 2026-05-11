import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';

export class GithubClient implements ServiceClient {
  readonly id = 'github';
  constructor(private readonly creds: ServiceCredentials = {}) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  async listRepos(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    // TODO: GET https://api.github.com/user/repos
    return [];
  }

  async listPullRequests(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }

  async listIssues(): Promise<unknown[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return [];
  }
}
