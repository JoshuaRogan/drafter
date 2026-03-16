import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Ably from 'ably';
import type {
  MlbDraftState,
  LocalUser,
  WireMessage,
  DraftStatus,
  Drafter,
  MlbPlayersData,
  MlbPlayer,
} from './types';
import { TOTAL_ROUNDS } from './types';

type RealtimeClient = Ably.Realtime;
type RealtimeChannel = Ably.Types.RealtimeChannelCallbacks;

interface MlbCheckpointSummary {
  id: string;
  name: string;
  createdAt: string;
}

interface MlbDraftContextValue {
  user: LocalUser | null;
  status: DraftStatus;
  state: MlbDraftState | null;
  channel: RealtimeChannel | null;
  isAdmin: boolean;
  isConnected: boolean;
  error: string | null;
  canRestorePreviousState: boolean;
  checkpoints: MlbCheckpointSummary[];
  allPlayers: MlbPlayer[];
  allManagers: MlbPlayer[];
  initDraft(): void;
  sendPick(drafterId: string, playerName: string, rosterSlot: string, rosterSlotValid: boolean): void;
  editPick(pickId: string, newPlayerName: string): void;
  resetDraft(): void;
  undoLastPick(): void;
  restorePreviousState(): void;
  saveCheckpoint(name: string): Promise<void>;
  restoreCheckpoint(id: string): Promise<void>;
}

const MlbDraftContext = createContext<MlbDraftContextValue | undefined>(undefined);

const PRECONFIGURED_DRAFTERS: Drafter[] = [
  { id: 'drafter-cory', name: 'Cory', order: 1, password: '6666' },
  { id: 'drafter-z', name: 'Z', order: 2, password: '5555' },
  { id: 'drafter-kyle', name: 'Kyle', order: 3, password: '3333' },
  { id: 'drafter-shival', name: 'Shival', order: 4, password: '8888' },
  { id: 'drafter-pat', name: 'Pat', order: 5, password: '7777' },
  { id: 'drafter-pj', name: 'PJ', order: 6, password: '4444' },
  { id: 'drafter-jim', name: 'Jim', order: 7, password: '2222' },
  { id: 'drafter-josh', name: 'Josh', order: 8, password: '1111' },
  { id: 'drafter-charlie', name: 'Charlie', order: 9, password: '9999' },
  { id: 'drafter-nate', name: 'Nate', order: 10, password: '0000' },
];

const DRAFT_FUNCTION_PATH = '/.netlify/functions/mlb-draft';
const CHECKPOINTS_FUNCTION_PATH = '/.netlify/functions/mlb-checkpoints';

