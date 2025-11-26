export type DraftStatus = 'not-started' | 'in-progress' | 'complete';

export interface Drafter {
  id: string;
  name: string;
  order: number;
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
  /** Canonical full name returned from validation (may match `name`). */
  fullName?: string;
  /** Date of birth as a human-readable or ISO string, when known. */
  dateOfBirth?: string;
  /** Wikipedia URL if we successfully matched a page. */
  wikipediaUrl?: string | null;
  /** True if a Wikipedia page was found for this celebrity. */
  hasWikipediaPage?: boolean;
  /** Overall validation flag (true if DOB and/or Wikipedia page were found). */
  isValidated?: boolean;
  /** True once we have attempted validation (regardless of outcome). */
  validationAttempted?: boolean;
  /** True if OpenAI indicates this person is deceased. */
  isDeceased?: boolean;
  /** Optional notes from the validation step (e.g., ambiguity). */
  validationNotes?: string | null;
}

export interface CelebrityValidationResult {
  inputName: string;
  fullName: string;
  dateOfBirth: string;
  hasWikipediaPage: boolean;
  wikipediaUrl: string | null;
  isValid: boolean;
  notes: string | null;
  /** True if we successfully used OpenAI for this lookup. */
  usedOpenAI?: boolean;
  /** Error description when OpenAI could not be used or failed. */
  openAIError?: string | null;
  /** True if OpenAI indicates this person is deceased. */
  isDeceased?: boolean;
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
  isAdmin: boolean;
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
      type: 'action:edit-pick';
      payload: { pickId: string; newCelebrityName: string; requestedById: string; requestedByName: string };
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


