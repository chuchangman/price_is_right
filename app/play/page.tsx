"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ref, onValue, set, get, serverTimestamp } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Phase,
  Question,
  RoomState,
  PLAYING_DURATION_MS,
  PRELOAD_DURATION_MS,
  LeaderboardEntry,
  Submission,
} from "@/lib/types";
import { formatPrice, formatScore } from "@/lib/score";
import CountdownRing from "@/components/CountdownRing";
import Leaderboard from "@/components/Leaderboard";

function PlayPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCode = searchParams.get("room") || "";
  const nickname = searchParams.get("nick") || "";

  const [state, setState] = useState<RoomState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [guess, setGuess] = useState("");
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 방/닉네임 없으면 홈으로
  useEffect(() => {
    if (!roomCode || !nickname) {
      router.replace("/");
    }
  }, [roomCode, nickname, router]);

  // 서버 시간 오프셋 구독
  useEffect(() => {
    if (!db) return;
    const offsetRef = ref(db, ".info/serverTimeOffset");
    return onValue(offsetRef, (snap) => {
      setServerOffset(snap.val() || 0);
    });
  }, []);

  // 현재 시간 틱 (100ms)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  // 방 상태 구독
  useEffect(() => {
    if (!db || !roomCode) return;
    const stateRef = ref(db, `rooms/${roomCode}/state`);
    return onValue(stateRef, (snap) => {
      setState(snap.val());
    });
  }, [roomCode]);

  // 문제 목록 구독
  useEffect(() => {
    if (!db || !roomCode) return;
    const qRef = ref(db, `rooms/${roomCode}/questions`);
    return onValue(qRef, (snap) => {
      const val = snap.val();
      if (Array.isArray(val)) setQuestions(val);
    });
  }, [roomCode]);

  const currentQuestion = useMemo(() => {
    if (!state?.currentQuestionId) return null;
    return questions.find((q) => q.id === state.currentQuestionId) || null;
  }, [state?.currentQuestionId, questions]);

  // 내 제출 구독 + 문제 바뀔 때마다 입력값 초기화
  useEffect(() => {
    // 문제가 바뀔 때마다 (또는 없어질 때) 입력값과 제출 상태 초기화
    setGuess("");
    setMySubmission(null);
    setError(null);

    if (!db || !roomCode || !currentQuestion) return;

    const subRef = ref(
      db,
      `rooms/${roomCode}/submissions/${currentQuestion.id}/${nickname}`
    );
    return onValue(subRef, (snap) => {
      setMySubmission(snap.val());
    });
  }, [roomCode, nickname, currentQuestion?.id]);

  // 게임 종료 시 리더보드 로드
  useEffect(() => {
    if (!db || !roomCode || state?.phase !== "ended") return;
    const playersRef = ref(db, `rooms/${roomCode}/players`);
    return onValue(playersRef, (snap) => {
      const val = snap.val() || {};
      const list: Omit<LeaderboardEntry, "rank">[] = Object.entries(val).map(
        ([nick, p]: [string, any]) => ({
          nickname: nick,
          totalScore: p?.totalScore || 0,
        })
      );
      list.sort((a, b) => b.totalScore - a.totalScore);
      // 공동 순위
      let currentRank = 0;
      let lastScore = -Infinity;
      const ranked: LeaderboardEntry[] = list.map((e, i) => {
        if (e.totalScore !== lastScore) {
          currentRank = i + 1;
          lastScore = e.totalScore;
        }
        return { ...e, rank: currentRank };
      });
      setLeaderboard(ranked);
    });
  }, [roomCode, state?.phase]);

  const serverNow = now + serverOffset;

  // 현재 실제 phase (서버 시간 기반 파생)
  const effectivePhase: Phase = useMemo(() => {
    if (!state) return "waiting";
    // preloading 단계에서 playingStartsAt이 지났으면 UI는 playing으로
    if (state.phase === "preloading" && serverNow >= state.playingStartsAt) {
      return "playing";
    }
    return state.phase;
  }, [state, serverNow]);

  const playingElapsedMs = state?.playingStartsAt
    ? Math.max(0, serverNow - state.playingStartsAt)
    : 0;
  const playingRemainingMs = Math.max(0, PLAYING_DURATION_MS - playingElapsedMs);

  const preloadElapsedMs = state?.phaseStartedAt
    ? Math.max(0, serverNow - state.phaseStartedAt)
    : 0;
  const preloadRemainingMs = Math.max(0, PRELOAD_DURATION_MS - preloadElapsedMs);

  const canSubmit =
    effectivePhase === "playing" &&
    !mySubmission &&
    !submitting &&
    playingRemainingMs > 0;

  const handleSubmit = async () => {
    setError(null);
    const guessNum = parseInt(guess.replace(/,/g, ""), 10);
    if (!Number.isFinite(guessNum) || guessNum <= 0 || guessNum > 1_000_000_000) {
      setError("1원 ~ 10억 사이 숫자를 입력해주세요");
      return;
    }
    if (!canSubmit || !currentQuestion || !state) return;

    setSubmitting(true);
    try {
      const elapsedMs = Math.max(0, serverNow - state.playingStartsAt);
      if (elapsedMs > PLAYING_DURATION_MS) {
        setError("시간이 다 됐어요!");
        setSubmitting(false);
        return;
      }

      // 이중 제출 방지
      const subRef = ref(
        db,
        `rooms/${roomCode}/submissions/${currentQuestion.id}/${nickname}`
      );
      const existing = await get(subRef);
      if (existing.exists()) {
        setError("이미 제출했어요");
        setSubmitting(false);
        return;
      }

      await set(subRef, {
        guess: guessNum,
        submittedAt: serverTimestamp(),
        elapsedMs,
        score: 0, // 관리자가 나중에 계산해서 덮어씀
      });
    } catch (e: any) {
      setError("제출 실패: " + (e?.message || String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  // 가격 입력 포맷팅 (콤마)
  const handleGuessChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, "").slice(0, 10);
    if (!digits) {
      setGuess("");
      return;
    }
    const num = parseInt(digits, 10);
    setGuess(num.toLocaleString("ko-KR"));
  };

  // 로딩
  if (!state) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">방에 연결 중...</div>
      </main>
    );
  }

  // 대기
  if (effectivePhase === "waiting") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-6xl mb-6 animate-pulse-ring">⏳</div>
        <h1 className="text-2xl font-bold mb-2">대기 중</h1>
        <p className="text-slate-400 text-center">
          호스트가 게임을 시작할 때까지
          <br />
          잠시 기다려주세요
        </p>
        <div className="mt-8 text-sm text-slate-500">
          방 코드: <span className="font-mono text-slate-300">{roomCode}</span>
          <span className="mx-2">·</span>
          닉네임: <span className="text-slate-300">{nickname}</span>
        </div>
      </main>
    );
  }

  // 프리로드
  if (effectivePhase === "preloading") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-6xl mb-6">🎯</div>
        <h1 className="text-2xl font-bold mb-4">준비하세요!</h1>
        {currentQuestion && (
          <img
            src={currentQuestion.imageUrl}
            alt=""
            className="hidden"
            onError={() => {}}
          />
        )}
        <div className="text-5xl font-black text-brand-400">
          {Math.ceil(preloadRemainingMs / 1000)}
        </div>
      </main>
    );
  }

  // 플레이
  if (effectivePhase === "playing" && currentQuestion) {
    return (
      <main className="min-h-screen flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-lg">
          {/* 카운트다운 */}
          <div className="flex justify-center mb-4">
            <CountdownRing
              remaining={playingRemainingMs}
              total={PLAYING_DURATION_MS}
              size={100}
            />
          </div>

          {/* 상품 이미지 */}
          <div className="bg-white rounded-2xl overflow-hidden mb-4 aspect-square flex items-center justify-center">
            <img
              src={currentQuestion.imageUrl}
              alt={currentQuestion.productName}
              className="w-full h-full object-contain"
            />
          </div>

          {/* 상품명 */}
          <h2 className="text-xl font-bold text-center mb-4">
            {currentQuestion.productName}
          </h2>

          {/* 입력 */}
          {mySubmission ? (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-6 text-center">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-xl font-bold">제출 완료!</div>
              <div className="text-slate-300 mt-2">
                {mySubmission.guess.toLocaleString("ko-KR")}원
              </div>
            </div>
          ) : playingRemainingMs <= 0 ? (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 text-center">
              <div className="text-4xl mb-2">⏰</div>
              <div className="text-xl font-bold">시간 종료</div>
              <div className="text-slate-300 mt-2 text-sm">
                이번 문제는 0점이에요
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/60 backdrop-blur rounded-xl p-4 border border-slate-700">
              <label className="block mb-3">
                <span className="text-sm font-medium text-slate-300 mb-1 block">
                  예상 가격
                </span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={guess}
                    onChange={(e) => handleGuessChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmit && guess) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="숫자만 (최대 10억)"
                    className="w-full px-4 py-3 pr-12 bg-slate-900 rounded-lg border border-slate-600 focus:border-brand-500 focus:outline-none text-white text-xl text-right"
                    autoFocus
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    원
                  </span>
                </div>
              </label>

              {error && (
                <div className="mb-3 px-3 py-2 bg-red-500/20 border border-red-500/40 rounded text-red-200 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || !guess}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition"
              >
                {submitting ? "제출 중..." : "제출하기"}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // 정답 공개
  if (effectivePhase === "revealed" && currentQuestion) {
    const myScore = mySubmission?.score ?? 0;
    const myGuess = mySubmission?.guess;
    return (
      <main className="min-h-screen flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-lg">
          <h2 className="text-2xl font-bold text-center mb-4">
            {currentQuestion.productName}
          </h2>

          <div className="bg-white rounded-2xl overflow-hidden mb-4 aspect-square flex items-center justify-center">
            <img
              src={currentQuestion.imageUrl}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>

          <div className="bg-gradient-to-br from-brand-500/30 to-brand-700/30 border border-brand-500/50 rounded-2xl p-6 text-center mb-4">
            <div className="text-sm text-brand-200 mb-1">정답</div>
            <div className="text-4xl font-black text-white">
              {formatPrice(currentQuestion.actualPrice)}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
            {mySubmission ? (
              <>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400">내 예측</span>
                  <span className="font-bold">
                    {myGuess?.toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                  <span className="text-slate-400">이번 문제 점수</span>
                  <span
                    className={`text-2xl font-black ${
                      myScore > 70
                        ? "text-green-400"
                        : myScore > 30
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}
                  >
                    {formatScore(myScore)}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center text-slate-400">
                이번 문제는 제출하지 못했어요 (0점)
              </div>
            )}
          </div>

          <div className="mt-6 text-center text-slate-500 text-sm">
            다음 문제를 기다려주세요...
          </div>
        </div>
      </main>
    );
  }

  // 게임 종료
  if (effectivePhase === "ended") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-6">
        <Leaderboard
          entries={leaderboard}
          highlightNickname={nickname}
          title="최종 순위"
          maxRows={10}
        />
      </main>
    );
  }

  return null;
}

export default function PlayPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <PlayPageInner />
    </Suspense>
  );
}
