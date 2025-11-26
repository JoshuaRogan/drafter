// generate-celebrities.mjs
//
// Generates ~200 unique living celebrities with:
// - fullName
// - dateOfBirth (ISO string)
// - wikipediaUrl (English)
// - age (computed locally)
// - notes (from OpenAI, may explain edge cases)
//
// Output: celebrities.json in the current directory.
//
// Requirements:
// - Node 18+ (for global fetch)
// - OPENAI_API_KEY env var set
//
// Usage:
//   1) Put OPENAI_API_KEY in a .env or .env.local file at the project root, e.g.:
//        OPENAI_API_KEY=sk-...
//   2) Run:
//        npm run generate:celebs

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Config
const TOTAL_TARGET = 500;
const BATCH_SIZE = 40; // number of celebs requested per API call (keep this modest to avoid huge responses)
const MODEL = 'gpt-5-mini';
const TEMPERATURE = 0;
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes per OpenAI request
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2_000;

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, 'celebrities.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let envLoaded = false;
function loadEnvFromFilesOnce() {
  if (envLoaded) return;
  envLoaded = true;

  const envFiles = ['.env', '.env.local'];

  for (const filename of envFiles) {
    const envPath = path.join(__dirname, filename);
    if (!fsSync.existsSync(envPath)) continue;

    const content = fsSync.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;

      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();

      // Strip optional surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function requireApiKey() {
  loadEnvFromFilesOnce();

  const apiKey =
    process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '';
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY (or VITE_OPENAI_API_KEY) is not set in .env/.env.local or the environment.'
    );
  }
  return apiKey;
}

function calculateAge(dobIso) {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) {
    throw new Error(`Invalid date: ${dobIso}`);
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

async function loadExistingCelebrities() {
  if (!fsSync.existsSync(OUTPUT_FILE)) {
    return { allCelebs: [], nameSet: new Set() };
  }

  try {
    const raw = await fs.readFile(OUTPUT_FILE, 'utf8');
    if (!raw.trim()) {
      return { allCelebs: [], nameSet: new Set() };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        'Existing celebrities.json is not an array. Ignoring and starting fresh.'
      );
      return { allCelebs: [], nameSet: new Set() };
    }

    const allCelebs = [];
    const nameSet = new Set();

    for (const person of parsed) {
      if (!person || typeof person !== 'object') continue;

      const fullName =
        typeof person.fullName === 'string' ? person.fullName.trim() : '';
      const dateOfBirth =
        typeof person.dateOfBirth === 'string'
          ? person.dateOfBirth.trim()
          : '';
      const wikipediaUrl =
        typeof person.wikipediaUrl === 'string'
          ? person.wikipediaUrl.trim()
          : '';
      const notes =
        typeof person.notes === 'string' ? person.notes.trim() : '';
      const existingAge =
        typeof person.age === 'number' && Number.isFinite(person.age)
          ? person.age
          : null;

      if (!fullName || !dateOfBirth) continue;

      const key = fullName.toLowerCase();
      if (nameSet.has(key)) continue;

      let age = existingAge;
      if (age === null || age <= 0 || age > 120) {
        try {
          age = calculateAge(dateOfBirth);
        } catch {
          continue;
        }
      }

      allCelebs.push({
        fullName,
        dateOfBirth,
        wikipediaUrl,
        age,
        notes
      });
      nameSet.add(key);
    }

    console.log(
      `Loaded ${allCelebs.length} existing celebrities from celebrities.json`
    );
    return { allCelebs, nameSet };
  } catch (err) {
    console.error(
      'Could not load existing celebrities.json, starting fresh:',
      err
    );
    return { allCelebs: [], nameSet: new Set() };
  }
}

/**
 * Ask OpenAI for a batch of living celebrities with DOB + Wikipedia URL.
 * Returns an array of objects:
 * {
 *   fullName: string,
 *   dateOfBirth: string (YYYY-MM-DD),
 *   wikipediaUrl: string,
 *   isDeceased: boolean,
 *   notes: string
 * }
 */
