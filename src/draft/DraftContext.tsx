import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createRealtimeClient, RealtimeChannel, RealtimeClient } from './realtime';
import type { DraftState, LocalUser, WireMessage, DraftStatus, Drafter } from './types';
import type { Role } from '../App';

interface DraftContextValue {
  user: LocalUser | null;
  status: DraftStatus;
  state: DraftState | null;
  channel: RealtimeChannel | null;
  isLeader: boolean;
  isConnected: boolean;
  error: string | null;
  initDraftAsLeader(config: { totalRounds: number; celebrityList: string[] }): void;
  sendPick(celebrityName: string): void;
  resetDraft(): void;
  undoLastPick(): void;
}

const DraftContext = createContext<DraftContextValue | undefined>(undefined);

const defaultCelebrities: string[] = [
  'Taylor Swift',
  'LeBron James',
  'Beyoncé',
  'Lionel Messi',
  'Rihanna',
  'Tom Cruise',
  'Zendaya',
  'Billie Eilish',
  'The Rock',
  'Lady Gaga',
  'Ariana Grande',
  'Harry Styles',
  'Selena Gomez',
  'Drake',
  'Bruno Mars',
  'Scarlett Johansson',
  'Chris Hemsworth',
  'Keanu Reeves',
  'Jennifer Lawrence',
  'Dua Lipa'
];

const PRECONFIGURED_DRAFTERS: Omit<Drafter, 'isLeader'>[] = [
  {
    id: 'drafter-josh',
    name: 'Josh',
    order: 1,
    points: 250,
    bags: 3,
    rings: 0,
    trophies: 1
  },
  {
    id: 'drafter-jim',
    name: 'Jim',
    order: 2,
    points: 206,
    bags: 5,
    rings: 2,
    trophies: 0
  },
  {
    id: 'drafter-kyle',
    name: 'Kyle',
    order: 3,
    points: 128,
    bags: 4,
    rings: 0,
    trophies: 0
  },
  {
    id: 'drafter-pj',
    name: 'Pj',
    order: 4,
    points: 67,
    bags: 2,
    rings: 1,
    trophies: 0
  },
  {
    id: 'drafter-zaccheo',
    name: 'Zaccheo',
    order: 5,
    points: 18,
    bags: 1,
    rings: 0,
    trophies: 0
  },
  {
    id: 'drafter-cory',
    name: 'Cory',
    order: 6,
    points: 11,
    bags: 1,
    rings: 1,
    trophies: 0
  },
  {
    id: 'drafter-pat',
    name: 'Pat',
    order: 7,
    points: 0,
    bags: 0,
    rings: 0,
    trophies: 0
  }
];

const createInitialState = (leader: LocalUser, totalRounds: number, celebrityList: string[]): DraftState => {
  const now = new Date().toISOString();

  const drafters: Drafter[] = PRECONFIGURED_DRAFTERS.map((d) => ({
    ...d,
    isLeader: d.name.toLowerCase() === leader.name.toLowerCase()
  }));

  return {
    status: 'not-started',
    config: { totalRounds },
    drafters,
    picks: [],
    celebrities: celebrityList.map((name, idx) => ({
      id: `c-${idx}`,
      name
    })),
    currentRound: 1,
    currentPickIndex: 0,
    createdAt: now,
    updatedAt: now
  };
};

const getCurrentDrafter = (state: DraftState): Drafter | null => {
  if (!state.drafters.length) return null;
  const perRound = state.drafters.length;
  const indexInRound = state.currentPickIndex % perRound;
  const drafter = state.drafters[indexInRound];
  return drafter ?? null;
};

