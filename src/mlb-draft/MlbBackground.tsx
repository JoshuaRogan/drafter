import React from 'react';

/* ── Inline SVG icons ── */

const SyringeSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Barrel */}
    <rect x="18" y="10" width="12" height="36" rx="2" fill="currentColor" opacity="0.9" />
    {/* Plunger handle */}
    <rect x="16" y="4" width="16" height="4" rx="2" fill="currentColor" />
    <rect x="22" y="8" width="4" height="6" fill="currentColor" />
    {/* Needle */}
    <rect x="23" y="46" width="2" height="14" fill="currentColor" />
    <polygon points="24,60 22,64 26,64" fill="currentColor" />
    {/* Fluid lines */}
    <rect x="21" y="22" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
    <rect x="21" y="26" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
    <rect x="21" y="30" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
    <rect x="21" y="34" width="6" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
    {/* Finger grips */}
    <rect x="12" y="10" width="6" height="3" rx="1.5" fill="currentColor" opacity="0.7" />
    <rect x="30" y="10" width="6" height="3" rx="1.5" fill="currentColor" opacity="0.7" />
  </svg>
);

const ZynCanSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Can body (circle) */}
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.3" />
    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
    {/* Inner ring */}
    <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    {/* Z */}
    <path d="M22 22h10l-10 10h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {/* Y */}
    <path d="M36 22l3 5 3-5M39 27v5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {/* N */}
    <path d="M22 36v10l8-10v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {/* Lid tab */}
    <circle cx="42" cy="42" r="4" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2" />
  </svg>
);

const HbpBatterSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Head */}
    <circle cx="28" cy="12" r="6" fill="currentColor" opacity="0.8" />
    {/* Helmet brim */}
    <path d="M22 14h-3a1 1 0 0 1 0-2h3" fill="currentColor" opacity="0.6" />
    {/* Body */}
    <path d="M28 18v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    {/* Arms (recoiling) */}
    <path d="M28 24l-10 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M28 22l8-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* Bat flying away */}
    <rect x="38" y="10" width="16" height="2.5" rx="1" fill="currentColor" opacity="0.7" transform="rotate(-30 38 10)" />
    {/* Legs */}
    <path d="M28 32l-8 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M28 32l6 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* Baseball hitting them */}
    <circle cx="14" cy="26" r="4" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.3" />
    <path d="M12 23c1 2 3 4 4 6M11 26c2 0 4 1 6 0" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
    {/* Impact lines */}
    <path d="M8 24l-3-1M8 28l-3 1M7 26h-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
  </svg>
);

const BaseballSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.15" />
    <path d="M9 5c2 4 2 8 0 12s-2 8 0 12" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
    <path d="M23 5c-2 4-2 8 0 12s2 8 0 12" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
  </svg>
);

type ItemType = 'text' | 'syringe' | 'zyn' | 'hbp' | 'baseball';

interface BgItem {
  type: ItemType;
  text?: string;
  x: number;
  y: number;
  rot: number;
  size: number;
}

