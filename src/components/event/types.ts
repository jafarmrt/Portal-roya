import type {
  AwardStage,
  EntryKind,
  EventPhase,
  EventStatus,
  EventTheme,
  Format,
  IdeaKind,
  RankBy,
  ScheduleItem,
  Scoring,
  ScreenState,
  WishStatus,
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
  /** «چند دانه؟»: empty when the event has no such game. */
  guessQuestion: string;
  /** «برنامهٔ امشب», in time order. */
  schedule: ScheduleItem[];
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
  /** A result is in (a draw of a points table has no winner; a ranking's value is scoreA). */
  done: boolean;
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
  format: Format;
  rankBy: RankBy;
  /** The pantomime's words: only for organizers and jurors. */
  words: string[];
  wordsUsed: number;
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
  /** First place of a finished table or ranking is shared: the jury picks among these. */
  championTie: string[];
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

export interface AwardNominee {
  id: string;
  /** For organizers and jurors only. */
  source?: 'auto' | 'jury';
  note?: string;
  withdrawn?: boolean;
  removed?: boolean;
  removedReason?: string;
  /** The nominators' lines, without names (for those who vote). */
  reasons: { id: string; text: string; hidden: boolean }[];
}

export interface EventAward {
  id: string;
  title: string;
  icon: string;
  description: string;
  sortOrder: number;
  stage: AwardStage;
  myNomination: { nomineeId: string; reason: string } | null;
  nominees: AwardNominee[];
  myVote: string | null;
  votedCount: number | null;
  tie: string[];
  decided: boolean;
  noWinner: boolean;
  winnerId: string | null;
}

export interface AwardsInfo {
  shortlistAt: string;
  publishAt: string;
  voteDeadline: string;
  shortlistedAt: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  optedOut: boolean;
  voters: number;
  canStepDown: boolean;
  votes: boolean;
  onShortlist: string[];
}

export interface EventSong {
  id: string;
  title: string;
  artist: string;
  note: string;
  /** null when sent without a name. */
  byId: string | null;
  mine: boolean;
  anonymous: boolean;
  hidden: boolean;
  playedAt: string | null;
  votes: number;
  myVote: boolean;
  createdAt: string;
}

export interface EventIdea {
  id: string;
  kind: IdeaKind;
  text: string;
  byId: string | null;
  mine: boolean;
  anonymous: boolean;
  hidden: boolean;
  doing: boolean;
  reply: string;
  likes: number;
  myLike: boolean;
  createdAt: string;
}

export interface EventView {
  event: EventInfo;
  me: EventRoles;
  competitions: EventCompetition[];
  people: Record<string, EventPerson>;
  objections: EventObjection[];
  warnings: string[];
  log: EventLogItem[];
  awards: EventAward[];
  awardsInfo: AwardsInfo;
  songs: EventSong[];
  ideas: EventIdea[];
  predictions: EventPredictions;
  guess: EventGuess | null;
  /** «فال حافظ»: this viewer's verse (an index in HAFEZ_FAL), once drawn. */
  fal: { mine: number | null; count: number; open: boolean };
  quiz: EventQuiz;
  wishes: EventWishes;
  wheel: EventWheel;
  serverNow: string;
}

/** «پیش‌بینی برنده» of one match, as this viewer sees it. */
export interface MatchPrediction {
  open: boolean;
  closesAt: string | null;
  /** Open, and this viewer is neither playing it nor a juror. */
  canPick: boolean;
  /** An entry id, or «draw» in a points table. */
  mine: string | null;
  /** How everyone picked: shown once one has picked, or once picking is over. */
  counts: { a: number; b: number; draw: number; total: number } | null;
}

export interface PredictionLeader {
  employeeId: string;
  correct: number;
  total: number;
  rank: number;
}

export interface EventPredictions {
  matches: Record<string, MatchPrediction>;
  leaders: PredictionLeader[];
  me: { correct: number; total: number; waiting: number } | null;
}

/** «چند دانه؟»: one number everyone guesses before the program, opened on stage. */
export interface EventGuess {
  question: string;
  open: boolean;
  closesAt: string;
  canGuess: boolean;
  count: number;
  mine: number | null;
  revealed: boolean;
  answer: number | null;
  winners: { employeeId: string; value: number; diff: number }[];
  myRank: number | null;
}

/** The answer of /api/special_events/current: no event, or one with everything on its page. */
export type SpecialEventPayload =
  | { event: null; canManage: boolean; loginRequired?: boolean }
  | (EventView & { canManage: boolean });

export const hasEvent = (p: SpecialEventPayload | null): p is EventView & { canManage: boolean } => Boolean(p?.event);

/** «مسابقهٔ همه‌با‌هم» as this viewer sees it. */
export interface EventQuiz {
  count: number;
  asked: number;
  /** Only for organizers. */
  questions: { id: string; text: string; options: string[]; correct: number; seconds: number; asked: boolean }[];
  current: {
    id: string;
    index: number;
    text: string;
    options: string[];
    seconds: number;
    openedAt: string;
    closesAt: string;
    open: boolean;
    revealed: boolean;
    /** Once revealed (organizers always). */
    correct: number | null;
    answered: number;
    counts: number[] | null;
    myChoice: number | null;
    myPoints: number | null;
  } | null;
  leaders: { employeeId: string; points: number; correct: number; rank: number }[];
  me: { points: number; correct: number; rank: number } | null;
  canPlay: boolean;
  /** The program has started (or its rehearsal): questions can be opened. */
  live: boolean;
}

/** «آرزوهای یلدا»: the wall everyone sees, this viewer's own wishes and (for organizers) those waiting. */
export interface EventWishes {
  wall: { id: string; text: string; byId: string | null; at: string }[];
  mine: { id: string; text: string; anonymous: boolean; status: WishStatus }[];
  /** Only for organizers: wishes not on the wall yet (or kept off it), with who wrote them. */
  waiting: { id: string; text: string; byId: string; anonymous: boolean; status: WishStatus }[];
  open: boolean;
  canWrite: boolean;
}

/** «گردونهٔ شانس»: the turns so far (the last is the one on the big screen). */
export interface EventWheel {
  spins: { id: string; winnerId: string; prize: string; absent: boolean; reel: string[]; at: string }[];
  left: number;
  /** This viewer took part in something, so their name is in it. */
  inIt: boolean;
  /** This viewer runs the event (organizers are not in the wheel). */
  organizer: boolean;
  live: boolean;
}
