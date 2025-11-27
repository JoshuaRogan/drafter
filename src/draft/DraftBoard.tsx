import React, { useEffect, useMemo, useState } from 'react';
import { useDraft, getDefaultCelebrityList, getPreconfiguredDrafters } from './DraftContext';
import type { Celebrity, DraftState } from './types';
import autoCelebritiesRaw from '../../celebrities.json';

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

interface AutoCelebrity {
  fullName: string;
  age?: number;
  dateOfBirth?: string;
  wikipediaUrl?: string;
  notes?: string;
}

const AUTO_CELEBRITY_POOL: AutoCelebrity[] = (autoCelebritiesRaw as AutoCelebrity[]).filter(
  (c) => !!c && typeof c.fullName === 'string' && c.fullName.trim().length > 0
);

interface ProxyPickRequest {
  drafterId: string;
  drafterName: string;
  celebrityName: string;
  requestedByName: string;
}

interface LastPickDisplay {
  drafterName: string;
  celebrityName: string;
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
            <span className="modal-label">Life status</span>
            <span className="modal-value">
              {celebrity.isDeceased === true
                ? 'Reported deceased'
                : celebrity.validationAttempted
                ? 'Believed alive'
                : 'Unknown'}
            </span>
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

interface ProxyPickConfirmationModalProps {
  request: ProxyPickRequest;
  onConfirm(): void;
  onCancel(): void;
}

const ProxyPickConfirmationModal: React.FC<ProxyPickConfirmationModalProps> = ({
  request,
  onConfirm,
  onCancel
}) => {
  const { drafterName, celebrityName, requestedByName } = request;

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Drafting on behalf of {drafterName}?</div>
            <div className="modal-subtitle">
              Your display name is <strong>{requestedByName || 'Unknown'}</strong>, but it is currently{' '}
              <strong>{drafterName}</strong>
              {"'s"} turn.
            </div>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-row">
            <span className="modal-label">Player to draft</span>
            <span className="modal-value">
              <strong>{celebrityName}</strong>
            </span>
          </div>
          <div className="modal-row">
            <span className="modal-label">Confirmation</span>
            <span className="modal-value">
              Are you sure you want to draft on behalf of <strong>{drafterName}</strong>?
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            style={{ marginRight: 8 }}
          >
            Yes, draft for {drafterName}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const pickAutoCelebrity = (
  draftedNames: Set<string>
): AutoCelebrity | null => {
  const candidates: AutoCelebrity[] = [];

  for (const celeb of AUTO_CELEBRITY_POOL) {
    const name = celeb.fullName.trim();
    if (!name) continue;
    if (draftedNames.has(name)) continue;

    candidates.push(celeb);
  }

  if (!candidates.length) {
    return null;
  }

  // Bias strongly toward older celebrities while keeping some randomness.
  // Weights are based on age^2 (older celebs are much more likely to be picked).
  const weights: number[] = [];
  let totalWeight = 0;

  for (const celeb of candidates) {
    const age = typeof celeb.age === 'number' && Number.isFinite(celeb.age) ? celeb.age : 40;
    const weight = Math.max(1, age * age);
    weights.push(weight);
    totalWeight += weight;
  }

  let r = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i];
    if (r <= 0) {
      return candidates[i];
    }
  }

