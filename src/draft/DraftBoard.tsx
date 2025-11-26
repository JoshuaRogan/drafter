import React, { useMemo, useState } from 'react';
import { useDraft, getDefaultCelebrityList, getPreconfiguredDrafters } from './DraftContext';
import type { DraftState } from './types';

const getCurrentDrafterName = (state: DraftState | null): string | null => {
  if (!state || !state.drafters.length) return null;
  const perRound = state.drafters.length;
  const indexInRound = state.currentPickIndex % perRound;
  const drafter = state.drafters[indexInRound];
  return drafter?.name ?? null;
};

export const DraftBoard: React.FC = () => {
  const { user, state, status, isLeader, isConnected, error, initDraftAsLeader, sendPick, resetDraft, undoLastPick } =
    useDraft();

  const [roundsInput, setRoundsInput] = useState(3);
  const [customCelebrities, setCustomCelebrities] = useState('');
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const currentDrafterName = useMemo(() => getCurrentDrafterName(state), [state]);

  const availableCelebrities = useMemo(() => {
    if (!state) return getDefaultCelebrityList();
    return state.celebrities.map((c) => c.name);
  }, [state]);

  const draftedNames = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(state.picks.map((p) => p.celebrityName));
  }, [state]);

  const pickCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!state) return counts;
    for (const pick of state.picks) {
      counts.set(pick.drafterId, (counts.get(pick.drafterId) ?? 0) + 1);
    }
    return counts;
  }, [state]);

  const myTurn = useMemo(() => {
    if (!user || !state) return false;
    return currentDrafterName === user.name && status !== 'complete';
  }, [currentDrafterName, status, state, user]);

  const handleInit = () => {
    if (!user || !isLeader) return;
    const totalRounds = Math.max(1, Math.min(20, roundsInput));
    const userCelebs = customCelebrities
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const list = userCelebs.length ? userCelebs : getDefaultCelebrityList();
    initDraftAsLeader({ totalRounds, celebrityList: list });
  };

  const handlePick = (name: string) => {
    if (!myTurn) {
      setLastError('It is not your turn to pick.');
      setTimeout(() => setLastError(null), 2000);
      return;
    }
    if (draftedNames.has(name)) {
      setLastError('That celebrity has already been drafted.');
      setTimeout(() => setLastError(null), 2000);
      return;
    }
    setPendingPick(name);
    sendPick(name);
    setTimeout(() => setPendingPick(null), 500);
  };

  return (
    <div className="mt-16">
      <div className="layout">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Draft board</div>
              <div className="panel-subtitle">
                {state
                  ? `${state.config.totalRounds} rounds • ${state.drafters.length} drafter${
                      state.drafters.length === 1 ? '' : 's'
                    }`
                  : 'Waiting for the leader to start the draft.'}
              </div>
            </div>
            <div className="status-row">
              <div className="status-badge">
                <span
                  className="dot"
                  style={{ background: isConnected ? '#22c55e' : '#ef4444' }}
                />
                {isConnected ? 'Live channel connected' : 'Offline'}
              </div>
              {status === 'complete' && <div className="status-badge done">Draft complete</div>}
              {status === 'in-progress' && (
                <div className="status-badge turn">
                  On the clock: <strong style={{ marginLeft: 4 }}>{currentDrafterName}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="grid mt-12">
            <div className="grid-header">
              <div>#</div>
              <div>Round</div>
              <div>Drafter</div>
              <div>Celebrity</div>
            </div>
            {state?.picks.map((pick) => (
              <div
                key={pick.id}
                className="grid-row"
              >
                <div>{pick.overallNumber}</div>
                <div>Round {pick.round}</div>
                <div>
                  <span className="badge">{pick.drafterName}</span>
                </div>
                <div>{pick.celebrityName}</div>
              </div>
            ))}
            {!state?.picks.length && (
              <div className="grid-row">
                <div />
                <div />
                <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 10px' }}>
                  No picks yet. Once the leader starts and the first drafter selects a celebrity, the board will fill
                  in here.
                </div>
                <div />
              </div>
            )}
          </div>

          <div className="mt-12">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>
              Drafters
            </div>
            <div className="grid">
              <div className="grid-header">
                <div>#</div>
                <div>Drafter</div>
                <div>Career</div>
                <div>Tonight</div>
              </div>
              {(state?.drafters ?? getPreconfiguredDrafters()).map((d) => {
                const isMe = user && d.name.toLowerCase() === user.name.toLowerCase();
                const picksForDrafter = pickCounts.get(d.id) ?? 0;

                return (
                  <div
                    key={d.id}
                    className="grid-row"
                  >
                    <div>{d.order}</div>
                    <div>
                      <span className={`badge ${isMe ? 'me' : ''} ${d.isLeader ? 'leader' : ''}`}>
                        {d.name}
                      </span>
                    </div>
                    <div>
                      <span className="badge pick-count">
                        {d.points} pts • {d.bags} bag{d.bags === 1 ? '' : 's'}
                      </span>
                      {d.trophies > 0 && (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          {d.trophies} × 🏆
                        </span>
                      )}
                      {d.rings > 0 && (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          {d.rings} × 💍
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="badge pick-count">
                        {picksForDrafter} pick{picksForDrafter === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                {isLeader ? 'Leader controls' : myTurn ? 'Make your pick' : 'Available celebrities'}
              </div>
              <div className="panel-subtitle">
                {isLeader
                  ? 'Configure the draft and manage the board. Everyone sees your changes instantly.'
                  : myTurn
                  ? 'Click a celebrity to submit your pick to the leader.'
                  : 'You can see the board and who has been drafted so far.'}
              </div>
            </div>
          </div>

          {isLeader && (
            <div>
              <div className="field-row mt-8">
                <div>
                  <label>
                    Rounds
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={roundsInput}
                      onChange={(e) => setRoundsInput(Number(e.target.value) || 1)}
                      style={{ width: 80, marginTop: 4 }}
                    />
                  </label>
                </div>
                <button
                  className="btn-primary"
                  onClick={handleInit}
                >
                  {state ? 'Re-seed draft' : 'Start draft'}
                </button>
                {state && (
                  <>
                    <button
                      className="btn-secondary"
                      onClick={undoLastPick}
                    >
                      Undo last pick
                    </button>
                    <button
                      className="btn-danger"
                      onClick={resetDraft}
                    >
                      Reset board
                    </button>
                  </>
                )}
              </div>

              <div className="mt-12">
                <label>
                  Celebrity pool (optional, one per line)
                  <textarea
                    placeholder={getDefaultCelebrityList().join('\n')}
                    value={customCelebrities}
                    onChange={(e) => setCustomCelebrities(e.target.value)}
                    style={{
                      marginTop: 4,
                      width: '100%',
                      minHeight: 120,
                      borderRadius: 12,
                      border: '1px solid rgba(148, 163, 184, 0.45)',
                      background: 'rgba(15, 23, 42, 0.9)',
                      color: '#e5e7eb',
                      fontSize: 12,
                      padding: 8,
                      resize: 'vertical'
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="mt-12">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>
              Tap to draft (already-drafted names are dimmed)
            </div>
            <div className="chip-list">
              {availableCelebrities.map((name) => {
                const drafted = draftedNames.has(name);
                const isMine = pendingPick === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`chip ${drafted ? 'drafted' : ''} ${isMine ? 'selected' : ''}`}
                    onClick={() => handlePick(name)}
                    disabled={drafted || status === 'complete'}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-12">
            {lastError && <div className="error-text">{lastError}</div>}
            {error && <div className="error-text">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};


