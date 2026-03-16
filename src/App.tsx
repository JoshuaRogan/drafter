import React, { useEffect, useMemo, useState } from 'react';
import { DraftProvider } from './draft/DraftContext';
import { DraftBoard } from './draft/DraftBoard';
import { UserSetup } from './draft/UserSetup';
import { MlbDraftProvider } from './mlb-draft/MlbDraftContext';
import { MlbDraftBoard } from './mlb-draft/MlbDraftBoard';
import { MlbUserSetup } from './mlb-draft/MlbUserSetup';

type DraftMode = 'celebrity' | 'mlb';

const getDraftMode = (): DraftMode => {
  try {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/mlb') return 'mlb';
  } catch {}
  return 'celebrity';
};

export const App: React.FC = () => {
  const [name, setName] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem('drafterDisplayName');
      return stored || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (name) {
        window.localStorage.setItem('drafterDisplayName', name);
      } else {
        window.localStorage.removeItem('drafterDisplayName');
      }
    } catch {
      // Ignore storage errors (e.g., privacy mode)
    }
  }, [name]);

  const isConfigured = useMemo(() => !!name, [name]);

  const isAdmin = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('admin') === 'true';
    } catch {
      return false;
    }
  }, []);

  const draftMode = useMemo(() => getDraftMode(), []);

  if (draftMode === 'mlb') {
    return (
      <div className="app-shell">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="pill leader" style={{ background: 'rgba(220,38,38,0.16)', color: '#fca5a5' }}>
                <span>MLB Draft Pool</span>
              </div>
              <div className="title">MLB Live Draft Room</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isConfigured && (
                <div className="text-right text-xs">
                  <div>{name}</div>
                  <div style={{ color: '#9ca3af' }}>{isAdmin ? 'Admin view' : 'Viewer'}</div>
                </div>
              )}
              <a
                href="/"
                style={{ fontSize: 11, color: '#6b7280', textDecoration: 'underline' }}
              >
                Celebrity Draft
              </a>
            </div>
          </div>

          <div className="layout">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Who are you tonight?</div>
                </div>
              </div>
              <MlbUserSetup name={name} onNameChange={setName} />
            </div>
          </div>

          <MlbDraftProvider name={name} isAdmin={isAdmin}>
            <MlbDraftBoard />
          </MlbDraftProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="pill leader">
              <span>Celebrity Draft Pool</span>
            </div>
            <div className="title">Live Draft Room</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isConfigured && (
              <div className="text-right text-xs">
                <div>{name}</div>
                <div style={{ color: '#9ca3af' }}>{isAdmin ? 'Admin view' : 'Viewer'}</div>
              </div>
            )}
            <a
              href="/mlb"
              style={{ fontSize: 11, color: '#6b7280', textDecoration: 'underline' }}
            >
              MLB Draft
            </a>
          </div>
        </div>

        <div className="layout">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Who are you tonight?</div>
              </div>
            </div>
            <UserSetup
              name={name}
              onNameChange={setName}
            />
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
