import { PLAYING_DURATION_MS } from "./types";

// 점수 공식 v2 설정
const TIME_MAX = 30;                  // 시간 점수 최대
const ACCURACY_MAX = 70;              // 정답 점수 최대
const FREE_TIME_MS = 3000;            // 3초까지는 시간 만점 (사람 반응속도 한계)
const ACCURACY_BUCKET_SIZE = 0.05;    // 5% 단위로 구간 나눔
const ACCURACY_BUCKET_PENALTY = 3.5;  // 구간당 감점 (70점 / 20구간 = 3.5점)

/**
 * 점수 공식 v2:
 *   최종 점수 = 시간점수 (0~30) + 정답점수 (0~70) — 독립 합산
 *
 *   시간점수 (30점 만점):
 *     · 0~3초: 30점 (사람 반응속도 한계, 1초컷 방지)
 *     · 3~10초: 선형 감소 (30 → 0)
 *     · 10초 초과 / 미제출: 0
 *
 *   정답점수 (70점 만점):
 *     · 오차율을 5% 단위로 20구간 분할
 *     · 구간당 3.5점씩 감점
 *     · 0~5%: 70점, 5~10%: 66.5점, ..., 95~100%: 3.5점, 100%+: 0점
 */
export function calcScore(
  guess: number | null | undefined,
  actualPrice: number,
  elapsedMs: number
): number {
  if (
    guess == null ||
    !Number.isFinite(guess) ||
    guess <= 0 ||
    elapsedMs < 0 ||
    elapsedMs > PLAYING_DURATION_MS ||
    actualPrice <= 0
  ) {
    return 0;
  }

  // 시간 점수 (40점 만점)
  const overFreeMs = Math.max(0, elapsedMs - FREE_TIME_MS);
  const decayWindow = PLAYING_DURATION_MS - FREE_TIME_MS; // 7000ms
  const timeRatio = Math.max(0, 1 - overFreeMs / decayWindow);
  const timeScore = TIME_MAX * timeRatio;

  // 정답 점수 (60점 만점)
  const errorRatio = Math.abs(guess - actualPrice) / actualPrice;
  const buckets = Math.floor(errorRatio / ACCURACY_BUCKET_SIZE);
  const accuracyScore = Math.max(
    0,
    ACCURACY_MAX - buckets * ACCURACY_BUCKET_PENALTY
  );

  // 합산 후 소수 둘째자리까지
  const total = timeScore + accuracyScore;
  return Math.round(total * 100) / 100;
}

export function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}