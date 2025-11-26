import React, { useMemo, useState } from 'react';
import type { Role } from '../App';

interface Props {
  name: string;
  role: Role | null;
  onNameChange(name: string): void;
  onRoleChange(role: Role | null): void;
}

export const UserSetup: React.FC<Props> = ({ name, role, onNameChange, onRoleChange }) => {
  const [localName, setLocalName] = useState(name);
  const [localRole, setLocalRole] = useState<Role | null>(role);

  const canApply = useMemo(() => !!localName && !!localRole, [localName, localRole]);

  const apply = () => {
    if (!canApply) return;
    onNameChange(localName.trim());
    onRoleChange(localRole);
  };

  return (
    <div className="field-row">
      <div className="flex-1">
        <label>
          Display name
          <input
            type="text"
            placeholder="e.g. Alex"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      </div>

      <div>
        <label>
          Role
          <select
            value={localRole ?? ''}
            onChange={(e) => setLocalRole(e.target.value === '' ? null : (e.target.value as Role))}
            style={{ marginTop: 4 }}
          >
            <option value="">Choose…</option>
            <option value="leader">Draft leader</option>
            <option value="drafter">Drafter</option>
          </select>
        </label>
      </div>

      <div>
        <button
          className="btn-primary"
          onClick={apply}
          disabled={!canApply}
        >
          Join room
        </button>
      </div>
    </div>
  );
};


