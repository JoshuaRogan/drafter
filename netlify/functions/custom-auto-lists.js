// Netlify serverless function for per-drafter custom auto‑draft lists.
//
// - Uses Netlify Blob Store to persist custom auto‑draft lists keyed by drafterId.
// - Each list stores lightweight celebrity metadata derived from the shared
//   validation endpoint (/.netlify/functions/validate-celebrity).
// - Supports POST actions:
//   - { "action": "list" }
//       → returns all lists keyed by drafterId
//   - {
//       "action": "add",
//       "drafterId": string,
//       "drafterName": string,
//       "name": string,
//       "validation": CelebrityValidationResult
//     }
//       → upserts a validated celebrity into the drafter's custom list
//   - {
//       "action": "remove",
//       "drafterId": string,
//       "celebrityId": string
//     }
//       → removes a single celebrity from the drafter's list
//   - {
//       "action": "reorder",
//       "drafterId": string,
//       "order": string[] // array of celebrity IDs in the desired order
//     }
//       → reorders a drafter's list according to the provided ID sequence

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

      const name = 'celebrity-draft-custom-lists';

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

const CUSTOM_LISTS_KEY = 'main-room';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra
  };
}

async function loadAllLists() {
  const store = await getBlobStore();

  try {
    const existing = (await store.get(CUSTOM_LISTS_KEY, { type: 'json' })) || {};
    const lists =
      existing &&
      typeof existing === 'object' &&
      existing.lists &&
      typeof existing.lists === 'object'
        ? existing.lists
        : {};
    return lists;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load custom auto lists from blob store', err);
    return {};
  }
}

async function saveAllLists(lists) {
  const store = await getBlobStore();
  await store.setJSON(CUSTOM_LISTS_KEY, { lists });
}