async function generateCelebrityBatch(batchSize, existingNames) {
  const apiKey = requireApiKey();

  // Only pass a subset of existing names to keep prompt small
  const excludeList = Array.from(existingNames)
    .slice(-500) // last 500 names only
    .join(', ');

  const systemPrompt =
    'You are a precise data extraction assistant for a celebrity dataset. ' +
    'You must output STRICT JSON only, no extra commentary.';

  const userPrompt = `
Generate EXACTLY ${batchSize} unique, well-known living public figures (celebrities) from around the world. Focusing on older celebrities.. 

Requirements for EACH person:
- They must be alive as of today.
- They must have an English Wikipedia article.
- You must know their full name and date of birth confidently.
- Avoid any fictional characters.

Return ONLY a single JSON object with the shape:
{
  "people": [
    {
      "fullName": string,
      "dateOfBirth": string,        // strictly ISO "YYYY-MM-DD"
      "wikipediaUrl": string,       // canonical English Wikipedia URL for the person
      "isDeceased": boolean,        // MUST be false for every person you include
      "notes": string               // short note or empty string
    },
    ...
  ]
}

Additional constraints:
- All "fullName" values must be unique within this batch.
- "isDeceased" MUST be false for every returned person. Do not include anyone if you think they might be deceased.
- "wikipediaUrl" MUST be a valid English Wikipedia URL for that person (en.wikipedia.org).
- If you are uncertain about someone's date of birth or life status, DO NOT INCLUDE them; pick someone else instead.

Already used names (DO NOT repeat any of these):
${excludeList || '(none yet)'}
`.trim();

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    let response;
    try {
      console.log(
        `Calling OpenAI (attempt ${attempt}/${MAX_RETRIES}) for batchSize=${batchSize}, existingNames=${existingNames.size}`
      );

      response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL,
          // temperature: TEMPERATURE, // optional, left at API default
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);

      if (err && err.name === 'AbortError') {
        lastError = new Error(
          `OpenAI request aborted after ${REQUEST_TIMEOUT_MS}ms (timeout)`
        );
      } else {
        lastError = err;
      }

      if (attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `OpenAI request error on attempt ${attempt} (${lastError.message}). Retrying in ${delay}ms...`
      );
      await sleep(delay);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text();
      const status = response.status;
      const retriable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;

      lastError = new Error(`OpenAI request failed: ${status} - ${text}`);

      if (!retriable || attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `OpenAI request failed with status ${status} on attempt ${attempt}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      continue;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      lastError = new Error(
        'OpenAI returned no content or non-string content.'
      );

      if (attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `OpenAI returned invalid content on attempt ${attempt}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error('Failed to parse OpenAI JSON response:', content);
      lastError = err;

      if (attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `JSON parse error on attempt ${attempt}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      continue;
    }

    if (!parsed.people || !Array.isArray(parsed.people)) {
      lastError = new Error('OpenAI JSON missing "people" array.');

      if (attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `"people" array missing on attempt ${attempt}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      continue;
    }

    return parsed.people;
  }

  // Should not be reachable, but keeps TypeScript / linters happy if used
  throw lastError || new Error('Unknown error calling OpenAI');
}

async function main() {
  const { allCelebs, nameSet } = await loadExistingCelebrities();
  console.log(
    `Starting with ${allCelebs.length}/${TOTAL_TARGET} celebrities in ${OUTPUT_FILE}`
  );

  while (allCelebs.length < TOTAL_TARGET) {
    const remaining = TOTAL_TARGET - allCelebs.length;
    const batchSize = Math.min(BATCH_SIZE, remaining + 20); // oversample a bit

    console.log(
      `Requesting batch of ${batchSize} celebrities (currently have ${allCelebs.length}/${TOTAL_TARGET})...`
    );

    let batch;
    try {
      batch = await generateCelebrityBatch(batchSize, nameSet);
    } catch (err) {
      console.error('Error from OpenAI while generating batch:', err);
      break; // stop on hard error
    }

    const beforeCount = allCelebs.length;

    for (const person of batch) {
      if (!person || typeof person !== 'object') continue;

      const fullName =
        typeof person.fullName === 'string' ? person.fullName.trim() : '';
      const dateOfBirth =
        typeof person.dateOfBirth === 'string'
          ? person.dateOfBirth.trim()
          : '';
      const wikipediaUrl =
        typeof person.wikipediaUrl === 'string'
          ? person.wikipediaUrl.trim()
          : '';
      const isDeceased =
        typeof person.isDeceased === 'boolean' ? person.isDeceased : false;
      const notes =
        typeof person.notes === 'string' ? person.notes.trim() : '';

      if (!fullName) continue;

      const key = fullName.toLowerCase();
      if (nameSet.has(key)) continue; // global dedupe

      if (isDeceased) continue; // we only want living people
      if (!dateOfBirth) continue;
      if (!wikipediaUrl || !wikipediaUrl.includes('en.wikipedia.org')) continue;

      let age;
      try {
        age = calculateAge(dateOfBirth);
      } catch {
        continue;
      }

      // Filter out clearly impossible ages
      if (age < 0 || age > 120) continue;

      allCelebs.push({
        fullName,
        dateOfBirth,
        wikipediaUrl,
        age,
        notes
      });
      nameSet.add(key);

      if (allCelebs.length >= TOTAL_TARGET) break;
    }

    if (allCelebs.length > beforeCount) {
      await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(allCelebs, null, 2),
        'utf8'
      );
      console.log(
        `Wrote ${allCelebs.length} celebrities so far to ${OUTPUT_FILE}`
      );
    }

    console.log(
      `Collected ${allCelebs.length}/${TOTAL_TARGET} valid, unique living celebrities so far.`
    );
  }

  console.log(
    `\nDone. Final count: ${allCelebs.length} celebrities written to ${OUTPUT_FILE}`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});


