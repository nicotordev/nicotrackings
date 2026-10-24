import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import type {
  TrackingProvider,
  RegisterTrackingRequest,
  RegisterTrackingResponse,
  TrackingInfo,
  TrackingEventInfo,
} from './types.js';

interface Track17Config {
  apiKey: string;
  baseUrl?: string;
}

interface Track17RegisterResponse {
  code: number;
  data: {
    accepted: Array<{
      number: string;
      carrier: number;
    }>;
    rejected: Array<{
      number: string;
      error: {
        code: number;
        message: string;
      };
    }>;
  };
}

interface Track17TrackInfo {
  number: string;
  carrier: number;
  track_info: {
    latest_status: {
      status: string;
      sub_status: string;
      sub_status_descr: string;
    };
    latest_event: {
      time_utc: string;
      time_iso: string;
      description: string;
      location: string;
      stage: string;
    };
    tracking: Array<{
      date: string;
      time_iso: string;
      description: string;
      location: string;
      stage: string;
      sub_status: string;
    }>;
  };
}

interface Track17GetResponse {
  code: number;
  data: {
    accepted: Track17TrackInfo[];
    rejected: Array<{
      number: string;
      error: {
        code: number;
        message: string;
      };
    }>;
  };
}

export class Track17Provider implements TrackingProvider {
  public readonly name = '17TRACK';
  private readonly client: AxiosInstance;

  constructor(config: Track17Config) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.17track.net/track/v2.2',
      headers: {
        '17token': config.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async register(request: RegisterTrackingRequest): Promise<RegisterTrackingResponse> {
    try {
      const payload = [
        {
          number: request.trackingNumber,
          carrier: request.carrier ? parseInt(request.carrier, 10) : undefined,
        },
      ];

      logger.debug({ payload }, 'Registering tracking number with 17TRACK');

      const response = await this.client.post<Track17RegisterResponse>('/register', payload);

      if (response.data.code !== 0) {
        logger.warn({ response: response.data }, '17TRACK API returned non-zero code');
        return {
          success: false,
          trackingNumber: request.trackingNumber,
          carrier: null,
          error: `API error code: ${response.data.code}`,
        };
      }

      if (response.data.data.accepted.length > 0) {
        const accepted = response.data.data.accepted[0];
        if (!accepted) {
          throw new Error('Accepted array is empty');
        }
        return {
          success: true,
          trackingNumber: accepted.number,
          carrier: accepted.carrier.toString(),
          error: null,
        };
      }

      if (response.data.data.rejected.length > 0) {
        const rejected = response.data.data.rejected[0];
        if (!rejected) {
          throw new Error('Rejected array is empty');
        }
        return {
          success: false,
          trackingNumber: request.trackingNumber,
          carrier: null,
          error: rejected.error.message,
        };
      }

      return {
        success: false,
        trackingNumber: request.trackingNumber,
        carrier: null,
        error: 'Unknown response format',
      };
    } catch (error) {
      logger.error({ error, trackingNumber: request.trackingNumber }, 'Failed to register tracking number');
      return {
        success: false,
        trackingNumber: request.trackingNumber,
        carrier: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo | null> {
    const results = await this.batchGetTrackingInfo([trackingNumber]);
    return results.get(trackingNumber) || null;
  }

  async batchGetTrackingInfo(trackingNumbers: string[]): Promise<Map<string, TrackingInfo>> {
    const results = new Map<string, TrackingInfo>();

    if (trackingNumbers.length === 0) {
      return results;
    }

    try {
      const payload = trackingNumbers.map(number => ({ number }));

      logger.debug({ count: trackingNumbers.length }, 'Fetching tracking info from 17TRACK');

      const response = await this.client.post<Track17GetResponse>('/gettrackinfo', payload);

      if (response.data.code !== 0) {
        logger.warn({ response: response.data }, '17TRACK API returned non-zero code');
        return results;
      }

      for (const item of response.data.data.accepted) {
        const events: TrackingEventInfo[] = item.track_info.tracking.map(event => ({
          status: event.sub_status || event.stage,
          description: event.description,
          location: event.location || null,
          timestamp: new Date(event.time_iso),
        }));

        events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        const info: TrackingInfo = {
          trackingNumber: item.number,
          carrier: item.carrier.toString(),
          status: item.track_info.latest_status.sub_status || item.track_info.latest_status.status || null,
          lastEvent: item.track_info.latest_event.description || null,
          lastUpdate: item.track_info.latest_event.time_iso ? new Date(item.track_info.latest_event.time_iso) : null,
          events,
        };

        results.set(item.number, info);
      }

      if (response.data.data.rejected.length > 0) {
        logger.debug(
          { rejected: response.data.data.rejected },
          'Some tracking numbers were rejected'
        );
      }
    } catch (error) {
      logger.error({ error, trackingNumbers }, 'Failed to fetch tracking info');
    }

    return results;
  }
}
