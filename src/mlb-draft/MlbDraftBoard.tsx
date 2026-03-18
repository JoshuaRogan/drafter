import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMlbDraft, getMlbPreconfiguredDrafters } from './MlbDraftContext';
import type { MlbDraftState, MlbPlayer, MlbPick } from './types';
import { ROSTER_SLOTS } from './types';

const getCurrentDrafter = (state: MlbDraftState | null) => {
  if (!state || !state.drafters.length) return null;
  const perRound = state.drafters.length;
  const totalSlots = state.config.totalRounds * perRound;
  if (state.currentPickIndex >= totalSlots) return null;

  const index = state.currentPickIndex;
  const roundIndex = Math.floor(index / perRound);
  const indexInRound = index % perRound;
  const isReverse = roundIndex % 2 === 1;
  const seatIndex = isReverse ? perRound - 1 - indexInRound : indexInRound;
  return state.drafters[seatIndex] ?? null;
};

const POSITION_FILTERS = [
  { label: 'All', value: '' },
  { label: 'C', value: 'C' },
  { label: '1B', value: '1B' },
  { label: '2B', value: '2B' },
  { label: '3B', value: '3B' },
  { label: 'SS', value: 'SS' },
  { label: 'OF', value: 'OF' },
  { label: 'P', value: 'P' },
  { label: 'Hitters', value: 'HITTER' },
  { label: 'MGR', value: 'MGR' },
];

// Categories that count as "hitters" for the Extra Hitter slot
const HITTER_CATEGORIES = new Set(['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'UTIL']);

// Positions to hide from display badges
const HIDDEN_POSITIONS = new Set(['DH']);
function displayPositions(positions: string[]): string[] {
  const filtered = positions.filter((p) => !HIDDEN_POSITIONS.has(p.toUpperCase()));
  return filtered.length ? filtered : positions;
}

// Map raw position abbreviation to display category
function positionCategory(abbr: string): string {
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
  if (upper === 'MGR') return 'MGR';
  return 'UTIL';
}

/** Strip accents/diacritics, collapse dashes/hyphens, and lowercase for search matching. */
const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-\u2010-\u2015]/g, '').toLowerCase();

const MlbProfileLink: React.FC<{ playerId: string; style?: React.CSSProperties }> = ({ playerId, style }) => (
  <a
    href={`https://www.mlb.com/player/${playerId}`}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    style={{ flexShrink: 0, color: '#6b7280', lineHeight: 1, padding: '0 2px', ...style }}
    title="MLB profile"
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6.5v3a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-6A.5.5 0 0 1 2.5 3H5.5" />
      <path d="M7 2h3v3" />
      <path d="M5 7L10 2" />
    </svg>
  </a>
);

interface PendingPick {
  drafterId: string;
  drafterName: string;
  playerName: string;
  player: MlbPlayer | null;
  requestedByName: string;
}

