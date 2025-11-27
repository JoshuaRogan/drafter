// Netlify serverless function for the canonical draft state.
//
// - Uses Netlify Blob Store to persist a single DraftState for the main room.
// - All mutations (init, pick, edit, reset, undo, apply validation, replace)
//   are applied on the server and written atomically via setJSON.
// - The browser clients call this function for mutations and reads, and then
//   use Ably only to broadcast a lightweight "state updated" event so that
//   other tabs refresh from the server.
//
// This keeps Ably messages very small while providing a persistent backend.

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

      const name = 'celebrity-draft-state';

      if (siteID && token) {
        // Manual mode (works in local dev and in environments without automatic Blobs config).
        return mod.getStore({ name, siteID, token });
      }

      // Automatic mode (works when running on Netlify with Blobs enabled / linked via CLI).
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
    console.error('Failed to load draft state from blob store', err);
    return null;
  }
}

async function saveDraftState(state) {
  const store = await getBlobStore();
  await store.setJSON(DRAFT_KEY, state);
}

// ---------------------------
// Pure draft domain helpers
// ---------------------------

const PRECONFIGURED_DRAFTERS = [
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
  const drafter = state.drafters[seatIndex];
  return drafter ?? null;
}

function createInitialState(totalRounds, celebrityList) {
  const now = new Date().toISOString();

  const safeRounds =
    Number.isFinite(Number(totalRounds)) && Number(totalRounds) > 0
      ? Math.max(1, Math.min(20, Number(totalRounds)))
      : 3;

  const drafters = PRECONFIGURED_DRAFTERS.map((d) => ({ ...d }));

  const safeCelebrities = Array.isArray(celebrityList)
    ? celebrityList
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter((name) => !!name)
    : [];

  return {
    status: 'not-started',
    config: { totalRounds: safeRounds },
    drafters,
    picks: [],
    celebrities: safeCelebrities.map((name, idx) => ({
      id: `c-${idx}`,
      name
    })),
    currentRound: 1,
    currentPickIndex: 0,
    createdAt: now,
    updatedAt: now
  };
}

