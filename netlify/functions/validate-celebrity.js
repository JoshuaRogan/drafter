/* Netlify serverless function to validate a drafted celebrity.
 *
 * - Accepts POST JSON: { "name": "Celebrity name", "force"?: boolean }
 * - Uses OpenAI only to normalize the name, extract date of birth, guess a Wikipedia URL,
 *   and infer whether the person is currently alive or deceased.
 * - Returns JSON with normalized info and validation flags.
 *
 * Caching layer:
 * - When a lookup returns a Wikipedia URL, we cache the full validation result in Netlify Blobs.
 * - Subsequent lookups for the same name will serve the cached result instead of calling OpenAI,
 *   unless `force: true` is passed in the body.
 *
 * No direct Wikipedia API lookups are used; the UI relies solely on OpenAI output.
 * Configure OPENAI_API_KEY in your Netlify environment.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ---------------------------
// Netlify Blobs cache helpers
// ---------------------------

let validationBlobStorePromise;

async function getValidationBlobStore() {
  if (!validationBlobStorePromise) {
    validationBlobStorePromise = (async () => {
      try {
        const mod = await import('@netlify/blobs');

        const siteID =
          process.env.NETLIFY_BLOBS_SITE_ID ||
          process.env.NETLIFY_SITE_ID ||
          '';
        const token =
          process.env.NETLIFY_BLOBS_TOKEN ||
          process.env.NETLIFY_ACCESS_TOKEN ||
          '';

        const name = 'celebrity-draft-validations';

        if (siteID && token) {
          // Manual mode (works in local dev and in environments without automatic Blobs config).
          return mod.getStore({ name, siteID, token });
        }

        // Automatic mode (works when running on Netlify with Blobs enabled / linked via CLI).
        return mod.getStore(name);
      } catch (err) {
        console.warn('Validation cache: failed to initialize blob store; caching disabled.', err);
        return null;
      }
    })();
  }
  return validationBlobStorePromise;
}

function getCacheKeyForName(name) {
  if (!name || typeof name !== 'string') return null;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  return `name-${encodeURIComponent(normalized)}`;
}

async function readCachedValidation(name) {
  const store = await getValidationBlobStore();
  if (!store) return null;

  const key = getCacheKeyForName(name);
  if (!key) return null;

  try {
    const cached = await store.get(key, { type: 'json' });
    if (!cached || typeof cached !== 'object') return null;
    const result = cached.result;
    if (!result || typeof result !== 'object') return null;
    return result;
  } catch (err) {
    console.error('Validation cache: failed to read cached entry', err);
    return null;
  }
}

async function writeCachedValidation(name, result) {
  const store = await getValidationBlobStore();
  if (!store) return;

  const key = getCacheKeyForName(name);
  if (!key) return;

  try {
    const payload = {
      cachedAt: new Date().toISOString(),
      result
    };
    await store.setJSON(key, payload);
  } catch (err) {
    console.error('Validation cache: failed to write cached entry', err);
  }
}

/**
 * Best-effort call to OpenAI to normalize a celebrity name and get DOB/Wikipedia URL / life status.
 * Returns a small object on success, or null on any error.
 */
async function getCelebrityFromOpenAI(name) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY is not set; skipping OpenAI lookup.');
    return null;
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise data extraction assistant for a celebrity draft game. ' +
              'Given a person name, you MUST reply with a single JSON object only, no extra text. ' +
              'If the name is clearly a public figure / celebrity, return their canonical full name, date of birth, ' +
              'and whether they are currently alive or deceased. ' +
              'If you are not confident, leave values empty but still return valid JSON and set isDeceased to false.'
          },
          {
            role: 'user',
            content:
              `Celebrity name: "${name}".\n\n` +
              'Reply with ONLY a JSON object of the shape:\n' +
              '{ "fullName": string, "dateOfBirth": string, "wikipediaUrl": string, "isDeceased": boolean, "notes": string }\n' +
              '- "dateOfBirth" should be ISO 8601 formatted (YYYY-MM-DD) if you know it confidently, ' +
              'otherwise an empty string.\n' +
              '- "wikipediaUrl" should be the canonical English Wikipedia URL for this person if you know it, ' +
              'otherwise an empty string.\n' +
              '- "isDeceased" should be true ONLY if you are confident the person is no longer alive; otherwise false.\n' +
              '- "notes" can briefly explain any ambiguity.'
          }
        ]
      })
    });

    if (!response.ok) {
      console.error('OpenAI request failed', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse OpenAI JSON response', e, content);
      return null;
    }

    const fullName = typeof parsed.fullName === 'string' ? parsed.fullName.trim() : '';
    const dateOfBirth = typeof parsed.dateOfBirth === 'string' ? parsed.dateOfBirth.trim() : '';
    const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';
    const wikipediaUrlFromOpenAI =
      typeof parsed.wikipediaUrl === 'string' ? parsed.wikipediaUrl.trim() : '';
    const isDeceased =
      typeof parsed.isDeceased === 'boolean'
        ? parsed.isDeceased
        : false;

    return {
      fullName: fullName || '',
      dateOfBirth: dateOfBirth || '',
      notes,
      wikipediaUrlFromOpenAI: wikipediaUrlFromOpenAI || '',
      isDeceased
    };
  } catch (err) {
    console.error('Error calling OpenAI', err);
    return null;
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    // CORS preflight
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Invalid JSON body.' })
    };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Missing "name" field in body.' })
    };
  }

  const force =
    typeof body.force === 'boolean'
      ? body.force
      : false;

  // If we have a cached validation with a Wikipedia match and this is not a forced refresh,
  // serve the cached result directly to avoid an unnecessary OpenAI call.
  if (!force) {
    const cachedResult = await readCachedValidation(name);
    if (cachedResult && cachedResult.hasWikipediaPage && cachedResult.wikipediaUrl) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: true,
          result: cachedResult
        })
      };
    }
  }

  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  let openAiResult = null;
  let usedOpenAI = false;
  let openAIError = null;

  if (hasOpenAIKey) {
    const maybeOpenAI = await getCelebrityFromOpenAI(name);
    if (maybeOpenAI) {
      openAiResult = maybeOpenAI;
      usedOpenAI = true;
    } else {
      openAIError = 'OpenAI request failed or returned no result.';
    }
  } else {
    openAIError = 'OPENAI_API_KEY not configured.';
  }

  const fullName = openAiResult?.fullName || name;
  const dateOfBirth = openAiResult?.dateOfBirth || '';
  const wikipediaUrlFromOpenAI = openAiResult?.wikipediaUrlFromOpenAI || '';
  const isDeceased = !!openAiResult?.isDeceased;

  const hasWikipediaPage = !!wikipediaUrlFromOpenAI;
  const wikipediaUrl = wikipediaUrlFromOpenAI || null;

  const isValid = Boolean(hasWikipediaPage || dateOfBirth);

  const result = {
    inputName: name,
    fullName,
    dateOfBirth,
    hasWikipediaPage,
    wikipediaUrl,
    isValid,
    notes: openAiResult?.notes || null,
    isDeceased,
    usedOpenAI,
    openAIError
  };

  // Cache successful lookups that clearly map to a Wikipedia page so that
  // subsequent validations for the same name can be served from the cache.
  if (result.hasWikipediaPage && result.wikipediaUrl) {
    // Fire-and-forget; caching failures should not break validation.
    void writeCachedValidation(name, result);
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      result
    })
  };
};