  return candidates[candidates.length - 1] ?? null;
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
    undoLastPick,
    canRestorePreviousState,
    restorePreviousState,
    checkpoints,
    saveCheckpoint,
    restoreCheckpoint
  } = useDraft();

  const [roundsInput, setRoundsInput] = useState(3);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeDrafterId, setActiveDrafterId] = useState<string | null>(null);
  const [customCelebrityName, setCustomCelebrityName] = useState('');
  const [selectedPick, setSelectedPick] = useState<SelectedPick | null>(null);
  const [editCelebrityName, setEditCelebrityName] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [isSavingCheckpoint, setIsSavingCheckpoint] = useState(false);
  const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
  const [proxyPickRequest, setProxyPickRequest] = useState<ProxyPickRequest | null>(null);
  const [lastPickDisplay, setLastPickDisplay] = useState<LastPickDisplay | null>(null);
  const [isLastPickHighlighting, setIsLastPickHighlighting] = useState(false);

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

  const orderedDrafters = useMemo(() => {
    if (!state) return [];
    return [...state.drafters].sort((a, b) => a.order - b.order);
  }, [state]);

  const picksByRoundAndDrafter = useMemo(() => {
    const map = new Map<string, string>();
    if (!state) return map;
    for (const pick of state.picks) {
      const key = `${pick.round}-${pick.drafterId}`;
      map.set(key, pick.celebrityName);
    }
    return map;
  }, [state]);

  useEffect(() => {
    let intervalId: number | undefined;

    if (status === 'in-progress' && currentDrafter) {
      setSecondsRemaining(5 * 60);

      intervalId = window.setInterval(() => {
        setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      setSecondsRemaining(0);
    }

    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [status, currentDrafter?.id, state?.currentPickIndex]);

  const clockDisplay = useMemo(() => {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [secondsRemaining]);

  useEffect(() => {
    if (!state || !state.picks.length) return;
    const last = state.picks[state.picks.length - 1];
    if (!last) return;

    setLastPickDisplay({
      drafterName: last.drafterName,
      celebrityName: last.celebrityName
    });
    setIsLastPickHighlighting(true);

    const timeoutId = window.setTimeout(() => {
      setIsLastPickHighlighting(false);
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state?.picks.length, state]);

  const handleSaveCheckpoint = async () => {
    if (!state) {
      setCheckpointError('There is no draft board to checkpoint yet.');
      setTimeout(() => setCheckpointError(null), 2500);
      return;
    }

    try {
      setIsSavingCheckpoint(true);
      await saveCheckpoint(checkpointName);
      setCheckpointName('');
      setCheckpointMessage('Checkpoint saved.');
      setTimeout(() => setCheckpointMessage(null), 2000);
    } catch (err) {
      console.error(err);
      setCheckpointError(
        err instanceof Error ? err.message : 'Failed to save checkpoint. Please try again.'
      );
      setTimeout(() => setCheckpointError(null), 3000);
    } finally {
      setIsSavingCheckpoint(false);
    }
  };

  const handleRestoreCheckpoint = async (id: string) => {
    try {
      setIsRestoringCheckpoint(true);
      await restoreCheckpoint(id);
      setCheckpointMessage('Checkpoint restored.');
      setTimeout(() => setCheckpointMessage(null), 2000);
    } catch (err) {
      console.error(err);
      setCheckpointError(
        err instanceof Error ? err.message : 'Failed to restore checkpoint. Please try again.'
      );
      setTimeout(() => setCheckpointError(null), 3000);
    } finally {
      setIsRestoringCheckpoint(false);
    }
  };

  const handleInit = () => {
    if (!isAdmin) {
      setLastError('Only the admin can start or re-seed the draft.');
      setTimeout(() => setLastError(null), 2500);
      return;
    }

    if (!isConnected) {
      setLastError('Live channel is not connected yet. Wait a few seconds, then try again.');
      setTimeout(() => setLastError(null), 3000);
      return;
    }

    const totalRounds = Math.max(1, Math.min(20, roundsInput));
    const list = getDefaultCelebrityList();
    initDraft({ totalRounds, celebrityList: list });
  };

  const attemptPick = (
    name: string,
    options?: {
      seatOverrideId?: string;
      skipProxyCheck?: boolean;
    }
  ): boolean => {
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

    const baseSeat =
      (options?.seatOverrideId &&
        state.drafters.find((d) => d.id === options.seatOverrideId)) ||
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

    if (!options?.skipProxyCheck && !isAdmin) {
      const userName = (user?.name || '').trim();
      const seatName = (baseSeat.name || '').trim();
      if (!userName || !seatName || userName.toLowerCase() !== seatName.toLowerCase()) {
        setProxyPickRequest({
          drafterId: baseSeat.id,
          drafterName: baseSeat.name,
          celebrityName: name,
          requestedByName: userName
        });
        return true;
      }
    }

    sendPick(baseSeat.id, name);
    return true;
  };

  const handlePick = (name: string): boolean => attemptPick(name);

  const handleCustomPick = () => {
    const name = customCelebrityName.trim();
    if (!name) return;
    const ok = handlePick(name);
    if (ok) {
      setCustomCelebrityName('');
    }
  };

  const handleAutoDraft = () => {
    if (!state) return;
    if (!currentDrafter) {
      setLastError('The draft has not been started yet.');
      setTimeout(() => setLastError(null), 2000);
      return;
    }

    const candidate = pickAutoCelebrity(draftedNames);
    if (!candidate) {
      setLastError('No eligible celebrities left in the auto-draft list.');
      setTimeout(() => setLastError(null), 2500);
      return;
    }

    const ok = handlePick(candidate.fullName.trim());
    if (!ok) {
      // handlePick already surfaced a user-facing error.
      return;
    }
  };

  const handleDownloadCsv = () => {
    if (!state) return;

    const header = ['owner', 'pick', 'round', 'dob', 'wikipedia'];
    const rows: string[][] = [header];

    for (const pick of state.picks) {
      const celeb = celebritiesByName.get(pick.celebrityName);
      const dob = celeb?.dateOfBirth ?? '';
      const wikipedia = (celeb?.wikipediaUrl ?? '') || '';

      rows.push([
        pick.drafterName,
        pick.celebrityName,
        String(pick.round),
        dob,
        wikipedia
      ]);
    }

    const csv = rows
      .map((row) =>
        row
          .map((field) => {
            const safe = (field ?? '').replace(/"/g, '""');
            return `"${safe}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'celebrity-draft-results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-16">
      {lastPickDisplay && (
        <div
          className={`draft-notification-banner${
            isLastPickHighlighting ? ' draft-notification-banner--pulse' : ''
          }`}
        >
          <div className="draft-notification-label">Latest pick</div>
          <div className="draft-notification-main">
            <span className="draft-notification-drafter">{lastPickDisplay.drafterName}</span>
            <span style={{ margin: '0 6px' }}>drafted</span>
            <span className="draft-notification-celebrity">{lastPickDisplay.celebrityName}</span>
          </div>
        </div>
      )}
      {status === 'in-progress' && currentDrafter && (
        <div className="onclock-banner">
          <div className="onclock-label">On the clock</div>
          <div className="onclock-main">
            <span className="onclock-name">{currentDrafter.name}</span>
            <span className="onclock-separator">•</span>
            <span className="onclock-timer">{clockDisplay}</span>
          </div>
        </div>
      )}
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

          {state && orderedDrafters.length > 0 && (
            <div className="mt-12">
              <div className="panel-subtitle" style={{ marginBottom: 6 }}>
                Picks by round
              </div>
              <div className="round-grid">
                <div className="round-grid-header">
                  <div>Round</div>
                  {orderedDrafters.map((d) => (
                    <div key={d.id}>{d.name}</div>
                  ))}
                </div>
                {Array.from({ length: state.config.totalRounds }, (_, idx) => {
                  const roundNumber = idx + 1;
                  return (
                    <div
                      key={roundNumber}
                      className="round-grid-row"
                    >
                      <div>Round {roundNumber}</div>
                      {orderedDrafters.map((d) => {
                        const key = `${roundNumber}-${d.id}`;
                        const celebName = picksByRoundAndDrafter.get(key);
                        return (
                          <div key={d.id}>
                            {celebName ? (
                              <span className="round-grid-cell">{celebName}</span>
                            ) : (
                              <span className="round-grid-cell round-grid-cell-empty">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDownloadCsv}
                  disabled={!state.picks.length}
                >
                  Download CSV
                </button>
              </div>
            </div>
          )}

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
                  Start draft
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
                      className="btn-secondary"
                      onClick={restorePreviousState}
                      disabled={!canRestorePreviousState}
                    >
                      Restore previous board
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

              <div className="mt-8">
                <div className="panel-subtitle" style={{ marginBottom: 6 }}>
                  Persistent checkpoints
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                  Saved to the server (max 10). Use this to recover if the draft state ever gets stuck.
                </div>
                <div className="field-row">
                  <div className="flex-1">
                    <label>
                      Checkpoint name
                      <input
                        type="text"
                        placeholder="e.g. After round 3"
                        value={checkpointName}
                        onChange={(e) => setCheckpointName(e.target.value)}
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSaveCheckpoint}
                    disabled={!state || isSavingCheckpoint}
                  >
                    {isSavingCheckpoint ? 'Saving…' : 'Save checkpoint'}
                  </button>
                </div>

                {checkpoints.length > 0 && (
                  <div className="mt-4">
                    <div className="grid">
                      <div className="grid-header">
                        <div>Name</div>
                        <div>Created</div>
                        <div />
                      </div>
                      {checkpoints.map((cp) => (
                        <div
                          key={cp.id}
                          className="grid-row"
                        >
                          <div>{cp.name}</div>
                          <div>{new Date(cp.createdAt).toLocaleString()}</div>
                          <div style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleRestoreCheckpoint(cp.id)}
                              disabled={isRestoringCheckpoint}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
            <div className="field-row mt-8">
              <button
                type="button"
                className="btn-primary"
                onClick={handleAutoDraft}
                disabled={!state || !currentDrafter || status === 'complete'}
              >
                Auto-draft from list
              </button>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Favors older celebrities but keeps some randomness.
              </div>
            </div>
          </div>

          <div className="mt-12">
            {lastError && <div className="error-text">{lastError}</div>}
            {error && <div className="error-text">{error}</div>}
            {checkpointError && <div className="error-text">{checkpointError}</div>}
            {checkpointMessage && !checkpointError && (
              <div style={{ fontSize: 11, color: '#bbf7d0' }}>{checkpointMessage}</div>
            )}
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
      {proxyPickRequest && (
        <ProxyPickConfirmationModal
          request={proxyPickRequest}
          onConfirm={() => {
            if (!proxyPickRequest) return;
            attemptPick(proxyPickRequest.celebrityName, {
              seatOverrideId: proxyPickRequest.drafterId,
              skipProxyCheck: true
            });
            setProxyPickRequest(null);
          }}
          onCancel={() => setProxyPickRequest(null)}
        />
      )}
    </div>
  );
};


