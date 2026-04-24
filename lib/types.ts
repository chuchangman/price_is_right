export type Phase = "waiting" | "preloading" | "playing" | "revealed" | "ended";

export type Category =
  | "electronics"
  | "appliance"
  | "beauty"
  | "fashion"
  | "food"
  | "living"
  | "leisure"
  | "etc";

export const CATEGORY_LABELS: Record<Category, string> = {
  electronics: "전자기기",
  appliance: "가전/주방",
  beauty: "뷰티",
  fashion: "패션",
  food: "식품",
  living: "생활용품",
  leisure: "레저",
  etc: "기타",
};

export interface Question {
  id: string;
  productName: string;
  category: Category;
  imageUrl: string;
  actualPrice: number;
}

export interface RoomState {
  phase: Phase;
  currentQuestionId: string | null;
  phaseStartedAt: number;
  playingStartsAt: number; // phaseStartedAt + 3000 when preloading
}

export interface RoomMeta {
  createdAt: number;
  questionsTotal: number;
  currentIndex: number; // 0-based, -1 means not started
}

export interface Player {
  joinedAt: number;
  lastSeenAt: number;
  totalScore: number;
}

export interface Submission {
  guess: number;
  submittedAt: number;
  elapsedMs: number;
  score: number;
}

export interface LeaderboardEntry {
  nickname: string;
  totalScore: number;
  rank: number;
}

export const PLAYING_DURATION_MS = 10000; // 10초
export const PRELOAD_DURATION_MS = 3000; // 3초
