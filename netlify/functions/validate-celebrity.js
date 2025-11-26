/* Netlify serverless function to validate a drafted celebrity.
 *
 * - Accepts POST JSON: { "name": "Celebrity name" }
 * - Calls OpenAI to normalize the name and extract date of birth.
 * - Calls Wikipedia API to confirm a page exists.
 * - Returns JSON with normalized info and validation flags.
 *
 * Configure OPENAI_API_KEY in your Netlify environment.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Best-effort call to OpenAI to normalize a celebrity name and get DOB.
 * Returns null on any error.
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
              'If the name is clearly a public figure / celebrity, return their canonical full name and date of birth. ' +
              'If you are not confident, leave values empty but still return valid JSON.'
          },
          {
            role: 'user',
            content:
              `Celebrity name: "${name}".\n\n` +
              'Reply with ONLY a JSON object of the shape:\n' +
              '{ "fullName": string, "dateOfBirth": string, "notes": string }\n' +
              '- "dateOfBirth" should be ISO 8601 formatted (YYYY-MM-DD) if you know it confidently, ' +
              'otherwise an empty string.\n' +
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

    return {
      fullName: fullName || '',
      dateOfBirth: dateOfBirth || '',
      notes
    };
  } catch (err) {
    console.error('Error calling OpenAI', err);
    return null;
  }
}

/**
 * Look up a Wikipedia page for a celebrity.
 * Uses a simple search and returns the first matching page, if any.
 */
async function lookupWikipedia(name) {
  try {
    const searchUrl =
      'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=' +
      encodeURIComponent(name);

    const res = await fetch(searchUrl);
    if (!res.ok) {
      console.error('Wikipedia search failed', res.status, await res.text());
      return {
        hasWikipediaPage: false,
        wikipediaUrl: null,
        wikipediaTitle: null
      };
    }

    const data = await res.json();
    const first = data?.query?.search?.[0];
    if (!first) {
      return {
        hasWikipediaPage: false,
        wikipediaUrl: null,
        wikipediaTitle: null
      };
    }

    const title = first.title;
    const url = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));

    return {
      hasWikipediaPage: true,
      wikipediaUrl: url,
      wikipediaTitle: title
    };
  } catch (err) {
    console.error('Error querying Wikipedia', err);
    return {
      hasWikipediaPage: false,
      wikipediaUrl: null,
      wikipediaTitle: null
    };
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

  const [openAiResult, wikiResult] = await Promise.all([
    getCelebrityFromOpenAI(name),
    lookupWikipedia(name)
  ]);

  const fullName = openAiResult?.fullName || name;
  const dateOfBirth = openAiResult?.dateOfBirth || '';

  const hasWikipediaPage = wikiResult.hasWikipediaPage;
  const wikipediaUrl = wikiResult.wikipediaUrl;

  const isValid = Boolean(hasWikipediaPage || dateOfBirth);

  const result = {
    inputName: name,
    fullName,
    dateOfBirth,
    hasWikipediaPage,
    wikipediaUrl,
    isValid,
    notes: openAiResult?.notes || null
  };

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