export const MlbDraftBoard: React.FC = () => {
  const {
    user,
    state,
    status,
    isAdmin,
    isConnected,
    error: contextError,
    canRestorePreviousState,
    checkpoints,
    allPlayers,
    allManagers,
    initDraft,
    sendPick,
    editPick,
    resetDraft,
    undoLastPick,
    restorePreviousState,
    saveCheckpoint,
    restoreCheckpoint,
  } = useMlbDraft();

  const [lastError, setLastError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [activeDrafterId, setActiveDrafterId] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ label: string; onConfirm: () => void } | null>(null);
  const [customPlayerName, setCustomPlayerName] = useState('');
  const [editingPick, setEditingPick] = useState<MlbPick | null>(null);
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editRosterSlot, setEditRosterSlot] = useState('');
  const [checkpointName, setCheckpointName] = useState('');
  const [isSavingCheckpoint, setIsSavingCheckpoint] = useState(false);
  const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);

  // Clock timer
  const [clockSeconds, setClockSeconds] = useState(0);
  const clockRef = useRef<number | null>(null);
  const picksScrollRef = useRef<HTMLDivElement | null>(null);

  const currentDrafter = useMemo(() => getCurrentDrafter(state), [state]);
  const currentDrafterName = currentDrafter?.name ?? null;

  const activeDrafter = useMemo(
    () =>
      activeDrafterId
        ? state?.drafters.find((d) => d.id === activeDrafterId) ?? null
        : null,
    [activeDrafterId, state?.drafters]
  );

  const isUserOnClock = useMemo(() => {
    if (!user || !currentDrafter) return false;
    return user.name.toLowerCase() === currentDrafter.name.toLowerCase();
  }, [user, currentDrafter]);

  // Drafted player name set
  const draftedNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of state?.picks || []) {
      set.add(p.playerName.toLowerCase());
    }
    return set;
  }, [state?.picks]);

  // Player name → MLB ID lookup (for profile links on picks/rosters)
  const playerIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPlayers) map.set(p.name.toLowerCase(), p.id);
    for (const m of allManagers) map.set(m.name.toLowerCase(), m.id);
    return map;
  }, [allPlayers, allManagers]);

  // All available players (players + managers combined), excluding drafted
  const availablePool = useMemo(() => {
    const combined: MlbPlayer[] = [...allPlayers, ...allManagers];
    // If there are players from state, use those for draftedById tracking
    if (state?.players) {
      const statePlayerMap = new Map<string, MlbPlayer>();
      for (const p of state.players) {
        statePlayerMap.set(p.name.toLowerCase(), p as MlbPlayer);
      }
      return combined.map((p) => {
        const stateP = statePlayerMap.get(p.name.toLowerCase());
        return stateP ? { ...p, draftedById: stateP.draftedById } : p;
      });
    }
    return combined;
  }, [allPlayers, allManagers, state?.players]);

  // Filtered player pool
  const filteredPool = useMemo(() => {
    let pool = availablePool.filter((p) => !draftedNames.has(p.name.toLowerCase()));

    if (positionFilter) {
      if (positionFilter === 'HITTER') {
        // Show all non-pitcher, non-manager position players
        pool = pool.filter((p) =>
          (p.positionCategories || [p.positionCategory]).some((c) => HITTER_CATEGORIES.has(c))
        );
      } else {
        // Filter by any matching position category
        pool = pool.filter((p) =>
          (p.positionCategories || [p.positionCategory]).includes(positionFilter)
        );
      }
    } else {
      // "All" filter: hide pitchers (they show under the P tab)
      // Check positionCategories since some pitchers have category='batter' from batting leader lists
      pool = pool.filter((p) =>
        (p.positionCategories || [p.positionCategory]).some((c) => c !== 'P' && c !== '')
      );
    }

    if (searchQuery.trim()) {
      const q = normalize(searchQuery.trim());
      pool = pool.filter(
        (p) =>
          normalize(p.name).includes(q) ||
          normalize(p.team).includes(q) ||
          normalize(p.teamAbbr).includes(q)
      );
    }

    return pool;
  }, [availablePool, draftedNames, positionFilter, searchQuery]);

  // Pick counts per drafter
  const pickCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of state?.picks || []) {
      counts.set(p.drafterId, (counts.get(p.drafterId) ?? 0) + 1);
    }
    return counts;
  }, [state?.picks]);

  // Picks grouped by drafter for roster view (keyed by rosterSlot)
  const picksByDrafter = useMemo(() => {
    const map = new Map<string, Map<string, MlbPick>>();
    for (const p of state?.picks || []) {
      if (!map.has(p.drafterId)) map.set(p.drafterId, new Map());
      const slotMap = map.get(p.drafterId)!;
      if (p.rosterSlot) {
        slotMap.set(p.rosterSlot, p);
      }
    }
    return map;
  }, [state?.picks]);

  // Filled roster slots per drafter (set of slot IDs)
  const filledSlotsByDrafter = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const p of state?.picks || []) {
      if (!p.rosterSlot) continue;
      if (!map.has(p.drafterId)) map.set(p.drafterId, new Set());
      map.get(p.drafterId)!.add(p.rosterSlot);
    }
    return map;
  }, [state?.picks]);

  // Reset clock on drafter change
  useEffect(() => {
    setClockSeconds(0);
    if (clockRef.current) clearInterval(clockRef.current);

    if (status === 'in-progress' && currentDrafter) {
      clockRef.current = window.setInterval(() => {
        setClockSeconds((s) => s + 1);
      }, 1000);
    }

    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [currentDrafter?.id, status]);

  // Auto-scroll picks
  useEffect(() => {
    if (picksScrollRef.current) {
      picksScrollRef.current.scrollTop = picksScrollRef.current.scrollHeight;
    }
  }, [state?.picks?.length]);

  // Roster slot confirmation modal lock
  useEffect(() => {
    if (!pendingPick) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [pendingPick]);

  const clockDisplay = useMemo(() => {
    const m = Math.floor(clockSeconds / 60);
    const s = clockSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [clockSeconds]);

  const displayError = lastError || contextError;

  const handleInit = () => {
    if (!isAdmin) {
      setLastError('Only admin can start the draft.');
      setTimeout(() => setLastError(null), 2500);
      return;
    }
    if (!isConnected) {
      setLastError('Channel not connected yet. Wait and try again.');
      setTimeout(() => setLastError(null), 3000);
      return;
    }
    setConfirmAction({
      label: state ? 'Re-initialize the draft? All current picks will be lost.' : 'Start the MLB draft?',
      onConfirm: () => { initDraft(); setConfirmAction(null); },
    });
  };

  const handleReset = () => {
    setConfirmAction({
      label: 'Reset the draft? All picks will be cleared.',
      onConfirm: () => { resetDraft(); setConfirmAction(null); },
    });
  };

  const attemptPick = (player: MlbPlayer): boolean => {
    if (!state) return false;
    if (!currentDrafter) {
      setLastError('The draft has not started yet.');
      setTimeout(() => setLastError(null), 2000);
      return false;
    }

    if (draftedNames.has(player.name.toLowerCase())) {
      setLastError('That player has already been drafted.');
      setTimeout(() => setLastError(null), 2000);
      return false;
    }

    const baseSeat =
      (activeDrafterId && state.drafters.find((d) => d.id === activeDrafterId)) ||
      currentDrafter;

    if (!baseSeat) {
      setLastError('No drafter selected.');
      setTimeout(() => setLastError(null), 2000);
      return false;
    }

    if (baseSeat.id !== currentDrafter.id) {
      setLastError(`It is ${currentDrafter.name}'s turn right now.`);
      setTimeout(() => setLastError(null), 2500);
      return false;
    }

    const userName = (user?.name || '').trim();

    // Open roster slot confirmation dialog
    setPendingPick({
      drafterId: baseSeat.id,
      drafterName: baseSeat.name,
      playerName: player.name,
      player,
      requestedByName: userName,
    });
    return true;
  };

  const handlePlayerClick = (player: MlbPlayer) => {
    attemptPick(player);
  };

  const confirmPick = (rosterSlot: string, isValid: boolean) => {
    if (!pendingPick) return;
    sendPick(pendingPick.drafterId, pendingPick.playerName, rosterSlot, isValid);
    setPendingPick(null);
  };

  const handleSaveCheckpoint = async () => {
    if (!state) return;
    try {
      setIsSavingCheckpoint(true);
      await saveCheckpoint(checkpointName);
      setCheckpointName('');
      setCheckpointMessage('Checkpoint saved.');
      setTimeout(() => setCheckpointMessage(null), 2000);
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : 'Failed to save.');
      setTimeout(() => setCheckpointError(null), 3000);
    } finally {
      setIsSavingCheckpoint(false);
    }
  };

  const handleExportJson = () => {
    if (!state?.picks.length) return;
    const data = state.picks.map((p) => ({
      pick: p.overallNumber,
      round: p.round,
      drafter: p.drafterName,
      player: p.playerName,
      rosterSlot: p.rosterSlot,
      position: p.position,
      positions: p.positions,
      team: p.teamAbbr,
      rosterSlotValid: p.rosterSlotValid,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mlb-draft-picks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreCheckpoint = async (id: string) => {
    try {
      setIsRestoringCheckpoint(true);
      await restoreCheckpoint(id);
      setCheckpointMessage('Checkpoint restored.');
      setTimeout(() => setCheckpointMessage(null), 2000);
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : 'Failed to restore.');
      setTimeout(() => setCheckpointError(null), 3000);
    } finally {
      setIsRestoringCheckpoint(false);
    }
  };

  return (
    <>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <img
          src="/dinger.png"
          alt="Dinger mascot"
          className="dinger-mascot"
        />
      <div style={{
        background: 'rgba(30,15,5,0.8)',
        border: '1px solid rgba(251,146,60,0.25)',
        borderRadius: 10,
        padding: '12px 16px',
        fontSize: 12,
        lineHeight: 1.6,
        color: '#9ca3af',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#e5e7eb', marginBottom: 6 }}>Scoring Rules</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 420 }}>
          <tbody>
            <tr><td style={{ paddingRight: 12 }}>Home Run</td><td style={{ fontWeight: 600, color: '#e5e7eb' }}>1 pt</td></tr>
            <tr><td style={{ paddingRight: 12 }}>Home Run 450+ ft</td><td style={{ fontWeight: 600, color: '#e5e7eb' }}>+1 pt bonus</td></tr>
            <tr><td style={{ paddingRight: 12 }}>Hit By Pitch</td><td style={{ fontWeight: 600, color: '#e5e7eb' }}>0.5 pts</td></tr>
            <tr><td style={{ paddingRight: 12 }}>Manager Ejection</td><td style={{ fontWeight: 600, color: '#e5e7eb' }}>5 pts</td></tr>
            <tr><td style={{ paddingRight: 12 }}>PED Suspension</td><td style={{ fontWeight: 600, color: '#e5e7eb' }}>20 pts</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(251,146,60,0.15)', paddingTop: 8 }}>
          <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 2 }}>Tiebreaker</div>
          <div>Your pitcher is used only as a tiebreaker — most strikeouts wins. Pitchers do not earn points otherwise.</div>
        </div>
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(251,146,60,0.15)', paddingTop: 8 }}>
          <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 2 }}>Add/Drop</div>
          <div>Each team gets 1 free add/drop at any point during the year. Additional add/drops are available if your player suffers a season-ending injury (must be approved by league vote).</div>
        </div>
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(251,146,60,0.15)', paddingTop: 8 }}>
          <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 2 }}>Draft Order</div>
          <div>Draft order is determined by reverse standings from the previous year. New members are added to the bottom.</div>
        </div>
      </div>
      </div>

      {displayError && (
        <div className="mt-8" style={{ color: '#f87171', fontSize: 13, fontWeight: 500, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)' }}>
          {displayError}
        </div>
      )}

      {confirmAction && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="panel" style={{ maxWidth: 400, width: '90%' }}>
            <div className="panel-title" style={{ marginBottom: 12 }}>Are you sure?</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>{confirmAction.label}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-danger" onClick={confirmAction.onConfirm}>Confirm</button>
              <button className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingPick && (() => {
        const pick = editingPick;
        // Look up full player data for the current and replacement player
        const currentPlayer = availablePool.find((p) => p.name.toLowerCase() === pick.playerName.toLowerCase());
        const replacementPlayer = editPlayerName.trim().toLowerCase() !== pick.playerName.toLowerCase()
          ? availablePool.find((p) => p.name.toLowerCase() === editPlayerName.trim().toLowerCase())
          : null;

        // Determine which player's categories to use for slot validity
        const effectivePlayer = replacementPlayer || currentPlayer;
        const effectiveCats = effectivePlayer?.positionCategories || effectivePlayer ? [effectivePlayer?.positionCategory || ''] : [];

        // Filled slots for this drafter, excluding the current pick's slot
        const filled = filledSlotsByDrafter.get(pick.drafterId) || new Set<string>();

        const playerNameChanged = editPlayerName.trim().toLowerCase() !== pick.playerName.toLowerCase();
        const slotChanged = editRosterSlot !== (pick.rosterSlot || '');
        const hasChanges = (playerNameChanged && editPlayerName.trim()) || slotChanged;

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div className="panel" style={{ maxWidth: 480, width: '90%' }}>
              <div className="panel-title" style={{ marginBottom: 12 }}>
                Edit Pick #{pick.overallNumber} — {pick.drafterName}
              </div>

              {/* Player name */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Player</div>
                <input
                  type="text"
                  value={editPlayerName}
                  onChange={(e) => setEditPlayerName(e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="Player name"
                />
              </div>

              {/* Roster slot */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Roster Slot</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ROSTER_SLOTS.map((slot) => {
                    const isCurrent = editRosterSlot === slot.id;
                    const takenByOther = filled.has(slot.id) && slot.id !== pick.rosterSlot;
                    const isValid = effectiveCats.length > 0 && (
                      slot.positionCategory === 'XHIT'
                        ? effectiveCats.some((c: string) => HITTER_CATEGORIES.has(c))
                        : effectiveCats.includes(slot.positionCategory)
                    );
                    return (
                      <button
                        key={slot.id}
                        className={isCurrent ? 'btn-primary' : 'btn-secondary'}
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          opacity: takenByOther ? 0.3 : isValid || isCurrent ? 1 : 0.6,
                        }}
                        disabled={takenByOther}
                        onClick={() => setEditRosterSlot(slot.id)}
                        title={takenByOther ? 'Already filled' : isValid ? 'Valid position' : 'Needs league approval'}
                      >
                        {slot.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-primary"
                  disabled={!hasChanges}
                  onClick={() => {
                    const newName = playerNameChanged ? editPlayerName.trim() : undefined;
                    const newSlot = slotChanged ? editRosterSlot : undefined;

                    // Compute validity for the slot
                    let slotValid: boolean | undefined;
                    if (newSlot !== undefined) {
                      const slotDef = ROSTER_SLOTS.find((s) => s.id === newSlot);
                      if (slotDef && effectiveCats.length > 0) {
                        slotValid = slotDef.positionCategory === 'XHIT'
                          ? effectiveCats.some((c: string) => HITTER_CATEGORIES.has(c))
                          : effectiveCats.includes(slotDef.positionCategory);
                      } else {
                        slotValid = false;
                      }
                    }

                    editPick(pick.id, newName, newSlot, slotValid);
                    setEditingPick(null);
                  }}
                >
                  Save
                </button>
                <button className="btn-secondary" onClick={() => setEditingPick(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingPick && (() => {
        const playerCats = pendingPick.player?.positionCategories || [pendingPick.player?.positionCategory || ''];
        const filled = filledSlotsByDrafter.get(pendingPick.drafterId) || new Set<string>();
        const isProxy = pendingPick.requestedByName.toLowerCase() !== pendingPick.drafterName.toLowerCase();

        const validSlots: typeof ROSTER_SLOTS[number][] = [];
        const invalidSlots: typeof ROSTER_SLOTS[number][] = [];

        for (const slot of ROSTER_SLOTS) {
          if (filled.has(slot.id)) continue; // already filled, skip entirely
          const isValid = slot.positionCategory === 'XHIT'
            ? playerCats.some((c) => HITTER_CATEGORIES.has(c))
            : playerCats.includes(slot.positionCategory);
          if (isValid) validSlots.push(slot);
          else invalidSlots.push(slot);
        }

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div className="panel" style={{ maxWidth: 460, width: '90%' }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>Choose roster slot</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
                {isProxy && (
                  <span>Picking on behalf of <strong style={{ color: '#e5e7eb' }}>{pendingPick.drafterName}</strong> &mdash; </span>
                )}
                Drafting <strong style={{ color: '#e5e7eb' }}>{pendingPick.playerName}</strong>
                {pendingPick.player && (
                  <span style={{ marginLeft: 6 }}>
                    {displayPositions(pendingPick.player.positions || []).map((pos) => (
                      <span key={pos} className="position-badge" data-pos={positionCategory(pos)} style={{ fontSize: 10, padding: '1px 4px', marginLeft: 2 }}>
                        {pos}
                      </span>
                    ))}
                  </span>
                )}
              </div>

              {validSlots.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valid positions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {validSlots.map((slot) => (
                      <button
                        key={slot.id}
                        className="btn-primary"
                        style={{ fontSize: 12, padding: '6px 14px' }}
                        onClick={() => confirmPick(slot.id, true)}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {invalidSlots.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Needs league approval</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {invalidSlots.map((slot) => (
                      <button
                        key={slot.id}
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px', opacity: 0.7 }}
                        onClick={() => confirmPick(slot.id, false)}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {validSlots.length === 0 && invalidSlots.length === 0 && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#f87171' }}>
                  All roster slots are filled for this drafter.
                </div>
              )}

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setPendingPick(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {status === 'in-progress' && currentDrafter && (
        <div className={`onclock-bar${isUserOnClock ? ' onclock-bar--self' : ''}`}>
          <div className="onclock-label">
            <span className="onclock-prefix">On the clock:</span>
            <span className={`onclock-name${isUserOnClock ? ' onclock-name--self' : ''}`}>
              {currentDrafter.name}
            </span>
            <span className="onclock-separator">&bull;</span>
            <span className="onclock-timer">{clockDisplay}</span>
          </div>
          {isUserOnClock && (
            <div className="onclock-self-hint">Make your pick now.</div>
          )}
        </div>
      )}

      <div className="layout">
        {/* LEFT PANEL: Draft Board */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">MLB Draft Board</div>
              <div className="panel-subtitle">
                {state
                  ? `${state.config.totalRounds} rounds (${ROSTER_SLOTS.map((s) => s.id).join(', ')}) \u2022 ${state.drafters.length} drafters`
                  : 'Waiting for admin to start the draft.'}
              </div>
            </div>
            <div className="status-row">
              <div className="status-badge">
                <span className="dot" style={{ background: isConnected ? '#f97316' : '#ef4444' }} />
                {isConnected ? 'Live' : 'Offline'}
              </div>
              {status === 'complete' && <div className="status-badge done">Draft complete</div>}
              {status === 'in-progress' && (
                <div className={`status-badge turn${isUserOnClock ? ' turn-self' : ''}`}>
                  On the clock: <strong style={{ marginLeft: 4 }}>{currentDrafterName}</strong>
                  {isUserOnClock && <span className="turn-self-pill">You</span>}
                </div>
              )}
            </div>
          </div>

          {/* Picks table */}
          <div className="table-scroll table-scroll--picks" ref={picksScrollRef}>
            <div className="grid grid--mlb-picks mt-12">
              <div className="grid-header">
                <div>#</div>
                <div>Rd</div>
                <div>Drafter</div>
                <div>Player</div>
                <div>Slot</div>
                <div>Team</div>
              </div>
              {state?.picks.map((pick) => (
                  <div key={pick.id} className="grid-row">
                    <div>{pick.overallNumber}</div>
                    <div>{pick.round}</div>
                    <div><span className="badge">{pick.drafterName}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="player-name-label">{pick.playerName}</span>
                      {playerIdByName.get(pick.playerName.toLowerCase()) && (
                        <MlbProfileLink playerId={playerIdByName.get(pick.playerName.toLowerCase())!} />
                      )}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>
                      {pick.rosterSlot || '—'}
                      {pick.rosterSlot && !pick.rosterSlotValid && (
                        <span style={{ color: '#f59e0b', marginLeft: 2 }} title="Needs league approval">&#9888;</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
                      {pick.teamAbbr || ''}
                      {isAdmin && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 10, padding: '1px 6px', marginLeft: 'auto' }}
                          onClick={() => {
                            setEditingPick(pick);
                            setEditPlayerName(pick.playerName);
                            setEditRosterSlot(pick.rosterSlot || '');
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
              ))}
              {!state?.picks.length && (
                <div className="grid-row">
                  <div /><div /><div /><div style={{ fontSize: 12, color: '#6b7280', padding: '8px 10px' }}>
                    No picks yet.
                  </div><div /><div />
                </div>
              )}
            </div>
          </div>

          {/* Roster view per drafter */}
          <div className="mt-12">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>Rosters</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {getMlbPreconfiguredDrafters().map((d) => {
                const slotMap = picksByDrafter.get(d.id) || new Map<string, MlbPick>();
                const pickCount = slotMap.size;
                const isMe = user && d.name.toLowerCase() === user.name.toLowerCase();
                const isCurrent = currentDrafter && d.id === currentDrafter.id;

                return (
                  <div
                    key={d.id}
                    style={{
                      background: 'rgba(30,15,5,0.6)',
                      border: `1px solid ${isCurrent ? 'rgba(249,115,22,0.6)' : 'rgba(251,146,60,0.2)'}`,
                      borderRadius: 10,
                      padding: '8px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveDrafterId(d.id)}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: isMe ? '#fdba74' : '#e5e7eb' }}>
                      {d.name} {isMe && '(you)'} {isCurrent && <span style={{ color: '#f97316' }}>&#9679;</span>}
                      <span style={{ float: 'right', color: '#6b7280' }}>{pickCount}/{state?.config.totalRounds || 11}</span>
                    </div>
                    {ROSTER_SLOTS.map((slot) => {
                      const pick = slotMap.get(slot.id);
                      const allPos = pick ? displayPositions(pick.positions?.length ? pick.positions : [pick.position].filter(Boolean)) : [];
                      return (
                        <div key={slot.id} style={{ display: 'flex', gap: 4, padding: '1px 0', color: pick ? '#e5e7eb' : '#4b5563' }}>
                          <span style={{ width: 36, flexShrink: 0, color: '#6b7280', fontWeight: 500, fontSize: 11 }}>{slot.id}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                            {pick ? (
                              <>
                                {pick.playerName}
                                {playerIdByName.get(pick.playerName.toLowerCase()) && (
                                  <MlbProfileLink playerId={playerIdByName.get(pick.playerName.toLowerCase())!} style={{ fontSize: 10 }} />
                                )}
                                {!pick.rosterSlotValid && <span style={{ color: '#f59e0b', fontSize: 10, marginLeft: 2 }} title="Needs league approval">&#9888;</span>}
                                <span style={{ color: '#6b7280', marginLeft: 2 }}>({allPos.join('/')})</span>
                              </>
                            ) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Controls + Player Pool */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">{isAdmin ? 'Admin Controls' : 'Draft Controls'}</div>
              <div className="panel-subtitle">
                {isAdmin
                  ? 'Start/reset the draft and manage picks.'
                  : 'Select a player from the pool to make a pick.'}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div>
              <div className="field-row mt-8">
                <button className="btn-primary" onClick={handleInit}>
                  {state ? 'Re-initialize Draft' : 'Start MLB Draft'}
                </button>
                {state && (
                  <>
                    <button className="btn-secondary" onClick={undoLastPick}>Undo</button>
                    <button className="btn-secondary" onClick={restorePreviousState} disabled={!canRestorePreviousState}>
                      Restore prev
                    </button>
                    <button className="btn-danger" onClick={handleReset}>Reset</button>
                    <button className="btn-secondary" onClick={handleExportJson} disabled={!state.picks.length}>
                      Export JSON
                    </button>
                  </>
                )}
              </div>

              {/* Checkpoints */}
              <div className="mt-8">
                <div className="panel-subtitle" style={{ marginBottom: 6 }}>Checkpoints</div>
                {(checkpointMessage || checkpointError) && (
                  <div style={{ fontSize: 12, marginBottom: 6, color: checkpointError ? '#f87171' : '#4ade80' }}>
                    {checkpointMessage || checkpointError}
                  </div>
                )}
                <div className="field-row">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Checkpoint name"
                      value={checkpointName}
                      onChange={(e) => setCheckpointName(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <button className="btn-secondary" onClick={handleSaveCheckpoint} disabled={!state || isSavingCheckpoint}>
                    {isSavingCheckpoint ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {checkpoints.length > 0 && (
                  <div className="mt-8">
                    {checkpoints.map((cp) => (
                      <div key={cp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(251,146,60,0.1)' }}>
                        <span>{cp.name || 'Untitled'}</span>
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setConfirmAction({ label: `Restore checkpoint "${cp.name || 'Untitled'}"? This will overwrite the current draft state.`, onConfirm: () => { setConfirmAction(null); handleRestoreCheckpoint(cp.id); } })} disabled={isRestoringCheckpoint}>
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Picking info */}
          <div className="mt-12">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>
              Picking for: <strong>{activeDrafter?.name ?? currentDrafterName ?? '—'}</strong>
            </div>
          </div>

          {/* Custom player draft */}
          <div className="mt-8">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>Draft unlisted player</div>
            <div className="field-row">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Enter player name..."
                  value={customPlayerName}
                  onChange={(e) => setCustomPlayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customPlayerName.trim()) {
                      const name = customPlayerName.trim();
                      const fake: MlbPlayer = {
                        id: `custom-${Date.now()}`,
                        name,
                        position: '',
                        positions: [],
                        positionCategory: '',
                        positionCategories: [],
                        team: '',
                        teamAbbr: '',
                        category: 'batter',
                      };
                      if (attemptPick(fake)) setCustomPlayerName('');
                    }
                  }}
                  style={{ width: '100%' }}
                />
              </div>
              <button
                className="btn-secondary"
                disabled={!customPlayerName.trim()}
                onClick={() => {
                  const name = customPlayerName.trim();
                  if (!name) return;
                  const fake: MlbPlayer = {
                    id: `custom-${Date.now()}`,
                    name,
                    position: '',
                    positions: [],
                    positionCategory: '',
                    positionCategories: [],
                    team: '',
                    teamAbbr: '',
                    category: 'batter',
                  };
                  if (attemptPick(fake)) setCustomPlayerName('');
                }}
              >
                Draft
              </button>
            </div>
          </div>

          {/* Player Pool */}
          <div className="mt-8">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>
              Player Pool ({filteredPool.length} available)
            </div>

            {/* Position filter tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {POSITION_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={positionFilter === f.value ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setPositionFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />

            {/* Player list */}
            <div style={{ maxHeight: 500, overflow: 'auto', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 8 }}>
              {filteredPool.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                  No players match your filters.
                </div>
              )}
              {filteredPool.map((player) => {
                const allPos = displayPositions(player.positions?.length ? player.positions : [player.position].filter(Boolean));
                return (
                  <div
                    key={`${player.id}-${player.name}`}
                    onClick={() => handlePlayerClick(player)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderBottom: '1px solid rgba(251,146,60,0.08)',
                      cursor: status === 'in-progress' ? 'pointer' : 'default',
                      fontSize: 13,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (status === 'in-progress') {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.12)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '';
                    }}
                  >
                    <span style={{ display: 'flex', gap: 2, flexShrink: 0, minWidth: 36 }}>
                      {allPos.map((pos) => (
                        <span
                          key={pos}
                          className="position-badge"
                          data-pos={positionCategory(pos)}
                          style={{ fontSize: 10, padding: '1px 3px', borderRadius: 3 }}
                        >
                          {pos}
                        </span>
                      ))}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                    <MlbProfileLink playerId={player.id} />
                    <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>
                      {player.teamAbbr}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
