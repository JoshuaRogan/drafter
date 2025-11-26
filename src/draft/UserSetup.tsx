import React, { useMemo, useState } from 'react';

interface Props {
  name: string;
  onNameChange(name: string): void;
}

export const UserSetup: React.FC<Props> = ({ name, onNameChange }) => {
  const [localName, setLocalName] = useState(name);

  const canApply = useMemo(() => !!localName, [localName]);

  const apply = () => {
    if (!canApply) return;
    onNameChange(localName.trim());
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


