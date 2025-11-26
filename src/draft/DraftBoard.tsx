import React, { useMemo, useState } from 'react';
import { useDraft, getDefaultCelebrityList, getPreconfiguredDrafters } from './DraftContext';
import type { Celebrity, DraftState } from './types';

const getCurrentDrafter = (state: DraftState | null) => {
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

interface SelectedPick {
  pickId: string;
  celebrity: Celebrity;
}

interface EditPickModalProps {
  selectedPick: SelectedPick;
  isAdmin: boolean;
  editCelebrityName: string;
  setEditCelebrityName(value: string): void;
  onSave(pickId: string, nextName: string): void;
  onClose(): void;
}

const EditPickModal: React.FC<EditPickModalProps> = ({
  selectedPick,
  isAdmin,
  editCelebrityName,
  setEditCelebrityName,
  onSave,
  onClose
}) => {
  const { pickId, celebrity } = selectedPick;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{celebrity.fullName || celebrity.name}</div>
            <div className="modal-subtitle">{celebrity.name}</div>
          </div>
          <div>
            <span
              className={`status-pill ${
                celebrity.isValidated ? 'status-pill-valid' : 'status-pill-invalid'
              }`}
            >
              {celebrity.isValidated ? 'Validated' : 'No clear match'}
            </span>
          </div>
        </div>

        <div className="modal-body">
          {isAdmin && (
            <div className="modal-row">
              <span className="modal-label">Edit drafted name</span>
              <span className="modal-value">
                <input
                  type="text"
                  className="modal-input"
                  value={editCelebrityName}
                  onChange={(e) => setEditCelebrityName(e.target.value)}
                />
              </span>
            </div>
          )}
          <div className="modal-row">
            <span className="modal-label">Date of birth</span>
            <span className="modal-value">{celebrity.dateOfBirth || 'Not available'}</span>
          </div>
          <div className="modal-row">
            <span className="modal-label">Wikipedia</span>
            <span className="modal-value">
              {celebrity.hasWikipediaPage && celebrity.wikipediaUrl ? (
                <a
                  href={celebrity.wikipediaUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open page
                </a>
              ) : (
                'Not found'
              )}
            </span>
          </div>
          <div className="modal-row">
            <span className="modal-label">Notes</span>
            <span className="modal-value">{celebrity.validationNotes || '—'}</span>
          </div>
        </div>

        <div className="modal-footer">
          {isAdmin && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onSave(pickId, editCelebrityName.trim())}
              style={{ marginRight: 8 }}
            >
              Save changes
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const DraftBoard: React.FC = () => {
  const {
    user,
    state,
    status,
    isAdmin,
    isConnected,
    error,
    initDraft,
    sendPick,
    editPick,
    resetDraft,
    undoLastPick
  } = useDraft();

  const [roundsInput, setRoundsInput] = useState(3);
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeDrafterId, setActiveDrafterId] = useState<string | null>(null);
  const [customCelebrityName, setCustomCelebrityName] = useState('');
  const [selectedPick, setSelectedPick] = useState<SelectedPick | null>(null);
  const [editCelebrityName, setEditCelebrityName] = useState('');

  const currentDrafter = useMemo(() => getCurrentDrafter(state), [state]);
  const currentDrafterName = currentDrafter?.name ?? null;

  const draftedNames = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(state.picks.map((p) => p.celebrityName));
  }, [state]);

  const celebritiesByName = useMemo(() => {
    const map = new Map<string, Celebrity>();
    if (!state) return map;
    for (const celeb of state.celebrities) {
      map.set(celeb.name, celeb);
    }
    return map;
  }, [state]);

  const pickCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!state) return counts;
    for (const pick of state.picks) {
      counts.set(pick.drafterId, (counts.get(pick.drafterId) ?? 0) + 1);
    }
    return counts;
  }, [state]);
  const activeDrafter = useMemo(() => {
    if (!state || !state.drafters.length) return null;
    if (activeDrafterId) {
      return state.drafters.find((d) => d.id === activeDrafterId) ?? null;
    }
    return currentDrafter ?? null;
  }, [state, activeDrafterId, currentDrafter]);

  const handleInit = () => {
    if (!isAdmin) return;
    const totalRounds = Math.max(1, Math.min(20, roundsInput));
    const list = getDefaultCelebrityList();
    initDraft({ totalRounds, celebrityList: list });
  };

  const handlePick = (name: string): boolean => {
    if (!state) return false;
    if (!currentDrafter) {
      setLastError('The draft has not been started yet.');
      setTimeout(() => setLastError(null), 2000);
      return false;
    }

    if (draftedNames.has(name)) {
      setLastError('That celebrity has already been drafted.');
      setTimeout(() => setLastError(null), 2000);
      return false;
    }

    const seat =
      (activeDrafterId && state.drafters.find((d) => d.id === activeDrafterId)) ?? currentDrafter;

    if (!seat) {
      setLastError('No drafter selected.');
      setTimeout(() => setLastError(null), 2000);
      return false;
    }

    if (seat.id !== currentDrafter.id) {
      setLastError(`It is ${currentDrafter.name}'s turn right now.`);
      setTimeout(() => setLastError(null), 2500);
      return false;
    }

    setPendingPick(name);
    sendPick(seat.id, name);
    setTimeout(() => setPendingPick(null), 500);
    return true;
  };

  const handleCustomPick = () => {
    const name = customCelebrityName.trim();
    if (!name) return;
    const ok = handlePick(name);
    if (ok) {
      setCustomCelebrityName('');
    }
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
                  : 'Waiting for someone to start the draft.'}
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
                <div>
                  {(() => {
                    const celeb = celebritiesByName.get(pick.celebrityName);
                    const attempted = !!celeb?.validationAttempted || !!celeb?.isValidated;
                    const isValidated = !!celeb?.isValidated;
                    const isDeceased = !!celeb?.isDeceased;
                    const dob = celeb?.dateOfBirth;
                    const hasWikipedia = !!celeb?.hasWikipediaPage;

                    const titleParts: string[] = [];
                    if (isValidated) {
                      titleParts.push('Validated');
                    }
                    if (dob) {
                      titleParts.push(`DOB: ${dob}`);
                    }
                    if (hasWikipedia && celeb?.wikipediaUrl) {
                      titleParts.push('Wikipedia linked');
                    }
                    if (attempted) {
                      titleParts.push(isDeceased ? 'Reported deceased' : 'Believed alive');
                    }

                    const title = titleParts.join(' • ');

                    const handleOpenDetails = () => {
                      if (!celeb) return;
                      setSelectedPick({ pickId: pick.id, celebrity: celeb });
                      setEditCelebrityName(pick.celebrityName);
                    };

                    return (
                      <>
                        <div className="celebrity-main">
                          <button
                            type="button"
                            onClick={handleOpenDetails}
                            className="celebrity-name-button"
                            title="Click to view validation details"
                          >
                            {pick.celebrityName}
                          </button>
                          {isDeceased && (
                            <span
                              className="deceased-indicator"
                              title="Reported deceased"
                            >
                              ☠
                            </span>
                          )}
                          {attempted && (
                            <span
                              className={`validation-icon ${isValidated ? 'valid' : 'invalid'}`}
                              title={
                                title ||
                                (isValidated
                                  ? 'Validated celebrity'
                                  : 'No clear match found for this name')
                              }
                              role="button"
                              tabIndex={0}
                              onClick={handleOpenDetails}
                            >
                              {isValidated ? '✓' : '✕'}
                            </span>
                          )}
                        </div>
                        {dob && <div className="celebrity-meta">{dob}</div>}
                      </>
                    );
                  })()}
                </div>
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
                <div>Tonight</div>
                <div />
              </div>
              {(state?.drafters ?? getPreconfiguredDrafters()).map((d) => {
                const isMe = user && d.name.toLowerCase() === user.name.toLowerCase();
                const isCurrent = currentDrafter && d.id === currentDrafter.id;
                const isActive = activeDrafter && d.id === activeDrafter.id;
                const picksForDrafter = pickCounts.get(d.id) ?? 0;

                return (
                  <div
                    key={d.id}
                    className="grid-row"
                    onClick={() => setActiveDrafterId(d.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>{d.order}</div>
                    <div>
                      <span
                        className={`badge ${isMe ? 'me' : ''} ${isCurrent ? 'leader' : ''}`}
                        style={
                          isActive
                            ? {
                                boxShadow: '0 0 0 1px rgba(34,197,94,0.8)'
                              }
                            : undefined
                        }
                      >
                        {d.name}
                      </span>
                    </div>
                    <div>
                      <span className="badge pick-count">
                        {picksForDrafter} pick{picksForDrafter === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div />
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
                {isAdmin ? 'Admin controls' : 'Draft controls'}
              </div>
              <div className="panel-subtitle">
                {isAdmin
                  ? 'Start/reset the draft and undo picks. Everyone can draft for any player in turn.'
                  : 'Click a drafter in the list, then tap a celebrity when it is their turn.'}
              </div>
            </div>
          </div>

          {isAdmin && (
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
            </div>
          )}

          <div className="mt-12">
            <div className="panel-subtitle" style={{ marginBottom: 6 }}>
              Picking for:{' '}
              <strong>{activeDrafter?.name ?? currentDrafterName ?? '— (no drafter selected)'}</strong>
            </div>
            <div className="field-row mt-8">
              <div className="flex-1">
                <label>
                  Custom celebrity
                  <input
                    type="text"
                    placeholder="e.g. Margot Robbie"
                    value={customCelebrityName}
                    onChange={(e) => setCustomCelebrityName(e.target.value)}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCustomPick}
                disabled={!customCelebrityName.trim() || status === 'complete'}
              >
                Draft custom
              </button>
            </div>
          </div>

          <div className="mt-12">
            {lastError && <div className="error-text">{lastError}</div>}
            {error && <div className="error-text">{error}</div>}
          </div>
        </div>
      </div>

      {selectedPick && (
        <EditPickModal
          selectedPick={selectedPick}
          isAdmin={isAdmin}
          editCelebrityName={editCelebrityName}
          setEditCelebrityName={setEditCelebrityName}
          onClose={() => setSelectedPick(null)}
          onSave={(pickId, nextName) => {
            if (!nextName) {
              setSelectedPick(null);
              return;
            }
            editPick(pickId, nextName);
            setSelectedPick(null);
          }}
        />
      )}
    </div>
  );
};