function applyPick(state, payload) {
  if (!state) {
    return { error: 'Draft has not been initialized yet.' };
  }

  const drafterId = typeof payload.drafterId === 'string' ? payload.drafterId : '';
  const drafterName =
    typeof payload.drafterName === 'string' ? payload.drafterName.trim() : '';
  const celebrityName =
    typeof payload.celebrityName === 'string' ? payload.celebrityName.trim() : '';

  if (!celebrityName) {
    return { error: 'Celebrity name is required.' };
  }

  if (!state.drafters || !state.drafters.length) {
    return { error: 'No drafters have been configured.' };
  }

  const drafterSeat =
    state.drafters.find((d) => d.id === drafterId) ||
    state.drafters.find(
      (d) => d.name && drafterName && d.name.toLowerCase() === drafterName.toLowerCase()
    );

  if (!drafterSeat) {
    return { error: 'Unknown drafter.' };
  }

  const current = getCurrentDrafter(state);
  if (!current || current.id !== drafterSeat.id) {
    return { error: 'It is not this drafter\'s turn.' };
  }

  const alreadyPicked = state.picks.some(
    (p) => p.celebrityName.toLowerCase() === celebrityName.toLowerCase()
  );
  if (alreadyPicked) {
    return { error: 'That celebrity has already been drafted.' };
  }

  let celeb = state.celebrities.find(
    (c) => c.name.toLowerCase() === celebrityName.toLowerCase()
  );

  let celebritiesWithCustom = state.celebrities;
  if (!celeb) {
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

  return { state: newState };
}

function applyEditPick(state, payload) {
  if (!state) {
    return { error: 'Draft has not been initialized yet.' };
  }

  const pickId = typeof payload.pickId === 'string' ? payload.pickId : '';
  const newCelebrityName =
    typeof payload.newCelebrityName === 'string'
      ? payload.newCelebrityName.trim()
      : '';

  if (!pickId || !newCelebrityName) {
    return { error: 'Both pickId and newCelebrityName are required.' };
  }

  const pickIndex = state.picks.findIndex((p) => p.id === pickId);
  if (pickIndex === -1) {
    return { error: 'Pick not found.' };
  }

  const existingPick = state.picks[pickIndex];
  const oldName = existingPick.celebrityName;

  if (oldName.toLowerCase() === newCelebrityName.toLowerCase()) {
    return { state };
  }

  const duplicate = state.picks.some(
    (p, idx) =>
      idx !== pickIndex && p.celebrityName.toLowerCase() === newCelebrityName.toLowerCase()
  );
  if (duplicate) {
    return { error: 'Another pick already has that celebrity.' };
  }

  let celeb = state.celebrities.find(
    (c) => c.name.toLowerCase() === newCelebrityName.toLowerCase()
  );
  let celebritiesWithCustom = state.celebrities;
  if (!celeb) {
    celeb = {
      id: `c-${state.celebrities.length}`,
      name: newCelebrityName
    };
    celebritiesWithCustom = [...state.celebrities, celeb];
  }

  const updatedPicks = state.picks.map((p, idx) =>
    idx === pickIndex ? { ...p, celebrityName: newCelebrityName } : p
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
  const newState = {
    ...state,
    picks: updatedPicks,
    celebrities: updatedCelebritiesBase,
    updatedAt: now
  };

  return { state: newState };
}

function applyReset(state) {
  if (!state) {
    return { error: 'Draft has not been initialized yet.' };
  }

  const now = new Date().toISOString();
  const newState = {
    ...state,
    picks: [],
    celebrities: state.celebrities.map((c) => ({ ...c, draftedById: undefined })),
    currentPickIndex: 0,
    currentRound: 1,
    status: 'not-started',
    updatedAt: now
  };

  return { state: newState };
}

function applyUndo(state) {
  if (!state) {
    return { error: 'Draft has not been initialized yet.' };
  }

  if (!state.picks.length) {
    return { state };
  }

  const last = state.picks[state.picks.length - 1];
  const remaining = state.picks.slice(0, -1);
  const now = new Date().toISOString();

  const newState = {
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

  return { state: newState };
}

function applyValidation(state, payload) {
  if (!state) {
    return { error: 'Draft has not been initialized yet.' };
  }

  const celebrityName =
    typeof payload.celebrityName === 'string' ? payload.celebrityName.trim() : '';
  const validation = payload.validation || {};

  if (!celebrityName) {
    return { error: 'Celebrity name is required for validation.' };
  }

  const target = state.celebrities.find(
    (c) => c.name.toLowerCase() === celebrityName.toLowerCase()
  );

  if (!target) {
    // If we don't find the celebrity, just leave the state unchanged; this can
    // happen if the board was reset between the pick and the validation result.
    return { state };
  }

  const updatedCelebrities = state.celebrities.map((c) =>
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
  const newState = {
    ...state,
    celebrities: updatedCelebrities,
    updatedAt
  };

  return { state: newState };
}

function applyReplace(stateFromClient) {
  if (!stateFromClient || typeof stateFromClient !== 'object') {
    return { error: 'Invalid state payload for replace action.' };
  }

  const now = new Date().toISOString();
  const nextState = {
    ...stateFromClient,
    updatedAt: now
  };

  return { state: nextState };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    // CORS preflight
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  if (event.httpMethod === 'GET') {
    const state = await loadDraftState();
    if (!state) {
      return {
        statusCode: 404,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: false, error: 'No draft state found.' })
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
      body: JSON.stringify({ success: false, error: 'Method not allowed. Use GET or POST.' })
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
      body: JSON.stringify({ success: false, error: 'Missing "action" field in body.' })
    };
  }

  try {
    if (action === 'init') {
      const totalRounds = body.totalRounds;
      const celebrityList = body.celebrityList;
      const nextState = createInitialState(totalRounds, celebrityList);
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
        body: JSON.stringify({
          success: false,
          error: 'Draft has not been initialized yet.'
        })
      };
    }

    let result;

    if (action === 'pick') {
      result = applyPick(currentState, body);
    } else if (action === 'editPick') {
      result = applyEditPick(currentState, body);
    } else if (action === 'reset') {
      result = applyReset(currentState);
    } else if (action === 'undo') {
      result = applyUndo(currentState);
    } else if (action === 'applyValidation') {
      result = applyValidation(currentState, body);
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          success: false,
          error: `Unsupported action "${action}".`
        })
      };
    }

    if (result.error) {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ success: false, error: result.error })
      };
    }

    const nextState = result.state;
    await saveDraftState(nextState);

    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ success: true, state: nextState })
    };
  } catch (err) {
    console.error('draft function error', err);
    return {
      statusCode: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    };
  }
}


