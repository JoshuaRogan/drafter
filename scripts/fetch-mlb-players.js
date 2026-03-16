#!/usr/bin/env node

// Fetches MLB players from the MLB Stats API with multi-position support.
// Usage: node scripts/fetch-mlb-players.js

const fs = require('fs');
const path = require('path');

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const SEASON = 2025;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Map MLB position abbreviations to draft categories
function positionCategory(abbr) {
  if (!abbr) return 'UTIL';
  const upper = abbr.toUpperCase();
  if (upper === 'C') return 'C';
  if (upper === '1B') return '1B';
  if (upper === '2B') return '2B';
  if (upper === '3B') return '3B';
  if (upper === 'SS') return 'SS';
  if (['LF', 'CF', 'RF', 'OF'].includes(upper)) return 'OF';
  if (['P', 'SP', 'RP', 'CL'].includes(upper)) return 'P';
  if (upper === 'DH') return 'DH';
  if (['TWP', 'TWO'].includes(upper)) return 'UTIL';
  return 'UTIL';
}

// Batch fetch people with fielding stats to get all positions played
async function batchFetchFieldingPositions(playerIds) {
  const positionsByPlayerId = {}; // id → Set of position abbreviations
  const BATCH_SIZE = 50;

  for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
    const batch = playerIds.slice(i, i + BATCH_SIZE);
    const ids = batch.join(',');
    try {
      const data = await fetchJSON(
        `${MLB_API}/people?personIds=${ids}&hydrate=stats(group=[fielding],type=[season],season=${SEASON})`
      );
      for (const person of data.people || []) {
        const positions = new Set();
        const stats = person.stats || [];
        for (const statGroup of stats) {
          for (const split of statGroup.splits || []) {
            const posAbbr = split.position?.abbreviation;
            if (posAbbr) {
              positions.add(posAbbr);
            }
          }
        }
        // Also include their primary position from the person object
        if (person.primaryPosition?.abbreviation) {
          positions.add(person.primaryPosition.abbreviation);
        }
        positionsByPlayerId[person.id] = positions;
      }
      await delay(100);
    } catch (err) {
      console.error(`  Batch fielding fetch failed for batch starting at ${i}: ${err.message}`);
    }
    if ((i / BATCH_SIZE) % 5 === 0 && i > 0) {
      console.log(`  Processed ${i}/${playerIds.length} players for fielding data...`);
    }
  }

  return positionsByPlayerId;
}

