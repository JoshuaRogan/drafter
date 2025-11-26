import type { Role } from '../App';

export type DraftStatus = 'not-started' | 'in-progress' | 'complete';

export interface Drafter {
  id: string;
  name: string;
  order: number;
  isLeader: boolean;
  points: number;
  bags: number;
  rings: number;
  trophies: number;
}

export interface Pick {
  id: string;
  overallNumber: number;
  round: number;
  drafterId: string;
  drafterName: string;
  celebrityName: string;
  createdAt: string;
}

export interface Celebrity {
  id: string;
  name: string;
  draftedById?: string;
}

export interface DraftConfig {
  totalRounds: number;
}

export interface DraftState {
  status: DraftStatus;
  config: DraftConfig;
  drafters: Drafter[];
  picks: Pick[];
  celebrities: Celebrity[];
  currentRound: number;
  currentPickIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalUser {
  id: string;
  name: string;
  role: Role;
}

export type WireMessage =
  | {
      type: 'state:replace';
      payload: DraftState;
    }
  | {
      type: 'state:request';
      payload: { requesterId: string };
    }
  | {
      type: 'action:pick';
      payload: { drafterId: string; drafterName: string; celebrityName: string };
    }
  | {
      type: 'action:reset';
      payload: { requestedById: string; requestedByName: string };
    }
  | {
      type: 'action:undo';
      payload: { requestedById: string; requestedByName: string };
    }
  | {
      type: 'heartbeat';
      payload: { fromId: string; at: string };
    };