function createCelebrityFromValidation(name, validation) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const fullNameRaw =
    validation && typeof validation.fullName === 'string'
      ? validation.fullName.trim()
      : '';
  const fullName = fullNameRaw || trimmedName;

  const dateOfBirthRaw =
    validation && typeof validation.dateOfBirth === 'string'
      ? validation.dateOfBirth.trim()
      : '';

  const wikipediaUrlValue =
    validation && typeof validation.wikipediaUrl === 'string'
      ? validation.wikipediaUrl.trim()
      : '';

  const notesRaw =
    validation && typeof validation.notes === 'string'
      ? validation.notes.trim()
      : '';

  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: trimmedName,
    fullName,
    dateOfBirth: dateOfBirthRaw || undefined,
    wikipediaUrl: wikipediaUrlValue || null,
    hasWikipediaPage: !!validation?.hasWikipediaPage,
    isValidated: !!validation?.isValid,
    validationAttempted: true,
    isDeceased:
      typeof validation?.isDeceased === 'boolean' ? validation.isDeceased : undefined,
    validationNotes: notesRaw || null
  };
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

  try {
    if (action === 'list') {
      const lists = await loadAllLists();

      return {
        statusCode: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          success: true,
          listsByDrafter: lists
        })
      };
    }

    if (action === 'add') {
      const drafterId =
        typeof body.drafterId === 'string' ? body.drafterId.trim() : '';
      const drafterName =
        typeof body.drafterName === 'string' ? body.drafterName.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const validation =
        body.validation && typeof body.validation === 'object'
          ? body.validation
          : null;

      if (!drafterId || !drafterName || !name) {
        return {
          statusCode: 400,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            error:
              'Missing "drafterId", "drafterName", or "name" field for add action.'
          })
        };
      }

      if (!validation) {
        return {
          statusCode: 400,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            error: 'Missing or invalid "validation" field for add action.'
          })
        };
      }

      const lists = await loadAllLists();
      const existingList =
        lists[drafterId] && typeof lists[drafterId] === 'object'
          ? lists[drafterId]
          : {
              drafterId,
              drafterName,
              celebrities: [],
              updatedAt: new Date().toISOString()
            };

      const normalizedFullName = (
        (validation.fullName && typeof validation.fullName === 'string'
          ? validation.fullName
          : name) || name
      )
        .trim()
        .toLowerCase();

      const alreadyExists = Array.isArray(existingList.celebrities)
        ? existingList.celebrities.some((c) => {
            const candidate = (c.fullName || c.name || '').toLowerCase();
            return candidate === normalizedFullName;
          })
        : false;

      const nextCelebrities = alreadyExists
        ? existingList.celebrities || []
        : [
            ...(existingList.celebrities || []),
            createCelebrityFromValidation(name, validation)
          ];

      const updatedAt = new Date().toISOString();
      const updatedList = {
        ...existingList,
        drafterId,
        drafterName: existingList.drafterName || drafterName,
        celebrities: nextCelebrities,
        updatedAt
      };

      const nextLists = {
        ...lists,
        [drafterId]: updatedList
      };

      await saveAllLists(nextLists);

      return {
        statusCode: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          success: true,
          listsByDrafter: nextLists,
          list: updatedList,
          added: !alreadyExists
        })
      };
    }

    if (action === 'remove') {
      const drafterId =
        typeof body.drafterId === 'string' ? body.drafterId.trim() : '';
      const celebrityId =
        typeof body.celebrityId === 'string' ? body.celebrityId.trim() : '';

      if (!drafterId || !celebrityId) {
        return {
          statusCode: 400,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            error: 'Missing "drafterId" or "celebrityId" field for remove action.'
          })
        };
      }

      const lists = await loadAllLists();
      const existingList =
        lists[drafterId] && typeof lists[drafterId] === 'object'
          ? lists[drafterId]
          : null;

      if (!existingList || !Array.isArray(existingList.celebrities)) {
        // Nothing to remove; return the original collection.
        return {
          statusCode: 200,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            success: true,
            listsByDrafter: lists,
            list: existingList
          })
        };
      }

      const nextCelebrities = existingList.celebrities.filter(
        (c) => c.id !== celebrityId
      );
      const updatedAt = new Date().toISOString();

      const updatedList = {
        ...existingList,
        celebrities: nextCelebrities,
        updatedAt
      };

      const nextLists = {
        ...lists,
        [drafterId]: updatedList
      };

      await saveAllLists(nextLists);

      return {
        statusCode: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          success: true,
          listsByDrafter: nextLists,
          list: updatedList
        })
      };
    }

    if (action === 'reorder') {
      const drafterId =
        typeof body.drafterId === 'string' ? body.drafterId.trim() : '';
      const order = Array.isArray(body.order) ? body.order : null;

      if (!drafterId || !order || !order.length) {
        return {
          statusCode: 400,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            error:
              'Missing or invalid "drafterId" or "order" field for reorder action.'
          })
        };
      }

      const lists = await loadAllLists();
      const existingList =
        lists[drafterId] && typeof lists[drafterId] === 'object'
          ? lists[drafterId]
          : null;

      if (!existingList || !Array.isArray(existingList.celebrities)) {
        return {
          statusCode: 404,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            error: 'Custom list not found for specified drafterId.'
          })
        };
      }

      const byId = new Map();
      for (const celeb of existingList.celebrities) {
        if (celeb && typeof celeb.id === 'string') {
          byId.set(celeb.id, celeb);
        }
      }

      const reordered = [];
      for (const id of order) {
        if (typeof id !== 'string') continue;
        const celeb = byId.get(id);
        if (!celeb) continue;
        reordered.push(celeb);
        byId.delete(id);
      }

      // Append any celebrities that were not mentioned in the new order at the end,
      // preserving their original relative order.
      for (const celeb of existingList.celebrities) {
        if (!celeb || typeof celeb.id !== 'string') continue;
        if (byId.has(celeb.id)) {
          reordered.push(celeb);
          byId.delete(celeb.id);
        }
      }

      const updatedAt = new Date().toISOString();
      const updatedList = {
        ...existingList,
        celebrities: reordered,
        updatedAt
      };

      const nextLists = {
        ...lists,
        [drafterId]: updatedList
      };

      await saveAllLists(nextLists);

      return {
        statusCode: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          success: true,
          listsByDrafter: nextLists,
          list: updatedList
        })
      };
    }

    return {
      statusCode: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: `Unsupported action "${action}".` })
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('custom-auto-lists function error', err);
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