export const DraftProvider: React.FC<{
  name: string;
  role: Role | null;
  children: React.ReactNode;
}> = ({ name, role, children }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [state, setState] = useState<DraftState | null>(null);
  const [status, setStatus] = useState<DraftStatus>('not-started');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLeader = !!user && user.role === 'leader';

  useEffect(() => {
    if (!name || !role || user) return;

    const newUser: LocalUser = {
      id: `u-${Math.random().toString(36).slice(2, 10)}`,
      name,
      role
    };
    setUser(newUser);

    try {
      const { client: c, channel: ch } = createRealtimeClient({ clientId: newUser.id });
      setClient(c);
      setChannel(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to realtime service.');
    }
  }, [name, role, user]);

  useEffect(() => {
    if (!client) return;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    client.connection.on('connected', handleConnect);
    client.connection.on('disconnected', handleDisconnect);
    client.connection.on('suspended', handleDisconnect);

    return () => {
      client.connection.off('connected', handleConnect);
      client.connection.off('disconnected', handleDisconnect);
      client.connection.off('suspended', handleDisconnect);
      client.close();
    };
  }, [client]);

  useEffect(() => {
    if (!channel || !user) return;

    const onMessage = (msg: WireMessage) => {
      if (msg.type === 'state:replace') {
        setState(msg.payload);
        setStatus(msg.payload.status);
      } else if (msg.type === 'state:request') {
        if (!isLeader || !state) return;
        const outgoing: WireMessage = {
          type: 'state:replace',
          payload: state
        };
        channel.publish('state', outgoing);
      } else if (msg.type === 'action:pick') {
        if (!isLeader || !state) return;

        const { drafterId, drafterName, celebrityName } = msg.payload;

        // Map incoming drafter identity to the configured drafter seat.
        const drafterSeat =
          state.drafters.find((d) => d.id === drafterId) ??
          state.drafters.find((d) => d.name.toLowerCase() === drafterName.toLowerCase());

        if (!drafterSeat) {
          return;
        }

        const current = getCurrentDrafter(state);
        if (!current || current.id !== drafterSeat.id) {
          return;
        }

        const alreadyPicked = state.picks.some(
          (p) => p.celebrityName.toLowerCase() === celebrityName.toLowerCase()
        );
        if (alreadyPicked) return;

        const celeb = state.celebrities.find((c) => c.name.toLowerCase() === celebrityName.toLowerCase());
        if (!celeb) return;

        const nextIndex = state.currentPickIndex + 1;
        const totalSlots = state.config.totalRounds * state.drafters.length;
        const complete = nextIndex >= totalSlots;
        const perRound = state.drafters.length;
        const nextRound = Math.floor(nextIndex / perRound) + 1;

        const now = new Date().toISOString();
        const newState: DraftState = {
          ...state,
          picks: [
            ...state.picks,
            {
              id: `p-${state.picks.length + 1}`,
              overallNumber: state.picks.length + 1,
              round: state.currentRound,
                drafterId: drafterSeat.id,
                drafterName: drafterSeat.name,
              celebrityName,
              createdAt: now
            }
          ],
          celebrities: state.celebrities.map((c) =>
              c.id === celeb.id ? { ...c, draftedById: drafterSeat.id } : c
          ),
          currentPickIndex: nextIndex,
          currentRound: complete ? state.currentRound : nextRound,
          status: complete ? 'complete' : 'in-progress',
          updatedAt: now
        };

        setState(newState);
        setStatus(newState.status);

        const outgoing: WireMessage = {
          type: 'state:replace',
          payload: newState
        };
        channel.publish('state', outgoing);
      } else if (msg.type === 'action:reset') {
        if (!isLeader || !state || !user) return;
        const now = new Date().toISOString();
        const newState: DraftState = {
          ...state,
          picks: [],
          celebrities: state.celebrities.map((c) => ({ ...c, draftedById: undefined })),
          currentPickIndex: 0,
          currentRound: 1,
          status: 'not-started',
          updatedAt: now
        };
        setState(newState);
        setStatus(newState.status);
        const outgoing: WireMessage = { type: 'state:replace', payload: newState };
        channel.publish('state', outgoing);
      } else if (msg.type === 'action:undo') {
        if (!isLeader || !state) return;
        if (!state.picks.length) return;

        const last = state.picks[state.picks.length - 1];
        const remaining = state.picks.slice(0, -1);
        const now = new Date().toISOString();

        const newState: DraftState = {
          ...state,
          picks: remaining,
          celebrities: state.celebrities.map((c) =>
            c.draftedById === last.drafterId && c.name === last.celebrityName
              ? { ...c, draftedById: undefined }
              : c
          ),
          currentPickIndex: state.currentPickIndex - 1,
          currentRound: last.round,
          status: remaining.length ? 'in-progress' : 'not-started',
          updatedAt: now
        };

        setState(newState);
        setStatus(newState.status);

        const outgoing: WireMessage = { type: 'state:replace', payload: newState };
        channel.publish('state', outgoing);
      }
    };

    const messageListener = (msg: Ably.Types.Message) => {
      try {
        const data = msg.data as WireMessage;
        onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    channel.subscribe('state', messageListener);
    channel.subscribe('action', messageListener);

    const request: WireMessage = {
      type: 'state:request',
      payload: { requesterId: user.id }
    };
    channel.publish('state', request);

    return () => {
      channel.unsubscribe('state', messageListener);
      channel.unsubscribe('action', messageListener);
    };
  }, [channel, user, isLeader, state]);

  const initDraftAsLeader = (config: { totalRounds: number; celebrityList: string[] }) => {
    if (!user || !channel) return;
    if (!isLeader) return;

    const initial = createInitialState(user, config.totalRounds, config.celebrityList);
    setState(initial);
    setStatus(initial.status);

    const outgoing: WireMessage = {
      type: 'state:replace',
      payload: initial
    };
    channel.publish('state', outgoing);
  };

  const sendPick = (celebrityName: string) => {
    if (!user || !channel || !state) return;
    if (state.status === 'complete') return;

    // Try to map this user to one of the configured drafter seats by name.
    const seat =
      state.drafters.find((d) => d.name.toLowerCase() === user.name.toLowerCase()) ?? null;

    const drafterId = seat?.id ?? user.id;
    const drafterName = seat?.name ?? user.name;

    const msg: WireMessage = {
      type: 'action:pick',
      payload: {
        drafterId,
        drafterName,
        celebrityName
      }
    };
    channel.publish('action', msg);
  };

  const resetDraft = () => {
    if (!user || !channel || !isLeader) return;
    const msg: WireMessage = {
      type: 'action:reset',
      payload: { requestedById: user.id, requestedByName: user.name }
    };
    channel.publish('action', msg);
  };

  const undoLastPick = () => {
    if (!user || !channel || !isLeader) return;
    const msg: WireMessage = {
      type: 'action:undo',
      payload: { requestedById: user.id, requestedByName: user.name }
    };
    channel.publish('action', msg);
  };

  const value: DraftContextValue = useMemo(
    () => ({
      user,
      status,
      state,
      channel,
      isLeader,
      isConnected,
      error,
      initDraftAsLeader,
      sendPick,
      resetDraft,
      undoLastPick
    }),
    [user, status, state, channel, isLeader, isConnected, error]
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
};

export const useDraft = (): DraftContextValue => {
  const ctx = useContext(DraftContext);
  if (!ctx) {
    throw new Error('useDraft must be used within DraftProvider');
  }
  return ctx;
};

export const getDefaultCelebrityList = (): string[] => defaultCelebrities.slice();

export const getPreconfiguredDrafters = (): Drafter[] => PRECONFIGURED_DRAFTERS.map((d) => ({
  ...d,
  isLeader: false
}));


