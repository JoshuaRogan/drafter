import React, { useEffect, useMemo, useState } from 'react';
import { getPreconfiguredDrafters } from './DraftContext';

interface Props {
  name: string;
  onNameChange(name: string): void;
}

export const UserSetup: React.FC<Props> = ({ name, onNameChange }) => {
  const drafters = useMemo(() => getPreconfiguredDrafters(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    const lower = name.trim().toLowerCase();
    const match = drafters.find((d) => d.name.trim().toLowerCase() === lower);
    if (match) {
      setSelectedId(match.id);
    }
  }, [name, drafters]);

  const handleSelect = (id: string, displayName: string) => {
    setSelectedId(id);
    onNameChange(displayName);
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
        Choose which drafter you are. This controls whose custom auto-draft list you can edit.
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8
        }}
      >
        {drafters.map((d) => {
          const isSelected = selectedId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              className={isSelected ? 'btn-primary' : 'btn-secondary'}
              onClick={() => handleSelect(d.id, d.name)}
            >
              {d.name}
              {isSelected && <span style={{ fontSize: 11 }}>(you)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};


