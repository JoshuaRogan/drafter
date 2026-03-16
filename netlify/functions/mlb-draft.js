// Netlify serverless function for the MLB draft state.
// Uses a separate Netlify Blob Store from the celebrity draft.

let blobStorePromise;

async function getBlobStore() {
  if (!blobStorePromise) {
    blobStorePromise = (async () => {
      const mod = await import('@netlify/blobs');

      const siteID =
        process.env.NETLIFY_BLOBS_SITE_ID ||
        process.env.NETLIFY_SITE_ID ||
        '';
      const token =
        process.env.NETLIFY_BLOBS_TOKEN ||
        process.env.NETLIFY_ACCESS_TOKEN ||
        '';

      const name = 'mlb-draft-state';

      if (siteID && token) {
        return mod.getStore({ name, siteID, token });
      }

      return mod.getStore(name);
    })();
  }
  return blobStorePromise;
}

const DRAFT_KEY = 'main-room';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra
  };
}

async function loadDraftState() {
  const store = await getBlobStore();
  try {
    const existing = await store.get(DRAFT_KEY, { type: 'json' });
    if (!existing || typeof existing !== 'object') {
      return null;
    }
    return existing;
  } catch (err) {
    console.error('Failed to load MLB draft state from blob store', err);
    return null;
  }
}

async function saveDraftState(state) {
  const store = await getBlobStore();
  await store.setJSON(DRAFT_KEY, state);
}

