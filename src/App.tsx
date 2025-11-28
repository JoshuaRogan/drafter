import React, { useEffect, useMemo, useState } from 'react';
import { DraftProvider } from './draft/DraftContext';
import { DraftBoard } from './draft/DraftBoard';
import { UserSetup } from './draft/UserSetup';

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
                <div className="panel-title">Display Name</div>
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


