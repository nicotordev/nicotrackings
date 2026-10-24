export interface TrackingInfo {
  trackingNumber: string;
  carrier: string | null;
  status: string | null;
  lastEvent: string | null;
  lastUpdate: Date | null;
  events: TrackingEventInfo[];
}

export interface TrackingEventInfo {
  status: string;
  description: string;
  location: string | null;
  timestamp: Date;
}

export interface RegisterTrackingRequest {
  trackingNumber: string;
  carrier: string | null;
}

export interface RegisterTrackingResponse {
  success: boolean;
  trackingNumber: string;
  carrier: string | null;
  error: string | null;
}

export interface TrackingProvider {
  name: string;
  register(request: RegisterTrackingRequest): Promise<RegisterTrackingResponse>;
  getTrackingInfo(trackingNumber: string): Promise<TrackingInfo | null>;
  batchGetTrackingInfo(trackingNumbers: string[]): Promise<Map<string, TrackingInfo>>;
}