async function main() {
  console.log(`Fetching MLB data for ${SEASON} season...`);

  // 1. Get all MLB teams
  console.log('Fetching teams...');
  const teamsData = await fetchJSON(`${MLB_API}/teams?sportId=1&season=${SEASON}`);
  const teams = teamsData.teams || [];
  console.log(`Found ${teams.length} teams`);

  const teamById = {};
  for (const t of teams) {
    teamById[t.id] = { name: t.name, abbr: t.abbreviation };
  }

  // 2. Get roster for each team → primary position data
  console.log('Fetching team rosters...');
  const rosterByPlayerId = {};

  for (const team of teams) {
    try {
      const rosterData = await fetchJSON(
        `${MLB_API}/teams/${team.id}/roster?season=${SEASON}&rosterType=fullSeason`
      );
      for (const entry of rosterData.roster || []) {
        rosterByPlayerId[entry.person.id] = {
          id: entry.person.id,
          name: entry.person.fullName,
          position: entry.position?.abbreviation || '',
          positionName: entry.position?.name || '',
          positionType: entry.position?.type || '',
          team: team.name,
          teamAbbr: team.abbreviation,
        };
      }
      await delay(50);
    } catch (err) {
      console.error(`  Failed to get roster for ${team.name}: ${err.message}`);
    }
  }
  console.log(`Loaded ${Object.keys(rosterByPlayerId).length} players from rosters`);

  // 3. Get batting leaders from multiple categories
  console.log('Fetching batting leaders...');
  const batterIds = new Map();
  const battingCategories = [
    'plateAppearances', 'hits', 'homeRuns', 'runsBattedIn',
    'stolenBases', 'runs', 'totalBases', 'doubles', 'walks',
    'battingAverage', 'onBasePlusSlugging', 'triples',
    'intentionalWalks', 'hitByPitches', 'sacFlies',
  ];

  for (const cat of battingCategories) {
    try {
      const data = await fetchJSON(
        `${MLB_API}/stats/leaders?leaderCategories=${cat}&season=${SEASON}&limit=100&sportId=1`
      );
      const leaders = data.leagueLeaders?.[0]?.leaders || [];
      for (const l of leaders) {
        if (!batterIds.has(l.person.id)) {
          batterIds.set(l.person.id, {
            id: l.person.id,
            name: l.person.fullName,
            teamId: l.team?.id
          });
        }
      }
      await delay(50);
    } catch (err) {
      console.error(`  Failed to fetch ${cat} leaders: ${err.message}`);
    }
  }
  const topBatters = Array.from(batterIds.values());
  console.log(`Found ${topBatters.length} unique top batters`);

  // 4. Get pitching leaders from multiple categories
  console.log('Fetching pitching leaders...');
  const pitcherIds = new Map();
  const pitchingCategories = [
    'inningsPitched', 'strikeouts', 'wins', 'saves',
    'earnedRunAverage', 'walksAndHitsPerInningPitched',
    'strikeoutsPer9Inn', 'gamesPlayed', 'holds',
  ];

  for (const cat of pitchingCategories) {
    try {
      const data = await fetchJSON(
        `${MLB_API}/stats/leaders?leaderCategories=${cat}&season=${SEASON}&limit=100&sportId=1`
      );
      const leaders = data.leagueLeaders?.[0]?.leaders || [];
      for (const l of leaders) {
        if (!pitcherIds.has(l.person.id)) {
          pitcherIds.set(l.person.id, {
            id: l.person.id,
            name: l.person.fullName,
            teamId: l.team?.id
          });
        }
      }
      await delay(50);
    } catch (err) {
      console.error(`  Failed to fetch ${cat} pitching leaders: ${err.message}`);
    }
  }
  const topPitchers = Array.from(pitcherIds.values());
  console.log(`Found ${topPitchers.length} unique top pitchers`);

  // 4b. Get additional batters by at-bats from team rosters
  console.log('Fetching additional batters by at-bats from all team rosters...');
  const rosterBatterIds = new Map();

  for (const team of teams) {
    try {
      const data = await fetchJSON(
        `${MLB_API}/teams/${team.id}/roster?season=${SEASON}&rosterType=fullSeason&hydrate=person(stats(type=season,season=${SEASON},group=hitting))`
      );
      for (const entry of data.roster || []) {
        const posType = entry.position?.type || '';
        // Skip pitchers (unless two-way)
        if (posType === 'Pitcher') continue;

        const person = entry.person || {};
        const stats = person.stats || [];
        let atBats = 0;
        for (const sg of stats) {
          for (const split of sg.splits || []) {
            atBats += split.stat?.atBats || 0;
          }
        }

        if (atBats > 0 && !batterIds.has(person.id) && !rosterBatterIds.has(person.id)) {
          rosterBatterIds.set(person.id, {
            id: person.id,
            name: person.fullName,
            teamId: team.id,
            atBats
          });
        }
      }
      await delay(50);
    } catch (err) {
      console.error(`  Failed to get roster hitters for ${team.name}: ${err.message}`);
    }
  }

  // Sort by at-bats descending and take top 500
  const additionalBatters = Array.from(rosterBatterIds.values())
    .sort((a, b) => b.atBats - a.atBats)
    .slice(0, 500);
  console.log(`Found ${additionalBatters.length} additional batters by at-bats (from ${rosterBatterIds.size} total roster hitters)`);

  // 5. Get managers
  console.log('Fetching managers...');
  const managers = [];
  for (const team of teams) {
    try {
      const data = await fetchJSON(`${MLB_API}/teams/${team.id}/coaches?season=${SEASON}`);
      const rosterEntries = data.roster || [];
      const mgr = rosterEntries.find(
        (c) => c.title === 'Manager' || c.job === 'Manager' || c.jobId === 'MNGR'
      );
      if (mgr) {
        managers.push({
          id: mgr.person.id,
          name: mgr.person.fullName || mgr.person.link,
          team: team.name,
          teamAbbr: team.abbreviation
        });
      }
      await delay(50);
    } catch (err) {
      console.error(`  Failed to get coaches for ${team.name}: ${err.message}`);
    }
  }
  console.log(`Found ${managers.length} managers`);

  // 6. Collect all unique player IDs for multi-position fetch
  const allPlayerIds = new Set();
  for (const b of topBatters) allPlayerIds.add(b.id);
  for (const p of topPitchers) allPlayerIds.add(p.id);
  for (const b of additionalBatters) allPlayerIds.add(b.id);

  console.log(`\nFetching fielding stats for ${allPlayerIds.size} players to determine all positions played...`);
  const fieldingPositions = await batchFetchFieldingPositions(Array.from(allPlayerIds));
  console.log(`Got fielding data for ${Object.keys(fieldingPositions).length} players`);

  // 7. Combine into final player list with multi-position support
  const seenIds = new Set();
  const players = [];

  // Add top batters
  for (const batter of topBatters) {
    if (seenIds.has(batter.id)) continue;
    seenIds.add(batter.id);

    const roster = rosterByPlayerId[batter.id];
    const teamInfo = batter.teamId ? teamById[batter.teamId] : null;
    const fieldingPos = fieldingPositions[batter.id] || new Set();

    // Primary position from roster
    const primaryPos = roster?.position || 'UTIL';

    // All positions: combine roster primary + fielding positions
    const allPositions = new Set([primaryPos]);
    for (const fp of fieldingPos) {
      allPositions.add(fp);
    }

    // Convert to categories (dedup OF variants, etc.)
    const allCategories = new Set();
    for (const pos of allPositions) {
      allCategories.add(positionCategory(pos));
    }

    // Remove UTIL/DH from categories if there are real positions
    if (allCategories.size > 1) {
      allCategories.delete('UTIL');
    }

    players.push({
      id: batter.id,
      name: roster?.name || batter.name,
      position: primaryPos,
      positions: Array.from(allPositions).sort(),
      positionCategory: positionCategory(primaryPos),
      positionCategories: Array.from(allCategories).sort(),
      team: roster?.team || teamInfo?.name || '',
      teamAbbr: roster?.teamAbbr || teamInfo?.abbr || '',
      category: 'batter'
    });
  }

  // Add top pitchers (not already in batters list)
  for (const pitcher of topPitchers) {
    if (seenIds.has(pitcher.id)) continue;
    seenIds.add(pitcher.id);

    const roster = rosterByPlayerId[pitcher.id];
    const teamInfo = pitcher.teamId ? teamById[pitcher.teamId] : null;
    const fieldingPos = fieldingPositions[pitcher.id] || new Set();

    const primaryPos = roster?.position || 'P';
    const allPositions = new Set([primaryPos]);
    for (const fp of fieldingPos) {
      allPositions.add(fp);
    }

    const allCategories = new Set();
    for (const pos of allPositions) {
      allCategories.add(positionCategory(pos));
    }
    if (allCategories.size > 1) {
      allCategories.delete('UTIL');
    }

    players.push({
      id: pitcher.id,
      name: roster?.name || pitcher.name,
      position: primaryPos,
      positions: Array.from(allPositions).sort(),
      positionCategory: positionCategory(primaryPos),
      positionCategories: Array.from(allCategories).sort(),
      team: roster?.team || teamInfo?.name || '',
      teamAbbr: roster?.teamAbbr || teamInfo?.abbr || '',
      category: 'pitcher'
    });
  }

  // Add additional batters by at-bats (not already in list)
  for (const batter of additionalBatters) {
    if (seenIds.has(batter.id)) continue;
    seenIds.add(batter.id);

    const roster = rosterByPlayerId[batter.id];
    const teamInfo = batter.teamId ? teamById[batter.teamId] : null;
    const fieldingPos = fieldingPositions[batter.id] || new Set();

    const primaryPos = roster?.position || 'UTIL';
    const allPositions = new Set([primaryPos]);
    for (const fp of fieldingPos) {
      allPositions.add(fp);
    }

    const allCategories = new Set();
    for (const pos of allPositions) {
      allCategories.add(positionCategory(pos));
    }
    if (allCategories.size > 1) {
      allCategories.delete('UTIL');
    }

    players.push({
      id: batter.id,
      name: roster?.name || batter.name,
      position: primaryPos,
      positions: Array.from(allPositions).sort(),
      positionCategory: positionCategory(primaryPos),
      positionCategories: Array.from(allCategories).sort(),
      team: roster?.team || teamInfo?.name || '',
      teamAbbr: roster?.teamAbbr || teamInfo?.abbr || '',
      category: 'batter'
    });
  }

  // Sort alphabetically
  players.sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    players,
    managers: managers.sort((a, b) => a.name.localeCompare(b.name))
  };

  const outPath = path.join(__dirname, '..', 'mlb-players.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  // Stats
  const multiPos = players.filter(p => p.positionCategories.length > 1).length;
  console.log(`\nDone! Wrote ${players.length} players (${multiPos} multi-position) and ${managers.length} managers to mlb-players.json`);

  // Position category breakdown
  const catCounts = {};
  for (const p of players) {
    for (const c of p.positionCategories) {
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
  }
  console.log('Position eligibility counts:', catCounts);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
