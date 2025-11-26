import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createRealtimeClient, RealtimeChannel, RealtimeClient } from './realtime';
import type {
  DraftState,
  LocalUser,
  WireMessage,
  DraftStatus,
  Drafter,
  CelebrityValidationResult
} from './types';

interface DraftContextValue {
  user: LocalUser | null;
  status: DraftStatus;
  state: DraftState | null;
  channel: RealtimeChannel | null;
  isAdmin: boolean;
  isConnected: boolean;
  error: string | null;
  initDraft(config: { totalRounds: number; celebrityList: string[] }): void;
  sendPick(drafterId: string, celebrityName: string): void;
  editPick(pickId: string, newCelebrityName: string): void;
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

const PRECONFIGURED_DRAFTERS: Array<Pick<Drafter, 'id' | 'name' | 'order'>> = [
  {
    id: 'drafter-josh',
    name: 'Josh',
    order: 1
  },
  {
    id: 'drafter-jim',
    name: 'Jim',
    order: 2
  },
  {
    id: 'drafter-kyle',
    name: 'Kyle',
    order: 3
  },
  {
    id: 'drafter-pj',
    name: 'Pj',
    order: 4
  },
  {
    id: 'drafter-zaccheo',
    name: 'Zaccheo',
    order: 5
  },
  {
    id: 'drafter-cory',
    name: 'Cory',
    order: 6
  },
  {
    id: 'drafter-pat',
    name: 'Pat',
    order: 7
  }
];

const VALIDATION_FUNCTION_PATH = '/.netlify/functions/validate-celebrity';

const fetchCelebrityValidation = async (
  celebrityName: string
): Promise<CelebrityValidationResult | null> => {
  try {
    const response = await fetch(VALIDATION_FUNCTION_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: celebrityName })
    });

    if (!response.ok) {
      console.error('Celebrity validation request failed', response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as { success?: boolean; result?: CelebrityValidationResult };
    if (!data.success || !data.result) {
      return null;
    }

    return data.result;
  } catch (err) {
    console.error('Error calling validation function', err);
    return null;
  }
};

