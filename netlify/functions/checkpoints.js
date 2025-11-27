// Netlify serverless function for persistent draft checkpoints.
//
// - Uses Netlify Blob Store to persist up to 10 named checkpoints.
// - Each checkpoint stores the full DraftState plus metadata (id, name, createdAt).
// - Supports POST actions:
//   - { "action": "list" }
//   - { "action": "save", "name": string, "state": DraftState }
//   - { "action": "load", "id": string }
//
// All responses are JSON and include appropriate CORS headers so the
// browser client can call this directly from the Netlify-hosted app.
// import { getStore } from '@netlify/blobs';
// const siteId = 'b4fec060-b75f-4b4d-b172-4debdc660b56'
// const token = 'nfp_YyaG2Ywgwzzy3T7Hz2UpbRTj76pvxN2A72df'
// const store = getStore({ name: 'checkpoint', siteID: siteId, token: token });
// const KEY = 'checkpoints.json';

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

      const name = 'celebrity-draft-checkpoints';

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

const CHECKPOINT_KEY = 'main-room';
const MAX_CHECKPOINTS = 10;

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra
  };
}

async function loadAllCheckpoints() {
  const store = await getBlobStore();

  try {
    const existing = (await store.get(CHECKPOINT_KEY, { type: 'json' })) || {};
    const checkpoints = Array.isArray(existing.checkpoints) ? existing.checkpoints : [];
    return checkpoints;
  } catch (err) {
    console.error('Failed to load checkpoints from blob store', err);
    return [];
  }
}

async function saveAllCheckpoints(checkpoints) {
  const store = await getBlobStore();
  await store.setJSON(CHECKPOINT_KEY, { checkpoints });
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid JSON body.' })
    };
  }

  const action = typeof body.action === 'string' ? body.action : '';

  if (!action) {
    return {
      statusCode: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing "action" field in body.' })
    };
  }

  if (action === 'list') {
    const checkpoints = await loadAllCheckpoints();
    const summaries = checkpoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      createdAt: cp.createdAt
    }));

    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ checkpoints: summaries })
    };
  }

  if (action === 'save') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const state = body.state;

    if (!name) {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Missing "name" field for save action.' })
      };
    }

    if (!state || typeof state !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Missing or invalid "state" field for save action.' })
      };
    }

    const checkpoints = await loadAllCheckpoints();
    const now = new Date().toISOString();
    const id = `cp-${now}-${Math.random().toString(36).slice(2, 10)}`;

    const checkpoint = {
      id,
      name: name.slice(0, 120),
      createdAt: now,
      state
    };

    const next = [...checkpoints, checkpoint];
    if (next.length > MAX_CHECKPOINTS) {
      next.splice(0, next.length - MAX_CHECKPOINTS);
    }

    await saveAllCheckpoints(next);

    const summaries = next.map((cp) => ({
      id: cp.id,
      name: cp.name,
      createdAt: cp.createdAt
    }));

    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        success: true,
        checkpoints: summaries,
        saved: { id: checkpoint.id, name: checkpoint.name, createdAt: checkpoint.createdAt }
      })
    };
  }

  if (action === 'load') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Missing "id" field for load action.' })
      };
    }

    const checkpoints = await loadAllCheckpoints();
    const found = checkpoints.find((cp) => cp.id === id);

    if (!found) {
      return {
        statusCode: 404,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Checkpoint not found.' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        success: true,
        checkpoint: {
          id: found.id,
          name: found.name,
          createdAt: found.createdAt,
          state: found.state
        }
      })
    };
  }

  return {
    statusCode: 400,
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ error: `Unsupported action "${action}".` })
  };
};


