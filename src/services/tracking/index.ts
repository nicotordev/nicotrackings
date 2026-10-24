import { Track17Provider } from './track17.js';
import { getConfig } from '../../config/env.js';
import type { TrackingProvider } from './types.js';

export * from './types.js';

let providerInstance: TrackingProvider | null = null;

export function createTrackingProvider(): TrackingProvider {
  const config = getConfig();
  providerInstance = new Track17Provider({
    apiKey: config.TRACK17_API_KEY,
  });
  return providerInstance;
}

export function getTrackingProvider(): TrackingProvider {
  if (!providerInstance) {
    throw new Error('Tracking provider not initialized. Call createTrackingProvider() first.');
  }
  return providerInstance;
}
