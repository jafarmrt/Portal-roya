import type {
  EntryKind,
  EventPhase,
  EventStatus,
  EventTheme,
  Scoring,
  ScreenState,
  StagePolicy,
  TieRule,
} from '../../../shared/specialEvents';

// What /api/special_events/current answers (server/routes/specialEvents.ts, eventView).

export interface EventPerson {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  department: string;
  position: string;
}

export interface EventInfo {
  id: string;
  title: string;
  theme: EventTheme;
  intro: string;
  status: EventStatus;
  programDate: string;
  programTime: string;
  programPlace: string;
  signupEnd: string;
  showUntil: string;
  testPhase: EventPhase | null;
  phase: EventPhase;
  realPhase: EventPhase;
  activatedAt: string | null;
  organizerIds: string[];
  juryIds: string[];
  juryHeadId: string | null;
  juryPhotos: Record<string, string>;
  /** Only for organizers and jurors. */
  screen: ScreenState | null;
}

export interface EventEntry {
  id: string;
  name: string;
  image: string;
  captainId: string;
  status: 'in' | 'waitlist';
  members: string[];
  waitlistPosition: number | null;
}

export interface EventMatch {
  id: string;
  round: number;
  slot: number;
  third: boolean;
  roundName: string;
  entryA: string | null;
  entryB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  tieA: number | null;
  tieB: number | null;
  winnerId: string | null;
  bye: boolean;
  walkover: boolean;
  live: boolean;
  onStage: boolean;
  day: string;
  time: string;
  place: string;
  resultById: string | null;
  resultAt: string | null;
}

export interface EventCompetition {
  id: string;
  eventId: string;
  title: string;
  icon: string;
  rules: string;
  kind: EntryKind;
  teamMin: number;
  teamMax: number;
  capacity: number;
  scoring: Scoring;
  tieRule: TieRule;
  thirdPlace: boolean;
  stagePolicy: StagePolicy;
  dayPlace: string;
  dayStart: string;
  slotMinutes: number;
  sortOrder: number;
  drawnAt: string | null;
  publishedAt: string | null;
  rounds: number;
  bracketVisible: boolean;
  champion: string | null;
  full: boolean;
  entries: EventEntry[];
  matches: EventMatch[];
}

export interface EventObjection {
  id: string;
  matchId: string;
  byId: string;
  text: string;
  status: 'open' | 'accepted' | 'rejected';
  decidedById: string | null;
  decision: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface EventLogItem {
  id: number;
  matchId: string | null;
  byId: string | null;
  action: string;
  detail: string;
  createdAt: string;
}

export interface EventRoles {
  canManage: boolean;
  isOrganizer: boolean;
  isJuror: boolean;
  decides: boolean;
  referee: boolean;
}

export interface EventView {
  event: EventInfo;
  me: EventRoles;
  competitions: EventCompetition[];
  people: Record<string, EventPerson>;
  objections: EventObjection[];
  warnings: string[];
  log: EventLogItem[];
  serverNow: string;
}

/** The answer of /api/special_events/current: no event, or one with everything on its page. */
export type SpecialEventPayload =
  | { event: null; canManage: boolean; loginRequired?: boolean }
  | (EventView & { canManage: boolean });

export const hasEvent = (p: SpecialEventPayload | null): p is EventView & { canManage: boolean } => Boolean(p?.event);