const PRECONFIGURED_DRAFTERS = [
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

function getCurrentDrafter(state) {
  if (!state || !Array.isArray(state.drafters) || !state.drafters.length) return null;
  const perRound = state.drafters.length;
  const totalSlots = state.config.totalRounds * perRound;
  if (state.currentPickIndex >= totalSlots) return null;

  const index = state.currentPickIndex;
  const roundIndex = Math.floor(index / perRound);
  const indexInRound = index % perRound;
  const isReverse = roundIndex % 2 === 1;
  const seatIndex = isReverse ? perRound - 1 - indexInRound : indexInRound;
  return state.drafters[seatIndex] ?? null;
}

function createInitialState(totalRounds, playerList) {
  const now = new Date().toISOString();

  const safeRounds =
    Number.isFinite(Number(totalRounds)) && Number(totalRounds) > 0
      ? Math.max(1, Math.min(200, Number(totalRounds)))
      : 11;

  const drafters = PRECONFIGURED_DRAFTERS.map((d) => ({ ...d }));

  const safePlayers = Array.isArray(playerList)
    ? playerList
        .filter((p) => p && typeof p === 'object' && p.name)
        .map((p, idx) => ({
          id: p.id ? String(p.id) : `p-${idx}`,
          name: p.name,
          position: p.position || '',
          positions: Array.isArray(p.positions) ? p.positions : [p.position || ''],
          positionCategory: p.positionCategory || '',
          positionCategories: Array.isArray(p.positionCategories) ? p.positionCategories : [p.positionCategory || ''],
          team: p.team || '',
          teamAbbr: p.teamAbbr || '',
          category: p.category || 'batter'
        }))
    : [];

  return {
    status: 'not-started',
    config: { totalRounds: safeRounds },
    drafters,
    picks: [],
    players: safePlayers,
    currentRound: 1,
    currentPickIndex: 0,
    createdAt: now,
    updatedAt: now
  };
}

// Roster slot definitions matching the client-side ROSTER_SLOTS
const ROSTER_SLOT_DEFS = [
  { id: 'C', positionCategory: 'C' },
  { id: '1B', positionCategory: '1B' },
  { id: '2B', positionCategory: '2B' },
  { id: '3B', positionCategory: '3B' },
  { id: 'SS', positionCategory: 'SS' },
  { id: 'OF1', positionCategory: 'OF' },
  { id: 'OF2', positionCategory: 'OF' },
  { id: 'OF3', positionCategory: 'OF' },
  { id: 'XHIT', positionCategory: 'XHIT' },
  { id: 'MGR', positionCategory: 'MGR' },
  { id: 'P', positionCategory: 'P' },
];

const HITTER_CATEGORIES_SET = new Set(['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'UTIL']);

function isSlotValidForPlayer(slotDef, playerCategories) {
  if (!slotDef || !Array.isArray(playerCategories)) return false;
  if (slotDef.positionCategory === 'XHIT') {
    return playerCategories.some((c) => HITTER_CATEGORIES_SET.has(c));
  }
  return playerCategories.includes(slotDef.positionCategory);
}

function applyPick(state, payload) {
  if (!state) return { error: 'Draft has not been initialized yet.' };

  const drafterId = typeof payload.drafterId === 'string' ? payload.drafterId : '';
  const drafterName = typeof payload.drafterName === 'string' ? payload.drafterName.trim() : '';
  const playerName = typeof payload.playerName === 'string' ? payload.playerName.trim() : '';
  const rosterSlot = typeof payload.rosterSlot === 'string' ? payload.rosterSlot : '';
  const clientRosterSlotValid = typeof payload.rosterSlotValid === 'boolean' ? payload.rosterSlotValid : null;

  if (!playerName) return { error: 'Player name is required.' };
  if (!rosterSlot) return { error: 'Roster slot is required.' };
  if (!state.drafters || !state.drafters.length) return { error: 'No drafters configured.' };

  // Validate the roster slot ID exists
  const slotDef = ROSTER_SLOT_DEFS.find((s) => s.id === rosterSlot);
  if (!slotDef) return { error: `Invalid roster slot "${rosterSlot}".` };

  const drafterSeat =
    state.drafters.find((d) => d.id === drafterId) ||
    state.drafters.find(
      (d) => d.name && drafterName && d.name.toLowerCase() === drafterName.toLowerCase()
    );

  if (!drafterSeat) return { error: 'Unknown drafter.' };

  const current = getCurrentDrafter(state);
  if (!current || current.id !== drafterSeat.id) {
    return { error: "It is not this drafter's turn." };
  }

  // Check if drafter already filled this roster slot
  const slotAlreadyFilled = state.picks.some(
    (p) => p.drafterId === drafterSeat.id && p.rosterSlot === rosterSlot
  );
  if (slotAlreadyFilled) return { error: `Roster slot "${rosterSlot}" is already filled.` };

  const alreadyPicked = state.picks.some(
    (p) => p.playerName.toLowerCase() === playerName.toLowerCase()
  );
  if (alreadyPicked) return { error: 'That player has already been drafted.' };

  const nextIndex = state.currentPickIndex + 1;
  const totalSlots = state.config.totalRounds * state.drafters.length;
  const complete = nextIndex >= totalSlots;
  const perRound = state.drafters.length;
  const nextRound = Math.floor(nextIndex / perRound) + 1;

  const now = new Date().toISOString();

  // Find the player in the pool to get their metadata
  const poolPlayer = (state.players || []).find(
    (p) => p.name.toLowerCase() === playerName.toLowerCase()
  );

  // Prefer client-sent validity (computed from fresh JSON data) over server pool
  // which may have been initialized with stale single-position data
  const playerCategories = poolPlayer?.positionCategories || [poolPlayer?.positionCategory || ''];
  const rosterSlotValid = clientRosterSlotValid !== null
    ? clientRosterSlotValid
    : isSlotValidForPlayer(slotDef, playerCategories);

  const newState = {
    ...state,
    picks: [
      ...state.picks,
      {
        id: `p-${state.picks.length + 1}`,
        overallNumber: state.picks.length + 1,
        round: state.currentRound,
        drafterId: drafterSeat.id,
        drafterName: drafterSeat.name,
        playerName,
        rosterSlot,
        rosterSlotValid,
        position: poolPlayer?.position || '',
        positions: poolPlayer?.positions || [poolPlayer?.position || ''],
        positionCategory: poolPlayer?.positionCategory || '',
        positionCategories: poolPlayer?.positionCategories || [poolPlayer?.positionCategory || ''],
        team: poolPlayer?.team || '',
        teamAbbr: poolPlayer?.teamAbbr || '',
        category: poolPlayer?.category || '',
        createdAt: now
      }
    ],
    players: (state.players || []).map((p) =>
      p.name.toLowerCase() === playerName.toLowerCase()
        ? { ...p, draftedById: drafterSeat.id }
        : p
    ),
    currentPickIndex: nextIndex,
    currentRound: complete ? state.currentRound : nextRound,
    status: complete ? 'complete' : 'in-progress',
    updatedAt: now
  };

  return { state: newState };
}

function applyEditPick(state, payload) {
  if (!state) return { error: 'Draft has not been initialized yet.' };

  const pickId = typeof payload.pickId === 'string' ? payload.pickId : '';
  const newPlayerName = typeof payload.newPlayerName === 'string' ? payload.newPlayerName.trim() : '';

  if (!pickId || !newPlayerName) return { error: 'Both pickId and newPlayerName are required.' };

  const pickIndex = state.picks.findIndex((p) => p.id === pickId);
  if (pickIndex === -1) return { error: 'Pick not found.' };

  const existingPick = state.picks[pickIndex];
  const oldName = existingPick.playerName;

  if (oldName.toLowerCase() === newPlayerName.toLowerCase()) return { state };

  const duplicate = state.picks.some(
    (p, idx) => idx !== pickIndex && p.playerName.toLowerCase() === newPlayerName.toLowerCase()
  );
  if (duplicate) return { error: 'Another pick already has that player.' };

  const poolPlayer = (state.players || []).find(
    (p) => p.name.toLowerCase() === newPlayerName.toLowerCase()
  );

  const updatedPicks = state.picks.map((p, idx) =>
    idx === pickIndex
      ? {
          ...p,
          playerName: newPlayerName,
          position: poolPlayer?.position || '',
          positions: poolPlayer?.positions || [poolPlayer?.position || ''],
          positionCategory: poolPlayer?.positionCategory || '',
          positionCategories: poolPlayer?.positionCategories || [poolPlayer?.positionCategory || ''],
          team: poolPlayer?.team || '',
          teamAbbr: poolPlayer?.teamAbbr || '',
          category: poolPlayer?.category || ''
        }
      : p
  );

  const otherStillUseOld = updatedPicks.some(
    (p) => p.playerName.toLowerCase() === oldName.toLowerCase()
  );

  const updatedPlayers = (state.players || []).map((p) => {
    if (p.name.toLowerCase() === oldName.toLowerCase() && !otherStillUseOld) {
      return { ...p, draftedById: undefined };
    }
    if (p.name.toLowerCase() === newPlayerName.toLowerCase()) {
      return { ...p, draftedById: existingPick.drafterId };
    }
    return p;
  });

  const now = new Date().toISOString();
  return {
    state: { ...state, picks: updatedPicks, players: updatedPlayers, updatedAt: now }
  };
}

function applyReset(state) {
  if (!state) return { error: 'Draft has not been initialized yet.' };
  const now = new Date().toISOString();
  return {
    state: {
      ...state,
      picks: [],
      players: (state.players || []).map((p) => ({ ...p, draftedById: undefined })),
      currentPickIndex: 0,
      currentRound: 1,
      status: 'not-started',
      updatedAt: now
    }
  };
}

function applyUndo(state) {
  if (!state) return { error: 'Draft has not been initialized yet.' };
  if (!state.picks.length) return { state };

  const last = state.picks[state.picks.length - 1];
  const remaining = state.picks.slice(0, -1);
  const now = new Date().toISOString();

  return {
    state: {
      ...state,
      picks: remaining,
      players: (state.players || []).map((p) =>
        p.draftedById === last.drafterId &&
        p.name.toLowerCase() === last.playerName.toLowerCase()
          ? { ...p, draftedById: undefined }
          : p
      ),
      currentPickIndex: state.currentPickIndex - 1,
      currentRound: last.round,
      status: remaining.length ? 'in-progress' : 'not-started',
      updatedAt: now
    }
  };
}

function applyReplace(stateFromClient) {
  if (!stateFromClient || typeof stateFromClient !== 'object') {
    return { error: 'Invalid state payload for replace action.' };
  }
  const now = new Date().toISOString();
  return { state: { ...stateFromClient, updatedAt: now } };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod === 'GET') {
    const state = await loadDraftState();
    if (!state) {
      return {
        statusCode: 404,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: false, error: 'No MLB draft state found.' })
      };
    }
    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ success: true, state })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ success: false, error: 'Method not allowed.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ success: false, error: 'Invalid JSON body.' })
    };
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!action) {
    return {
      statusCode: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ success: false, error: 'Missing "action" field.' })
    };
  }

  try {
    if (action === 'init') {
      const nextState = createInitialState(body.totalRounds, body.playerList);
      await saveDraftState(nextState);
      return {
        statusCode: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: true, state: nextState })
      };
    }

    if (action === 'replace') {
      const result = applyReplace(body.state);
      if (result.error) {
        return {
          statusCode: 400,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ success: false, error: result.error })
        };
      }
      await saveDraftState(result.state);
      return {
        statusCode: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: true, state: result.state })
      };
    }

    const currentState = await loadDraftState();
    if (!currentState) {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: false, error: 'MLB draft not initialized.' })
      };
    }

    let result;
    if (action === 'pick') result = applyPick(currentState, body);
    else if (action === 'editPick') result = applyEditPick(currentState, body);
    else if (action === 'reset') result = applyReset(currentState);
    else if (action === 'undo') result = applyUndo(currentState);
    else {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: false, error: `Unsupported action "${action}".` })
      };
    }

    if (result.error) {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: false, error: result.error })
      };
    }

    await saveDraftState(result.state);
    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ success: true, state: result.state })
    };
  } catch (err) {
    console.error('mlb-draft function error', err);
    return {
      statusCode: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    };
  }
};
