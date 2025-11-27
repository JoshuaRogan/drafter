// Simple Netlify function to verify manual use of Netlify Blobs with siteID + token.
//
// This is intentionally minimal: it writes a tiny JSON blob and then reads it back.
// Call it at:
//   /.netlify/functions/blob-manual
//
// For safety, siteID and token are read from environment variables. You can set them via:
//   netlify env:set NETLIFY_BLOBS_SITE_ID <your-site-id>
//   netlify env:set NETLIFY_BLOBS_TOKEN <your-personal-access-token>
//
// If you prefer, you can inline your values instead of using env vars, e.g.:
//   const store = getStore({ name: 'checkpoint', siteID: '...', token: '...' });

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  try {
    const { getStore } = await import('@netlify/blobs');

    const siteID =
      process.env.NETLIFY_BLOBS_SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      '';
    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_ACCESS_TOKEN ||
      '';

    if (!siteID || !token) {
      return {
        statusCode: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          error:
            'Missing siteID or token. Set NETLIFY_BLOBS_SITE_ID and NETLIFY_BLOBS_TOKEN (or NETLIFY_SITE_ID / NETLIFY_ACCESS_TOKEN).'
        })
      };
    }

    const store = getStore({
      name: 'checkpoint',
      siteID,
      token
    });

    const key = 'checkpoints.json';
    const payload = {
      message: 'Hello from blob-manual',
      at: new Date().toISOString()
    };

    await store.setJSON(key, payload);
    const readBack = await store.get(key, { type: 'json' });

    return {
      statusCode: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        success: true,
        wrote: payload,
        readBack: readBack || null
      })
    };
  } catch (err) {
    console.error('blob-manual error', err);
    return {
      statusCode: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    };
  }
};


