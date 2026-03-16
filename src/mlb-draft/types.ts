export type DraftStatus = 'not-started' | 'in-progress' | 'complete';

export interface Drafter {
  id: string;
  name: string;
  order: number;
  password?: string;
}

export interface MlbPlayer {
  id: string;
  name: string;
  position: string;            // primary position abbreviation
  positions: string[];         // all positions played (e.g., ["SS", "2B", "3B"])
  positionCategory: string;    // primary category
  positionCategories: string[]; // all eligible categories
  team: string;
  teamAbbr: string;
  category: 'batter' | 'pitcher' | 'manager';
  draftedById?: string;
}

export interface MlbPick {
  id: string;
  overallNumber: number;
  round: number;
  drafterId: string;
  drafterName: string;
  playerName: string;
  rosterSlot: string;          // which roster slot this pick fills (e.g., 'C', '1B', 'OF1', 'XHIT')
  rosterSlotValid: boolean;    // true if the player naturally qualifies for this slot
  position: string;
  positions: string[];
  positionCategory: string;
  positionCategories: string[];
  team: string;
  teamAbbr: string;
  category: string;
  createdAt: string;
}

export interface DraftConfig {
  totalRounds: number;
}

export interface MlbDraftState {
  status: DraftStatus;
  config: DraftConfig;
  drafters: Drafter[];
  picks: MlbPick[];
  players: MlbPlayer[];
  currentRound: number;
  currentPickIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalUser {
  id: string;
  name: string;
  isAdmin: boolean;
}

export type WireMessage = {
  type: 'state:updated';
  payload: { updatedAt: string };
};

export const ROSTER_SLOTS = [
  { id: 'C', label: 'Catcher', positionCategory: 'C' },
  { id: '1B', label: 'First Base', positionCategory: '1B' },
  { id: '2B', label: 'Second Base', positionCategory: '2B' },
  { id: '3B', label: 'Third Base', positionCategory: '3B' },
  { id: 'SS', label: 'Shortstop', positionCategory: 'SS' },
  { id: 'OF1', label: 'Outfield 1', positionCategory: 'OF' },
  { id: 'OF2', label: 'Outfield 2', positionCategory: 'OF' },
  { id: 'OF3', label: 'Outfield 3', positionCategory: 'OF' },
  { id: 'XHIT', label: 'Extra Hitter', positionCategory: 'XHIT' },
  { id: 'MGR', label: 'Manager', positionCategory: 'MGR' },
  { id: 'P', label: 'Pitcher (Tiebreaker)', positionCategory: 'P' },
] as const;

export const TOTAL_ROUNDS = ROSTER_SLOTS.length; // 11

export interface MlbPlayersData {
  season: number;
  generatedAt: string;
  players: Array<{
    id: number;
    name: string;
    position: string;
    positions: string[];
    positionCategory: string;
    positionCategories: string[];
    team: string;
    teamAbbr: string;
    category: string;
  }>;
  managers: Array<{
    id: number;
    name: string;
    team: string;
    teamAbbr: string;
  }>;
}
