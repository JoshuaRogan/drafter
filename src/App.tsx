import React, { useMemo, useState } from 'react';
import { DraftProvider } from './draft/DraftContext';
import { DraftBoard } from './draft/DraftBoard';
import { UserSetup } from './draft/UserSetup';

export type Role = 'leader' | 'drafter';

export const App: React.FC = () => {
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<Role | null>(null);

  const isConfigured = useMemo(() => !!name && !!role, [name, role]);

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
              Up to 12 drafters, synced in real time. One leader controls the board; everyone sees every pick.
            </div>
          </div>
          {isConfigured && role && (
            <div className="text-right text-xs">
              <div>{name}</div>
              <div style={{ color: '#9ca3af' }}>{role === 'leader' ? 'Draft Leader' : 'Drafter'}</div>
            </div>
          )}
        </div>

        <div className="layout">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Connection & Role</div>
                <div className="panel-subtitle">
                  Join the shared room and choose whether you are the draft leader or a drafter.
                </div>
              </div>
            </div>
            <UserSetup
              name={name}
              role={role}
              onNameChange={setName}
              onRoleChange={setRole}
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">How this room works</div>
                <div className="panel-subtitle">
                  Everyone loads the same URL. The leader controls the board; all changes sync via WebSockets.
                </div>
              </div>
            </div>
            <ul className="text-xs" style={{ color: '#9ca3af', paddingLeft: 18, margin: 0 }}>
              <li>All players open this page (Netlify-hosted) in their browser.</li>
              <li>The draft leader sets rounds and confirms who is drafting.</li>
              <li>
                Drafters click a celebrity when it is their turn. Their pick is sent to the leader, validated, and then
                broadcast out to everyone over the live channel.
              </li>
              <li>The board is the same for everyone — if one person picks, every screen updates instantly.</li>
            </ul>
          </div>
        </div>

        <DraftProvider name={name} role={role}>
          <DraftBoard />
        </DraftProvider>
      </div>
    </div>
  );
};


