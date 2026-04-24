import { PLAYING_DURATION_MS } from "./types";

/**
 * 점수 공식:
 *   최종 점수 = 100 × 시간점수 × 정확도점수
 *
 *   시간점수 = 0.3 + 0.7 × (1 - elapsedMs / 10000)
 *     - 즉시 제출 (0ms):   1.0
 *     - 10초 직전 (10000): 0.3
 *     - 미제출/시간초과:  0
 *
 *   정확도 = max(0, 1 - |guess - actual| / actual)
 *     - 정답 일치: 1.0
 *     - ±100% 이탈 이상: 0
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

  const timeScore = 0.3 + 0.7 * (1 - elapsedMs / PLAYING_DURATION_MS);
  const errorRatio = Math.abs(guess - actualPrice) / actualPrice;
  const accuracy = Math.max(0, 1 - errorRatio);

  // 소수 둘째자리까지 반올림
  return Math.round(100 * timeScore * accuracy * 100) / 100;
}

export function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}