const createInitialState = (totalRounds: number, celebrityList: string[]): DraftState => {
  const now = new Date().toISOString();

  const drafters: Drafter[] = PRECONFIGURED_DRAFTERS.map((d) => ({
    ...d
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
  const totalSlots = state.config.totalRounds * perRound;
  if (state.currentPickIndex >= totalSlots) return null;

  const index = state.currentPickIndex;
  const roundIndex = Math.floor(index / perRound);
  const indexInRound = index % perRound;
  const isReverse = roundIndex % 2 === 1;
  const seatIndex = isReverse ? perRound - 1 - indexInRound : indexInRound;
  const drafter = state.drafters[seatIndex];
  return drafter ?? null;
};

export const DraftProvider: React.FC<{
  name: string;
  isAdmin: boolean;
  children: React.ReactNode;
}> = ({ name, isAdmin: isAdminFromQuery, children }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [state, setState] = useState<DraftState | null>(null);
  const [status, setStatus] = useState<DraftStatus>('not-started');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!user && user.isAdmin;

  useEffect(() => {
    if (user) return;

    const newUser: LocalUser = {
      id: `u-${Math.random().toString(36).slice(2, 10)}`,
      name: name || 'Guest',
      isAdmin: isAdminFromQuery
    };
    setUser(newUser);

    try {
      const { client: c, channel: ch } = createRealtimeClient({ clientId: newUser.id });
      setClient(c);
      setChannel(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to realtime service.');
    }
  }, [name, isAdminFromQuery, user]);

  useEffect(() => {
    setUser((prev) =>
      prev
        ? {
            ...prev,
            name: name || prev.name,
            isAdmin: isAdminFromQuery
          }
        : prev
    );
  }, [name, isAdminFromQuery]);

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
        if (!isAdmin || !state) return;
        const outgoing: WireMessage = {
          type: 'state:replace',
          payload: state
        };
        channel.publish('state', outgoing);
      } else if (msg.type === 'action:pick') {
        if (!isAdmin || !state) return;

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

        let celeb = state.celebrities.find(
          (c) => c.name.toLowerCase() === celebrityName.toLowerCase()
        );

        let celebritiesWithCustom = state.celebrities;
        if (!celeb) {
          // Allow custom celebrities that were not part of the original pool.
          celeb = {
            id: `c-${state.celebrities.length}`,
            name: celebrityName
          };
          celebritiesWithCustom = [...state.celebrities, celeb];
        }

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
          celebrities: celebritiesWithCustom.map((c) =>
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

        // Fire-and-forget validation of the drafted celebrity.
        void (async () => {
          const validation = await fetchCelebrityValidation(celebrityName);
          if (!validation) return;

          setState((prev) => {
            if (!prev) return prev;

            const target = prev.celebrities.find(
              (c) => c.name.toLowerCase() === celebrityName.toLowerCase()
            );
            if (!target) return prev;

            const updatedCelebrities = prev.celebrities.map((c) =>
              c.id === target.id
                ? {
                    ...c,
                    fullName: validation.fullName || c.fullName || c.name,
                    dateOfBirth: validation.dateOfBirth || c.dateOfBirth,
                    wikipediaUrl:
                      validation.wikipediaUrl !== undefined
                        ? validation.wikipediaUrl
                        : c.wikipediaUrl ?? null,
                    hasWikipediaPage:
                      validation.hasWikipediaPage !== undefined
                        ? validation.hasWikipediaPage
                        : c.hasWikipediaPage,
                    isValidated: validation.isValid,
                    validationAttempted: true,
                    isDeceased:
                      typeof validation.isDeceased === 'boolean'
                        ? validation.isDeceased
                        : c.isDeceased,
                    validationNotes: validation.notes ?? c.validationNotes ?? null
                  }
                : c
            );

            const updatedAt = new Date().toISOString();
            const updatedState: DraftState = {
              ...prev,
              celebrities: updatedCelebrities,
              updatedAt
            };

            const validationBroadcast: WireMessage = {
              type: 'state:replace',
              payload: updatedState
            };
            channel.publish('state', validationBroadcast);

            return updatedState;
          });
        })();
      } else if (msg.type === 'action:edit-pick') {
        if (!isAdmin || !state) return;

        const { pickId, newCelebrityName } = msg.payload;
        const trimmedName = newCelebrityName.trim();
        if (!trimmedName) return;

        const pickIndex = state.picks.findIndex((p) => p.id === pickId);
        if (pickIndex === -1) return;

        const existingPick = state.picks[pickIndex];
        const oldName = existingPick.celebrityName;

        if (oldName.toLowerCase() === trimmedName.toLowerCase()) {
          return;
        }

        const duplicate = state.picks.some(
          (p, idx) =>
            idx !== pickIndex &&
            p.celebrityName.toLowerCase() === trimmedName.toLowerCase()
        );
        if (duplicate) return;

        let celeb = state.celebrities.find(
          (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
        );
        let celebritiesWithCustom = state.celebrities;
        if (!celeb) {
          celeb = {
            id: `c-${state.celebrities.length}`,
            name: trimmedName
          };
          celebritiesWithCustom = [...state.celebrities, celeb];
        }

        const updatedPicks = state.picks.map((p, idx) =>
          idx === pickIndex ? { ...p, celebrityName: trimmedName } : p
        );

        const otherStillUseOld = updatedPicks.some(
          (p) => p.celebrityName.toLowerCase() === oldName.toLowerCase()
        );

        const updatedCelebritiesBase = celebritiesWithCustom.map((c) => {
          if (c.name.toLowerCase() === oldName.toLowerCase() && !otherStillUseOld) {
            return { ...c, draftedById: undefined };
          }
          if (c.id === celeb.id) {
            return { ...c, draftedById: existingPick.drafterId };
          }
          return c;
        });

        const now = new Date().toISOString();
        const newState: DraftState = {
          ...state,
          picks: updatedPicks,
          celebrities: updatedCelebritiesBase,
          updatedAt: now
        };

        setState(newState);
        setStatus(newState.status);

        const outgoing: WireMessage = {
          type: 'state:replace',
          payload: newState
        };
        channel.publish('state', outgoing);

        // Re-run validation for the new celebrity name.
        void (async () => {
          const validation = await fetchCelebrityValidation(trimmedName);
          if (!validation) return;

          setState((prev) => {
            if (!prev) return prev;

            const target = prev.celebrities.find(
              (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
            );
            if (!target) return prev;

            const updatedCelebrities = prev.celebrities.map((c) =>
              c.id === target.id
                ? {
                    ...c,
                    fullName: validation.fullName || c.fullName || c.name,
                    dateOfBirth: validation.dateOfBirth || c.dateOfBirth,
                    wikipediaUrl:
                      validation.wikipediaUrl !== undefined
                        ? validation.wikipediaUrl
                        : c.wikipediaUrl ?? null,
                    hasWikipediaPage:
                      validation.hasWikipediaPage !== undefined
                        ? validation.hasWikipediaPage
                        : c.hasWikipediaPage,
                    isValidated: validation.isValid,
                    validationAttempted: true,
                    isDeceased:
                      typeof validation.isDeceased === 'boolean'
                        ? validation.isDeceased
                        : c.isDeceased,
                    validationNotes: validation.notes ?? c.validationNotes ?? null
                  }
                : c
            );

            const updatedAt = new Date().toISOString();
            const updatedState: DraftState = {
              ...prev,
              celebrities: updatedCelebrities,
              updatedAt
            };

            const validationBroadcast: WireMessage = {
              type: 'state:replace',
              payload: updatedState
            };
            channel.publish('state', validationBroadcast);

            return updatedState;
          });
        })();
      } else if (msg.type === 'action:reset') {
        if (!isAdmin || !state || !user) return;
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
        if (!isAdmin || !state) return;
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

    const messageListener = (msg: { data: unknown }) => {
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
  }, [channel, user, isAdmin, state]);

  const initDraft = (config: { totalRounds: number; celebrityList: string[] }) => {
    if (!channel) return;
    if (!isAdmin) return;

    const initial = createInitialState(config.totalRounds, config.celebrityList);
    setState(initial);
    setStatus(initial.status);

    const outgoing: WireMessage = {
      type: 'state:replace',
      payload: initial
    };
    channel.publish('state', outgoing);
  };

  const sendPick = (drafterId: string, celebrityName: string) => {
    if (!channel || !state) return;
    if (state.status === 'complete') return;

    const seat = state.drafters.find((d) => d.id === drafterId);
    if (!seat) return;

    const msg: WireMessage = {
      type: 'action:pick',
      payload: {
        drafterId: seat.id,
        drafterName: seat.name,
        celebrityName
      }
    };
    channel.publish('action', msg);
  };

  const editPick = (pickId: string, newCelebrityName: string) => {
    if (!channel || !state) return;
    if (state.status === 'not-started') return;

    const trimmedName = newCelebrityName.trim();
    if (!trimmedName) return;

    const msg: WireMessage = {
      type: 'action:edit-pick',
      payload: {
        pickId,
        newCelebrityName: trimmedName,
        requestedById: user?.id ?? 'unknown',
        requestedByName: user?.name ?? 'unknown'
      }
    };
    channel.publish('action', msg);
  };

  const resetDraft = () => {
    if (!user || !channel || !isAdmin) return;
    const msg: WireMessage = {
      type: 'action:reset',
      payload: { requestedById: user.id, requestedByName: user.name }
    };
    channel.publish('action', msg);
  };

  const undoLastPick = () => {
    if (!user || !channel || !isAdmin) return;
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
      isAdmin,
      isConnected,
      error,
      initDraft,
      sendPick,
      editPick,
      resetDraft,
      undoLastPick
    }),
    [user, status, state, channel, isAdmin, isConnected, error]
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
  ...d
}));


