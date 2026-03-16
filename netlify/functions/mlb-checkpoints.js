// Netlify serverless function for persistent MLB draft checkpoints.
// Uses a separate blob store from the celebrity draft checkpoints.

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

      const name = 'mlb-draft-checkpoints';

      if (siteID && token) {
        return mod.getStore({ name, siteID, token });
      }

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
    return Array.isArray(existing.checkpoints) ? existing.checkpoints : [];
  } catch (err) {
    console.error('Failed to load MLB checkpoints from blob store', err);
    return [];
  }
}

async function saveAllCheckpoints(checkpoints) {
  const store = await getBlobStore();
  await store.setJSON(CHECKPOINT_KEY, { checkpoints });
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
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
      body: JSON.stringify({ error: 'Missing "action" field.' })
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
        body: JSON.stringify({ error: 'Missing "name" field.' })
      };
    }
    if (!state || typeof state !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Missing or invalid "state" field.' })
      };
    }

    const checkpoints = await loadAllCheckpoints();
    const now = new Date().toISOString();
    const id = `cp-${now}-${Math.random().toString(36).slice(2, 10)}`;

    const checkpoint = { id, name: name.slice(0, 120), createdAt: now, state };
    const next = [...checkpoints, checkpoint];
    if (next.length > MAX_CHECKPOINTS) next.splice(0, next.length - MAX_CHECKPOINTS);

    await saveAllCheckpoints(next);

    const summaries = next.map((cp) => ({ id: cp.id, name: cp.name, createdAt: cp.createdAt }));
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
        body: JSON.stringify({ error: 'Missing "id" field.' })
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
        checkpoint: { id: found.id, name: found.name, createdAt: found.createdAt, state: found.state }
      })
    };
  }

  return {
    statusCode: 400,
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ error: `Unsupported action "${action}".` })
  };
};
