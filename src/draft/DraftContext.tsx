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

interface DraftCheckpointSummary {
  id: string;
  name: string;
  createdAt: string;
}

interface DraftContextValue {
  user: LocalUser | null;
  status: DraftStatus;
  state: DraftState | null;
  channel: RealtimeChannel | null;
  isAdmin: boolean;
  isConnected: boolean;
  error: string | null;
  canRestorePreviousState: boolean;
   checkpoints: DraftCheckpointSummary[];
  initDraft(config: { totalRounds: number; celebrityList: string[] }): void;
  sendPick(drafterId: string, celebrityName: string): void;
  editPick(pickId: string, newCelebrityName: string): void;
  resetDraft(): void;
  undoLastPick(): void;
  restorePreviousState(): void;
  saveCheckpoint(name: string): Promise<void>;
  restoreCheckpoint(id: string): Promise<void>;
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
const CHECKPOINTS_FUNCTION_PATH = '/.netlify/functions/checkpoints';
const DRAFT_FUNCTION_PATH = '/.netlify/functions/draft';

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

const fetchDraftStateFromServer = async (): Promise<DraftState | null> => {
  try {
    const response = await fetch(DRAFT_FUNCTION_PATH, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error('Draft state request failed', response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as { success?: boolean; state?: DraftState };
    if (!data.success || !data.state) {
      return null;
    }

    return data.state;
  } catch (err) {
    console.error('Error fetching draft state', err);
    return null;
  }
};

const postDraftAction = async (
  body: Record<string, unknown>
): Promise<{ state: DraftState | null; error: string | null }> => {
  try {
    const response = await fetch(DRAFT_FUNCTION_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Draft action request failed', response.status, text || 'Unknown error');
      return { state: null, error: 'Draft action failed. Please try again.' };
    }

    const data = (await response.json()) as {
      success?: boolean;
      state?: DraftState;
      error?: string;
    };

    if (!data.success || !data.state) {
      const errorMessage = data.error || 'Draft action failed.';
      console.error('Draft action error', errorMessage);
      return { state: null, error: errorMessage };
    }

    return { state: data.state, error: null };
  } catch (err) {
    console.error('Error calling draft action function', err);
    return {
      state: null,
      error: 'Draft action failed. Please check your connection and try again.'
    };
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
  const [history, setHistory] = useState<DraftState[]>([]);
  const [checkpoints, setCheckpoints] = useState<DraftCheckpointSummary[]>([]);

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

  // Initial load of canonical draft state from the Netlify blob-backed function.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const remote = await fetchDraftStateFromServer();
      if (!cancelled && remote) {
        setState(remote);
        setStatus(remote.status);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load existing persistent checkpoints when an admin connects.
  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(CHECKPOINTS_FUNCTION_PATH, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'list' })
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { checkpoints?: DraftCheckpointSummary[] };
        if (!cancelled && Array.isArray(data.checkpoints)) {
          setCheckpoints(data.checkpoints);
        }
      } catch (err) {
        console.error('Failed to load checkpoints', err);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Whenever any client broadcasts a small "state:updated" event over Ably,
  // refresh the draft state from the Netlify-backed store.
  useEffect(() => {
    if (!channel) return;

    let cancelled = false;

    const syncFromServer = async () => {
      const latest = await fetchDraftStateFromServer();
      if (!latest || cancelled) return;

      setState(latest);
      setStatus(latest.status);
    };

    const messageListener = (msg: { data: unknown }) => {
      try {
        const data = msg.data as WireMessage;
        if (data && data.type === 'state:updated') {
          void syncFromServer();
        }
      } catch {
        // ignore malformed messages
      }
    };

    channel.subscribe('state', messageListener);

    return () => {
      cancelled = true;
      channel.unsubscribe('state', messageListener);
    };
  }, [channel]);

  const saveCheckpoint = async (name: string): Promise<void> => {
    if (!state) {
      throw new Error('There is no current draft state to save.');
    }

    const trimmed = name.trim() || `Checkpoint @ ${new Date().toLocaleString()}`;

    try {
      const response = await fetch(CHECKPOINTS_FUNCTION_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'save',
          name: trimmed,
          state
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to save checkpoint (${response.status}): ${text || 'Unknown error'}`);
      }

      const data = (await response.json()) as {
        checkpoints?: DraftCheckpointSummary[];
      };

      if (Array.isArray(data.checkpoints)) {
        setCheckpoints(data.checkpoints);
      }
    } catch (err) {
      console.error('Error saving checkpoint', err);
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Failed to save checkpoint.');
    }
  };

  const restoreCheckpoint = async (id: string): Promise<void> => {
    if (!channel || !isAdmin) {
      throw new Error('Only the admin can restore a checkpoint when the channel is connected.');
    }

    try {
      const response = await fetch(CHECKPOINTS_FUNCTION_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'load',
          id
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to load checkpoint (${response.status}): ${text || 'Unknown error'}`);
      }

      const data = (await response.json()) as {
        checkpoint?: { id: string; name: string; createdAt: string; state: DraftState };
      };

      if (!data.checkpoint || !data.checkpoint.state) {
        throw new Error('Checkpoint not found or invalid.');
      }

      const restored = data.checkpoint.state;

      const { state: serverState, error: serverError } = await postDraftAction({
        action: 'replace',
        state: restored
      });

      if (serverError || !serverState) {
        throw new Error(serverError || 'Failed to apply checkpoint on server.');
      }

      // Drop any local in-memory history so we fully "reset" to this checkpoint.
      setHistory([]);
      setState(serverState);
      setStatus(serverState.status);

      const outgoing: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: serverState.updatedAt }
      };
      channel.publish('state', outgoing);
    } catch (err) {
      console.error('Error restoring checkpoint', err);
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Failed to restore checkpoint.');
    }
  };

  const initDraft = (config: { totalRounds: number; celebrityList: string[] }) => {
    if (!channel) return;
    if (!isAdmin) return;

    if (state) {
      // Preserve the entire previous board before starting a new one.
      setHistory((prev) => {
        const next = [...prev, state];
        if (next.length > 20) next.shift();
        return next;
      });
    }

    void (async () => {
      const { state: serverState, error: serverError } = await postDraftAction({
        action: 'init',
        totalRounds: config.totalRounds,
        celebrityList: config.celebrityList
      });

      if (serverError || !serverState) {
        setError(serverError || 'Failed to initialize draft on server.');
        return;
      }

      setState(serverState);
      setStatus(serverState.status);

      const outgoing: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: serverState.updatedAt }
      };
      channel.publish('state', outgoing);
    })();
  };

  const sendPick = (drafterId: string, celebrityName: string) => {
    if (!channel || !state) return;
    if (state.status === 'complete') return;

    const seat = state.drafters.find((d) => d.id === drafterId);
    if (!seat) return;

    const trimmedName = celebrityName.trim();
    if (!trimmedName) return;

    void (async () => {
      const { state: nextState, error: actionError } = await postDraftAction({
        action: 'pick',
        drafterId: seat.id,
        drafterName: seat.name,
        celebrityName: trimmedName
      });

      if (actionError || !nextState) {
        setError(actionError || 'Failed to apply pick on server.');
        return;
      }

      setState(nextState);
      setStatus(nextState.status);

      const outgoing: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: nextState.updatedAt }
      };
      channel.publish('state', outgoing);

      // Fire-and-forget validation of the drafted celebrity, persisted on the server.
      void (async () => {
        const validation = await fetchCelebrityValidation(trimmedName);
        if (!validation) return;

        const { state: validatedState } = await postDraftAction({
          action: 'applyValidation',
          celebrityName: trimmedName,
          validation
        });

        if (!validatedState) return;

        setState(validatedState);
        setStatus(validatedState.status);

        const validationBroadcast: WireMessage = {
          type: 'state:updated',
          payload: { updatedAt: validatedState.updatedAt }
        };
        channel.publish('state', validationBroadcast);
      })();
    })();
  };

  const editPick = (pickId: string, newCelebrityName: string) => {
    if (!channel || !state) return;
    if (state.status === 'not-started') return;

    const trimmedName = newCelebrityName.trim();
    if (!trimmedName) return;

    void (async () => {
      const { state: nextState, error: actionError } = await postDraftAction({
        action: 'editPick',
        pickId,
        newCelebrityName: trimmedName
      });

      if (actionError || !nextState) {
        setError(actionError || 'Failed to edit pick on server.');
        return;
      }

      setState(nextState);
      setStatus(nextState.status);

      const outgoing: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: nextState.updatedAt }
      };
      channel.publish('state', outgoing);

      // Re-run validation for the new celebrity name, persisted on the server.
      const validation = await fetchCelebrityValidation(trimmedName);
      if (!validation) return;

      const { state: validatedState } = await postDraftAction({
        action: 'applyValidation',
        celebrityName: trimmedName,
        validation
      });

      if (!validatedState) return;

      setState(validatedState);
      setStatus(validatedState.status);

      const validationBroadcast: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: validatedState.updatedAt }
      };
      channel.publish('state', validationBroadcast);
    })();
  };

  const resetDraft = () => {
    if (!user || !channel || !isAdmin) return;

    void (async () => {
      if (state) {
        setHistory((prev) => {
          const next = [...prev, state];
          if (next.length > 20) next.shift();
          return next;
        });
      }

      const { state: nextState, error: actionError } = await postDraftAction({
        action: 'reset',
        requestedById: user.id,
        requestedByName: user.name
      });

      if (actionError || !nextState) {
        setError(actionError || 'Failed to reset draft on server.');
        return;
      }

      setState(nextState);
      setStatus(nextState.status);

      const outgoing: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: nextState.updatedAt }
      };
      channel.publish('state', outgoing);
    })();
  };

  const undoLastPick = () => {
    if (!user || !channel || !isAdmin) return;

    void (async () => {
      if (state) {
        setHistory((prev) => {
          const next = [...prev, state];
          if (next.length > 20) next.shift();
          return next;
        });
      }

      const { state: nextState, error: actionError } = await postDraftAction({
        action: 'undo',
        requestedById: user.id,
        requestedByName: user.name
      });

      if (actionError || !nextState) {
        setError(actionError || 'Failed to undo last pick on server.');
        return;
      }

      setState(nextState);
      setStatus(nextState.status);

      const outgoing: WireMessage = {
        type: 'state:updated',
        payload: { updatedAt: nextState.updatedAt }
      };
      channel.publish('state', outgoing);
    })();
  };

  const restorePreviousState = () => {
    if (!channel || !isAdmin) return;

    setHistory((prev) => {
      if (!prev.length) {
        return prev;
      }

      const next = [...prev];
      const restored = next.pop();
      if (!restored) {
        return prev;
      }

      void (async () => {
        const { state: serverState, error: serverError } = await postDraftAction({
          action: 'replace',
          state: restored
        });

        if (serverError || !serverState) {
          setError(serverError || 'Failed to restore previous board on server.');
          return;
        }

        setState(serverState);
        setStatus(serverState.status);

        const outgoing: WireMessage = {
          type: 'state:updated',
          payload: { updatedAt: serverState.updatedAt }
        };
        channel.publish('state', outgoing);
      })();

      return next;
    });
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
      canRestorePreviousState: history.length > 0,
      checkpoints,
      initDraft,
      sendPick,
      editPick,
      resetDraft,
      undoLastPick,
      restorePreviousState,
      saveCheckpoint,
      restoreCheckpoint
    }),
    [user, status, state, channel, isAdmin, isConnected, error, history.length, checkpoints]
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


