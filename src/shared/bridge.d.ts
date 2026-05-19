import type { ServiceHubBridge } from '../preload/preload';

declare global {
  interface Window {
    serviceHub: ServiceHubBridge;
  }
}

export {};