const fetchDraftStateFromServer = async (): Promise<MlbDraftState | null> => {
  try {
    const response = await fetch(DRAFT_FUNCTION_PATH, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const data = (await response.json()) as { success?: boolean; state?: MlbDraftState };
    return data.success && data.state ? data.state : null;
  } catch {
    return null;
  }
};

const postDraftAction = async (
  body: Record<string, unknown>
): Promise<{ state: MlbDraftState | null; error: string | null }> => {
  try {
    const response = await fetch(DRAFT_FUNCTION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      return { state: null, error: 'Draft action failed.' };
    }
    const data = (await response.json()) as {
      success?: boolean;
      state?: MlbDraftState;
      error?: string;
    };
    if (!data.success || !data.state) {
      return { state: null, error: data.error || 'Draft action failed.' };
    }
    return { state: data.state, error: null };
  } catch {
    return { state: null, error: 'Draft action failed. Check your connection.' };
  }
};

export const MlbDraftProvider: React.FC<{
  name: string;
  isAdmin: boolean;
  children: React.ReactNode;
}> = ({ name, isAdmin: isAdminFromQuery, children }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [state, setState] = useState<MlbDraftState | null>(null);
  const [status, setStatus] = useState<DraftStatus>('not-started');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MlbDraftState[]>([]);
  const [checkpoints, setCheckpoints] = useState<MlbCheckpointSummary[]>([]);
  const [allPlayers, setAllPlayers] = useState<MlbPlayer[]>([]);
  const [allManagers, setAllManagers] = useState<MlbPlayer[]>([]);

  const isAdmin = !!user && user.isAdmin;

  // Load MLB player data from JSON
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/mlb-players.json');
        if (!res.ok) return;
        const data = (await res.json()) as MlbPlayersData;

        if (cancelled) return;

        const players: MlbPlayer[] = (data.players || []).map((p) => ({
          id: String(p.id),
          name: p.name,
          position: p.position,
          positions: Array.isArray(p.positions) ? p.positions : [p.position],
          positionCategory: p.positionCategory,
          positionCategories: Array.isArray(p.positionCategories) ? p.positionCategories : [p.positionCategory],
          team: p.team,
          teamAbbr: p.teamAbbr,
          category: p.category as 'batter' | 'pitcher',
        }));

        const managers: MlbPlayer[] = (data.managers || []).map((m) => ({
          id: String(m.id),
          name: m.name,
          position: 'MGR',
          positions: ['MGR'],
          positionCategory: 'MGR',
          positionCategories: ['MGR'],
          team: m.team,
          teamAbbr: m.teamAbbr,
          category: 'manager' as const,
        }));

        setAllPlayers(players);
        setAllManagers(managers);
      } catch (err) {
        console.error('Failed to load MLB players', err);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // User init
  useEffect(() => {
    if (user) return;
    const newUser: LocalUser = {
      id: `u-${Math.random().toString(36).slice(2, 10)}`,
      name: name || 'Guest',
      isAdmin: isAdminFromQuery
    };
    setUser(newUser);

    try {
      const apiKey = import.meta.env.VITE_ABLY_API_KEY;
      if (!apiKey) throw new Error('VITE_ABLY_API_KEY not set');
      const c = new Ably.Realtime({ key: apiKey, clientId: newUser.id });
      setClient(c);
      setChannel(c.channels.get('mlb-draft-room'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to realtime service.');
    }
  }, [name, isAdminFromQuery, user]);

  useEffect(() => {
    setUser((prev) =>
      prev ? { ...prev, name: name || prev.name, isAdmin: isAdminFromQuery } : prev
    );
  }, [name, isAdminFromQuery]);

  // Connection lifecycle
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

  // Initial load from server
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
    return () => { cancelled = true; };
  }, []);

  // Load checkpoints (admin)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(CHECKPOINTS_FUNCTION_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' })
        });
        if (!response.ok) return;
        const data = (await response.json()) as { checkpoints?: MlbCheckpointSummary[] };
        if (!cancelled && Array.isArray(data.checkpoints)) {
          setCheckpoints(data.checkpoints);
        }
      } catch {}
    };
    void load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Ably subscription
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
        if (data?.type === 'state:updated') void syncFromServer();
      } catch {}
    };
    channel.subscribe('state', messageListener);
    return () => {
      cancelled = true;
      channel.unsubscribe('state', messageListener);
    };
  }, [channel]);

  const broadcast = (updatedAt: string) => {
    if (!channel) return;
    const outgoing: WireMessage = { type: 'state:updated', payload: { updatedAt } };
    channel.publish('state', outgoing);
  };

  const initDraft = () => {
    if (!channel || !isAdmin) return;

    if (state) {
      setHistory((prev) => {
        const next = [...prev, state];
        if (next.length > 20) next.shift();
        return next;
      });
    }

    // Combine players and managers into one list for the server
    const playerList = [
      ...allPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        positions: p.positions,
        positionCategory: p.positionCategory,
        positionCategories: p.positionCategories,
        team: p.team,
        teamAbbr: p.teamAbbr,
        category: p.category
      })),
      ...allManagers.map((m) => ({
        id: m.id,
        name: m.name,
        position: 'MGR',
        positions: ['MGR'],
        positionCategory: 'MGR',
        positionCategories: ['MGR'],
        team: m.team,
        teamAbbr: m.teamAbbr,
        category: 'manager'
      }))
    ];

    void (async () => {
      const { state: serverState, error: serverError } = await postDraftAction({
        action: 'init',
        totalRounds: TOTAL_ROUNDS,
        playerList
      });

      if (serverError || !serverState) {
        setError(serverError || 'Failed to initialize MLB draft.');
        return;
      }

      setState(serverState);
      setStatus(serverState.status);
      broadcast(serverState.updatedAt);
    })();
  };

  const sendPick = (drafterId: string, playerName: string, rosterSlot: string, rosterSlotValid: boolean) => {
    if (!channel || !state) return;
    if (state.status === 'complete') return;

    const seat = state.drafters.find((d) => d.id === drafterId);
    if (!seat) return;

    const trimmedName = playerName.trim();
    if (!trimmedName || !rosterSlot) return;

    void (async () => {
      const { state: nextState, error: actionError } = await postDraftAction({
        action: 'pick',
        drafterId: seat.id,
        drafterName: seat.name,
        playerName: trimmedName,
        rosterSlot,
        rosterSlotValid
      });

      if (actionError || !nextState) {
        setError(actionError || 'Failed to apply pick.');
        return;
      }

      setState(nextState);
      setStatus(nextState.status);
      broadcast(nextState.updatedAt);
    })();
  };

  const editPick = (pickId: string, newPlayerName: string) => {
    if (!channel || !state) return;
    if (state.status === 'not-started') return;

    const trimmedName = newPlayerName.trim();
    if (!trimmedName) return;

    void (async () => {
      const { state: nextState, error: actionError } = await postDraftAction({
        action: 'editPick',
        pickId,
        newPlayerName: trimmedName
      });

      if (actionError || !nextState) {
        setError(actionError || 'Failed to edit pick.');
        return;
      }

      setState(nextState);
      setStatus(nextState.status);
      broadcast(nextState.updatedAt);
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
        setError(actionError || 'Failed to reset.');
        return;
      }
      setState(nextState);
      setStatus(nextState.status);
      broadcast(nextState.updatedAt);
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
        setError(actionError || 'Failed to undo.');
        return;
      }
      setState(nextState);
      setStatus(nextState.status);
      broadcast(nextState.updatedAt);
    })();
  };

  const restorePreviousState = () => {
    if (!channel || !isAdmin) return;
    setHistory((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const restored = next.pop();
      if (!restored) return prev;
      void (async () => {
        const { state: serverState, error: serverError } = await postDraftAction({
          action: 'replace',
          state: restored
        });
        if (serverError || !serverState) {
          setError(serverError || 'Failed to restore.');
          return;
        }
        setState(serverState);
        setStatus(serverState.status);
        broadcast(serverState.updatedAt);
      })();
      return next;
    });
  };

  const saveCheckpoint = async (cpName: string): Promise<void> => {
    if (!state) throw new Error('No draft state to save.');
    const trimmed = cpName.trim() || `Checkpoint @ ${new Date().toLocaleString()}`;
    const response = await fetch(CHECKPOINTS_FUNCTION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', name: trimmed, state })
    });
    if (!response.ok) throw new Error('Failed to save checkpoint.');
    const data = (await response.json()) as { checkpoints?: MlbCheckpointSummary[] };
    if (Array.isArray(data.checkpoints)) setCheckpoints(data.checkpoints);
  };

  const restoreCheckpoint = async (id: string): Promise<void> => {
    if (!channel || !isAdmin) throw new Error('Only admin can restore checkpoints.');
    const response = await fetch(CHECKPOINTS_FUNCTION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load', id })
    });
    if (!response.ok) throw new Error('Failed to load checkpoint.');
    const data = (await response.json()) as {
      checkpoint?: { state: MlbDraftState };
    };
    if (!data.checkpoint?.state) throw new Error('Checkpoint not found.');

    const { state: serverState, error: serverError } = await postDraftAction({
      action: 'replace',
      state: data.checkpoint.state
    });
    if (serverError || !serverState) throw new Error(serverError || 'Failed to apply checkpoint.');

    setHistory([]);
    setState(serverState);
    setStatus(serverState.status);
    broadcast(serverState.updatedAt);
  };

  const value: MlbDraftContextValue = useMemo(
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
      allPlayers,
      allManagers,
      initDraft,
      sendPick,
      editPick,
      resetDraft,
      undoLastPick,
      restorePreviousState,
      saveCheckpoint,
      restoreCheckpoint,
    }),
    [user, status, state, channel, isAdmin, isConnected, error, history.length, checkpoints, allPlayers, allManagers]
  );

  return <MlbDraftContext.Provider value={value}>{children}</MlbDraftContext.Provider>;
};

export const useMlbDraft = (): MlbDraftContextValue => {
  const ctx = useContext(MlbDraftContext);
  if (!ctx) throw new Error('useMlbDraft must be used within MlbDraftProvider');
  return ctx;
};

export const getMlbPreconfiguredDrafters = (): Drafter[] =>
  PRECONFIGURED_DRAFTERS.map((d) => ({ ...d }));
