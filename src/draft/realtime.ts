import * as Ably from 'ably';

export type RealtimeClient = Ably.Realtime;
export type RealtimeChannel = Ably.Types.RealtimeChannelCallbacks;

export interface ConnectOptions {
  clientId: string;
}

export const createRealtimeClient = (options: ConnectOptions): { client: RealtimeClient; channel: RealtimeChannel } => {
  const apiKey = import.meta.env.VITE_ABLY_API_KEY;

  if (!apiKey) {
    throw new Error('VITE_ABLY_API_KEY is not configured. Set it in your Netlify / local env.');
  }

  const client = new Ably.Realtime({
    key: apiKey,
    clientId: options.clientId
  });

  const channel = client.channels.get('celebrity-draft-room');

  return { client, channel };
};


