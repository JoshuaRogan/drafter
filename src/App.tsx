import React, { useMemo, useState } from 'react';
import { DraftProvider } from './draft/DraftContext';
import { DraftBoard } from './draft/DraftBoard';
import { UserSetup } from './draft/UserSetup';

export const App: React.FC = () => {
  const [name, setName] = useState<string>('');

  const isConfigured = useMemo(() => !!name, [name]);

  const isAdmin = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('admin') === 'true';
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="app-shell">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="pill leader">
              <span>Celebrity Draft Pool</span>
            </div>
            <div className="title">Live Draft Room</div>
            <div className="subtitle">
              Up to 12 drafters, synced in real time. Anyone can draft for anyone; add ?admin=true to one tab for undo
              and reset controls.
            </div>
          </div>
          {isConfigured && (
            <div className="text-right text-xs">
              <div>{name}</div>
              <div style={{ color: '#9ca3af' }}>{isAdmin ? 'Admin view' : 'Viewer'}</div>
            </div>
          )}
        </div>

        <div className="layout">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Connection</div>
                <div className="panel-subtitle">
                  Set a label for yourself. If this URL has <code>?admin=true</code>, you&apos;ll see admin controls for
                  starting, undoing, and resetting the draft.
                </div>
              </div>
            </div>
            <UserSetup
              name={name}
              onNameChange={setName}
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">How this room works</div>
                <div className="panel-subtitle">
                  Everyone loads the same URL. Any screen can draft for any player; one admin screen (with
                  ?admin=true) gets undo/reset.
                </div>
              </div>
            </div>
            <ul className="text-xs" style={{ color: '#9ca3af', paddingLeft: 18, margin: 0 }}>
              <li>All players open this page (Netlify-hosted) in their browser.</li>
              <li>One screen optionally uses <code>?admin=true</code> to get controls to start, undo, and reset.</li>
              <li>
                Anyone can click a celebrity for whoever is on the clock; picks go through the admin screen and are
                broadcast out to everyone over the live channel.
              </li>
              <li>The board is the same for everyone — if one person picks, every screen updates instantly.</li>
            </ul>
          </div>
        </div>

        <DraftProvider
          name={name}
          isAdmin={isAdmin}
        >
          <DraftBoard />
        </DraftProvider>
      </div>
    </div>
  );
};