const ITEMS: BgItem[] = [
  // Text items
  { type: 'text', text: 'MONSTER DONG', x: 3, y: 6, rot: -12, size: 22 },
  { type: 'text', text: 'HOME RUN', x: 68, y: 3, rot: 8, size: 20 },
  { type: 'text', text: 'TATER', x: 35, y: 12, rot: -5, size: 26 },
  { type: 'text', text: 'DINGER', x: 52, y: 18, rot: -8, size: 22 },
  { type: 'text', text: 'BOMB', x: 78, y: 26, rot: 12, size: 20 },
  { type: 'text', text: 'MONSTER DONG', x: 12, y: 42, rot: 8, size: 20 },
  { type: 'text', text: 'HOME RUN', x: 28, y: 52, rot: 5, size: 19 },
  { type: 'text', text: 'YARD', x: 72, y: 50, rot: -18, size: 22 },
  { type: 'text', text: 'DINGER', x: 85, y: 56, rot: 10, size: 18 },
  { type: 'text', text: 'TATER', x: 18, y: 70, rot: 16, size: 22 },
  { type: 'text', text: 'MONSTER DONG', x: 65, y: 68, rot: -4, size: 18 },
  { type: 'text', text: 'BOMB', x: 45, y: 76, rot: 11, size: 24 },
  { type: 'text', text: 'HOME RUN', x: 2, y: 80, rot: -9, size: 19 },
  { type: 'text', text: 'YARD', x: 25, y: 86, rot: 18, size: 18 },
  { type: 'text', text: 'DINGER', x: 8, y: 93, rot: 5, size: 18 },
  { type: 'text', text: 'TATER', x: 64, y: 90, rot: -12, size: 22 },
  { type: 'text', text: 'MONSTER DONG', x: 38, y: 95, rot: 9, size: 19 },

  // Syringe icons (HGH)
  { type: 'syringe', x: 86, y: 9, rot: 15, size: 44 },
  { type: 'syringe', x: 6, y: 28, rot: -25, size: 40 },
  { type: 'syringe', x: 48, y: 45, rot: -12, size: 48 },
  { type: 'syringe', x: 30, y: 65, rot: -22, size: 42 },
  { type: 'syringe', x: 52, y: 83, rot: -14, size: 44 },
  { type: 'syringe', x: 88, y: 88, rot: 20, size: 38 },

  // Zyn cans
  { type: 'zyn', x: 18, y: 19, rot: 10, size: 42 },
  { type: 'zyn', x: 90, y: 40, rot: -10, size: 46 },
  { type: 'zyn', x: 57, y: 60, rot: -6, size: 50 },
  { type: 'zyn', x: 80, y: 78, rot: 7, size: 42 },
  { type: 'zyn', x: 5, y: 58, rot: 14, size: 38 },

  // HBP batter icons
  { type: 'hbp', x: 42, y: 8, rot: 0, size: 50 },
  { type: 'hbp', x: 42, y: 32, rot: -15, size: 46 },
  { type: 'hbp', x: 75, y: 62, rot: 8, size: 48 },
  { type: 'hbp', x: 12, y: 82, rot: -5, size: 44 },
  { type: 'hbp', x: 88, y: 92, rot: 10, size: 42 },

  // Baseballs
  { type: 'baseball', x: 60, y: 10, rot: 0, size: 24 },
  { type: 'baseball', x: 25, y: 35, rot: 15, size: 22 },
  { type: 'baseball', x: 82, y: 48, rot: -10, size: 26 },
  { type: 'baseball', x: 40, y: 58, rot: 20, size: 20 },
  { type: 'baseball', x: 92, y: 72, rot: -5, size: 24 },
  { type: 'baseball', x: 15, y: 90, rot: 12, size: 22 },
];

const ICON_COLOR = 'rgba(251, 146, 60, 0.18)';
const TEXT_COLOR = 'rgba(251, 146, 60, 0.13)';

export const MlbBackground: React.FC = () => (
  <div
    className="mlb-bg"
    style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
    }}
  >
    {ITEMS.map((item, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${item.x}%`,
          top: `${item.y}%`,
          transform: `rotate(${item.rot}deg)`,
          userSelect: 'none',
        }}
      >
        {item.type === 'text' && (
          <span
            style={{
              fontSize: item.size,
              fontWeight: 900,
              color: TEXT_COLOR,
              whiteSpace: 'nowrap',
              letterSpacing: '0.08em',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {item.text}
          </span>
        )}
        {item.type === 'syringe' && (
          <span style={{ color: ICON_COLOR }}><SyringeSvg size={item.size} /></span>
        )}
        {item.type === 'zyn' && (
          <span style={{ color: ICON_COLOR }}><ZynCanSvg size={item.size} /></span>
        )}
        {item.type === 'hbp' && (
          <span style={{ color: ICON_COLOR }}><HbpBatterSvg size={item.size} /></span>
        )}
        {item.type === 'baseball' && (
          <span style={{ color: ICON_COLOR }}><BaseballSvg size={item.size} /></span>
        )}
      </div>
    ))}
  </div>
);
