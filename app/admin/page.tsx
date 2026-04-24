"use client";

import { useEffect, useMemo, useState } from "react";
import { ref, onValue, set, get, update, remove } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Category,
  CATEGORY_LABELS,
  Question,
  RoomState,
  RoomMeta,
  Player,
  Submission,
  PLAYING_DURATION_MS,
  PRELOAD_DURATION_MS,
  LeaderboardEntry,
} from "@/lib/types";
import { calcScore, formatPrice, formatScore } from "@/lib/score";
import { generateRoomCode, validateRoomCode } from "@/lib/roomCode";
import questionPool from "@/data/questionPool.json";
import Leaderboard from "@/components/Leaderboard";

const CATEGORIES: Category[] = [
  "electronics",
  "appliance",
  "beauty",
  "fashion",
  "food",
  "living",
  "leisure",
  "etc",
];

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // 인증 복구
  useEffect(() => {
    if (localStorage.getItem("pir:admin") === "ok") setAuthed(true);
  }, []);

  const handleLogin = () => {
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    if (!expected) {
      setAuthError("환경변수 NEXT_PUBLIC_ADMIN_PASSWORD가 설정되지 않았어요");
      return;
    }
    if (passwordInput === expected) {
      localStorage.setItem("pir:admin", "ok");
      setAuthed(true);
    } else {
      setAuthError("암호가 틀렸어요");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("pir:admin");
    setAuthed(false);
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-black text-center mb-6">🔐 관리자 로그인</h1>
          <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="관리자 암호"
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-600 focus:border-brand-500 focus:outline-none text-white mb-4"
              autoFocus
            />
            {authError && (
              <div className="mb-3 px-3 py-2 bg-red-500/20 border border-red-500/40 rounded text-red-200 text-sm">
                {authError}
              </div>
            )}
            <button
              onClick={handleLogin}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 rounded-lg font-bold"
            >
              로그인
            </button>
          </div>
        </div>
      </main>
    );
  }

  return <AdminDashboard onLogout={handleLogout} />;
}

interface DashboardProps {
  onLogout: () => void;
}

function AdminDashboard({ onLogout }: DashboardProps) {
  const [roomCode, setRoomCode] = useState<string | null>(null);

  // 이전 세션 복구
  useEffect(() => {
    const saved = localStorage.getItem("pir:admin:room");
    if (saved && validateRoomCode(saved)) setRoomCode(saved);
  }, []);

  if (!roomCode) {
    return <RoomCreator onCreated={(code) => {
      localStorage.setItem("pir:admin:room", code);
      setRoomCode(code);
    }} onLogout={onLogout} />;
  }

  return (
    <GameControl
      roomCode={roomCode}
      onExit={() => {
        localStorage.removeItem("pir:admin:room");
        setRoomCode(null);
      }}
      onLogout={onLogout}
    />
  );
}

// ============ 방 생성 화면 ============
interface RoomCreatorProps {
  onCreated: (code: string) => void;
  onLogout: () => void;
}

function RoomCreator({ onCreated, onLogout }: RoomCreatorProps) {
  const allQuestions = questionPool as Question[];
  // TODO 문제 제외 (actualPrice가 0인 건 빈 템플릿)
  const validPool = allQuestions.filter((q) => q.actualPrice > 0 && q.productName !== "TODO");

  const [questionCount, setQuestionCount] = useState(10);
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(
    new Set(CATEGORIES)
  );
  const [rejoinCode, setRejoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<Category, number>;
    for (const c of CATEGORIES) counts[c] = 0;
    for (const q of validPool) counts[q.category] = (counts[q.category] || 0) + 1;
    return counts;
  }, [validPool]);

  const availableCount = useMemo(
    () => validPool.filter((q) => selectedCategories.has(q.category)).length,
    [validPool, selectedCategories]
  );

  const toggleCategory = (c: Category) => {
    const next = new Set(selectedCategories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setSelectedCategories(next);
  };

  const selectAll = () => setSelectedCategories(new Set(CATEGORIES));
  const selectNone = () => setSelectedCategories(new Set());

  const handleCreate = async () => {
    setError(null);
    if (questionCount < 1) {
      setError("문제 수는 1개 이상이어야 해요");
      return;
    }
    if (selectedCategories.size === 0) {
      setError("카테고리를 하나 이상 선택해주세요");
      return;
    }
    const pool = validPool.filter((q) => selectedCategories.has(q.category));
    if (pool.length < questionCount) {
      setError(`선택한 카테고리에 문제가 ${pool.length}개뿐이에요`);
      return;
    }

    setLoading(true);
    try {
      // Fisher-Yates 셔플 후 N개 선택
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, questionCount);

      // 방 코드 생성 (중복 체크)
      let code = "";
      for (let i = 0; i < 10; i++) {
        code = generateRoomCode();
        const existing = await get(ref(db, `rooms/${code}/meta`));
        if (!existing.exists()) break;
      }
      if (!code) {
        setError("방 코드 생성 실패");
        setLoading(false);
        return;
      }

      await set(ref(db, `rooms/${code}`), {
        meta: {
          createdAt: Date.now(),
          questionsTotal: questionCount,
          currentIndex: -1,
        } as RoomMeta,
        state: {
          phase: "waiting",
          currentQuestionId: null,
          phaseStartedAt: 0,
          playingStartsAt: 0,
        } as RoomState,
        questions: selected,
      });

      onCreated(code);
    } catch (e: any) {
      setError("방 생성 실패: " + (e?.message || String(e)));
      setLoading(false);
    }
  };

  const handleRejoin = () => {
    setError(null);
    const code = rejoinCode.trim().toUpperCase();
    if (!validateRoomCode(code)) {
      setError("올바른 6자리 방 코드를 입력해주세요");
      return;
    }
    onCreated(code);
  };

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black">🎮 방 생성</h1>
          <button
            onClick={onLogout}
            className="text-sm text-slate-400 hover:text-white underline"
          >
            로그아웃
          </button>
        </div>

        {validPool.length === 0 && (
          <div className="mb-6 px-4 py-3 bg-yellow-500/20 border border-yellow-500/40 rounded-lg text-yellow-200 text-sm">
            ⚠️ questionPool.json에 유효한 문제가 없어요. 상품명과 가격을 입력해주세요.
          </div>
        )}

        <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700 mb-6">
          <h2 className="font-bold mb-4">문제 수</h2>
          <input
            type="number"
            min={1}
            max={validPool.length}
            value={questionCount}
            onChange={(e) => setQuestionCount(parseInt(e.target.value, 10) || 1)}
            className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-600 focus:border-brand-500 focus:outline-none text-white text-xl"
          />
          <p className="text-xs text-slate-400 mt-2">
            사용 가능한 문제: {availableCount}개 (전체 풀: {validPool.length}개)
          </p>
        </div>

        <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold">카테고리</h2>
            <div className="flex gap-2 text-sm">
              <button onClick={selectAll} className="text-brand-400 hover:underline">
                전체
              </button>
              <span className="text-slate-600">·</span>
              <button onClick={selectNone} className="text-slate-400 hover:underline">
                해제
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <label
                key={c}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition ${
                  selectedCategories.has(c)
                    ? "bg-brand-500/20 border border-brand-500/50"
                    : "bg-slate-900 border border-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.has(c)}
                  onChange={() => toggleCategory(c)}
                  className="w-4 h-4 accent-brand-500"
                />
                <span className="flex-1">{CATEGORY_LABELS[c]}</span>
                <span className="text-xs text-slate-400">
                  ({categoryCounts[c] || 0})
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={loading || validPool.length === 0}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition"
        >
          {loading ? "생성 중..." : "🎬 방 만들고 시작하기"}
        </button>

        <div className="mt-10 border-t border-slate-700 pt-6">
          <h3 className="text-sm text-slate-400 mb-3">기존 방으로 돌아가기</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={rejoinCode}
              onChange={(e) => setRejoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 px-4 py-3 bg-slate-900 rounded-lg border border-slate-600 focus:border-brand-500 focus:outline-none text-white tracking-widest text-center uppercase"
            />
            <button
              onClick={handleRejoin}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition"
            >
              입장
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// ============ 게임 진행 화면 ============
interface GameControlProps {
  roomCode: string;
  onExit: () => void;
  onLogout: () => void;
}

function GameControl({ roomCode, onExit, onLogout }: GameControlProps) {
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버 시간 동기화
  useEffect(() => {
    if (!db) return;
    return onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
      setServerOffset(snap.val() || 0);
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // 방 데이터 구독
  useEffect(() => {
    if (!db) return;
    const unsubMeta = onValue(ref(db, `rooms/${roomCode}/meta`), (snap) => {
      setMeta(snap.val());
    });
    const unsubState = onValue(ref(db, `rooms/${roomCode}/state`), (snap) => {
      setState(snap.val());
    });
    const unsubQ = onValue(ref(db, `rooms/${roomCode}/questions`), (snap) => {
      const v = snap.val();
      if (Array.isArray(v)) setQuestions(v);
    });
    const unsubP = onValue(ref(db, `rooms/${roomCode}/players`), (snap) => {
      setPlayers(snap.val() || {});
    });
    return () => {
      unsubMeta();
      unsubState();
      unsubQ();
      unsubP();
    };
  }, [roomCode]);

  // 현재 문제의 제출 구독
  useEffect(() => {
    if (!db || !state?.currentQuestionId) {
      setSubmissions({});
      return;
    }
    return onValue(
      ref(db, `rooms/${roomCode}/submissions/${state.currentQuestionId}`),
      (snap) => {
        setSubmissions(snap.val() || {});
      }
    );
  }, [roomCode, state?.currentQuestionId]);

  const serverNow = now + serverOffset;

  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === state?.currentQuestionId) || null,
    [questions, state?.currentQuestionId]
  );

  // 새로고침 복구: preloading 상태로 DB에 저장된 문제가 있으면 남은 시간 계산해서 자동 공개 타이머 재세팅
  useEffect(() => {
    if (!state || !currentQuestion) return;
    if (state.phase !== "preloading") return;
    if (!state.playingStartsAt) return;

    const revealAt = state.playingStartsAt + PLAYING_DURATION_MS;
    const nowServer = Date.now() + serverOffset;
    const remainingMs = revealAt - nowServer;

    if (remainingMs <= 0) {
      // 이미 시간 다 지남 → 즉시 공개
      autoRevealAnswer(currentQuestion);
      return;
    }

    const timerId = setTimeout(() => {
      autoRevealAnswer(currentQuestion);
    }, remainingMs);

    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, state?.phase, state?.playingStartsAt, serverOffset]);

  // 내부 phase 계산 (playing 여부)
  const isPlayingPhase =
    state?.phase === "preloading" && serverNow >= (state?.playingStartsAt || 0);
  const playingElapsedMs = state?.playingStartsAt
    ? Math.max(0, serverNow - state.playingStartsAt)
    : 0;
  const playingRemainingMs = Math.max(0, PLAYING_DURATION_MS - playingElapsedMs);
  const playingFinished = isPlayingPhase && playingRemainingMs <= 0;

  const playerCount = Object.keys(players).length;
  const submissionCount = Object.keys(submissions).length;

  // ============ 액션 ============
  const startNextQuestion = async () => {
    setError(null);
    if (!meta || !state) return;
    const nextIndex = meta.currentIndex + 1;
    if (nextIndex >= questions.length) {
      setError("더 이상 문제가 없어요");
      return;
    }
    const nextQ = questions[nextIndex];
    setBusy(true);
    try {
      // 서버 시간 기준 now 확보용 — serverTimestamp placeholder 사용
      // playingStartsAt = 현재 서버시각 + 3000ms
      // 일단 phaseStartedAt을 serverTimestamp로 쓰고, 클라이언트가 보정값으로 3초 계산
      const nowServer = serverNow;
      await update(ref(db, `rooms/${roomCode}`), {
        "meta/currentIndex": nextIndex,
        "state/phase": "preloading",
        "state/currentQuestionId": nextQ.id,
        "state/phaseStartedAt": nowServer,
        "state/playingStartsAt": nowServer + PRELOAD_DURATION_MS,
      });
      // 자동 결과 공개는 위의 useEffect가 state 변경 감지해서 처리함
    } catch (e: any) {
      setError("문제 시작 실패: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  // 자동 결과 공개 (타이머용) — DB에서 최신 상태 직접 읽어서 중복 방지
  const autoRevealAnswer = async (question: Question) => {
    try {
      // 최신 state 확인 — 이미 revealed이면 스킵
      const stateSnap = await get(ref(db, `rooms/${roomCode}/state`));
      const freshState: RoomState | null = stateSnap.val();
      if (!freshState) return;
      if (freshState.phase === "revealed" || freshState.phase === "ended") return;
      if (freshState.currentQuestionId !== question.id) return;

      // 제출/플레이어 데이터 최신으로 가져오기
      const subsSnap = await get(
        ref(db, `rooms/${roomCode}/submissions/${question.id}`)
      );
      const subs: Record<string, Submission> = subsSnap.val() || {};

      const playersSnap = await get(ref(db, `rooms/${roomCode}/players`));
      const freshPlayers: Record<string, Player> = playersSnap.val() || {};

      // 점수 계산
      const updates: Record<string, any> = {};
      for (const [nick, sub] of Object.entries(subs)) {
        const score = calcScore(sub.guess, question.actualPrice, sub.elapsedMs);
        updates[`submissions/${question.id}/${nick}/score`] = score;
      }
      for (const nick of Object.keys(freshPlayers)) {
        const sub = subs[nick];
        const thisScore = sub
          ? calcScore(sub.guess, question.actualPrice, sub.elapsedMs)
          : 0;
        const prevTotal = freshPlayers[nick]?.totalScore || 0;
        updates[`players/${nick}/totalScore`] = prevTotal + thisScore;
      }
      updates["state/phase"] = "revealed";
      updates["state/phaseStartedAt"] = Date.now() + serverOffset;

      await update(ref(db, `rooms/${roomCode}`), updates);
    } catch (e: any) {
      console.error("자동 결과 공개 실패:", e);
    }
  };

  const revealAnswer = async () => {
    setError(null);
    if (!state || !currentQuestion) return;
    if (state.phase === "revealed" || state.phase === "ended") return; // 중복 방지
    setBusy(true);
    try {
      // 모든 제출 다시 가져와서 점수 계산
      const snap = await get(
        ref(db, `rooms/${roomCode}/submissions/${currentQuestion.id}`)
      );
      const subs: Record<string, Submission> = snap.val() || {};

      // 점수 계산 및 저장
      const updates: Record<string, any> = {};
      for (const [nick, sub] of Object.entries(subs)) {
        const score = calcScore(sub.guess, currentQuestion.actualPrice, sub.elapsedMs);
        updates[`submissions/${currentQuestion.id}/${nick}/score`] = score;
      }

      // 각 플레이어의 totalScore 업데이트 (미제출자는 변화 없음)
      for (const nick of Object.keys(players)) {
        const sub = subs[nick];
        const thisScore = sub
          ? calcScore(sub.guess, currentQuestion.actualPrice, sub.elapsedMs)
          : 0;
        const prevTotal = players[nick]?.totalScore || 0;
        updates[`players/${nick}/totalScore`] = prevTotal + thisScore;
      }

      updates["state/phase"] = "revealed";
      updates["state/phaseStartedAt"] = serverNow;

      await update(ref(db, `rooms/${roomCode}`), updates);
    } catch (e: any) {
      setError("결과 공개 실패: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const endGame = async () => {
    setError(null);
    setBusy(true);
    try {
      await update(ref(db, `rooms/${roomCode}/state`), {
        phase: "ended",
        phaseStartedAt: serverNow,
      });
    } catch (e: any) {
      setError("종료 실패: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const resetRoom = async () => {
    if (!confirm("정말 이 방을 완전히 삭제할까요? 모든 점수가 사라져요.")) return;
    try {
      await remove(ref(db, `rooms/${roomCode}`));
      onExit();
    } catch (e: any) {
      setError("삭제 실패: " + (e?.message || String(e)));
    }
  };

  // 리더보드 계산
  const leaderboard: LeaderboardEntry[] = useMemo(() => {
    const list = Object.entries(players).map(([nick, p]) => ({
      nickname: nick,
      totalScore: p?.totalScore || 0,
    }));
    list.sort((a, b) => b.totalScore - a.totalScore);
    let currentRank = 0;
    let lastScore = -Infinity;
    return list.map((e, i) => {
      if (e.totalScore !== lastScore) {
        currentRank = i + 1;
        lastScore = e.totalScore;
      }
      return { ...e, rank: currentRank };
    });
  }, [players]);

  if (!state || !meta) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">방 데이터 로딩 중...</div>
      </main>
    );
  }

  const isWaiting = state.phase === "waiting";
  const isPreloading = state.phase === "preloading" && !isPlayingPhase;
  const isRevealed = state.phase === "revealed";
  const isEnded = state.phase === "ended";
  const isLastQuestion = meta.currentIndex >= questions.length - 1;

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
          <div>
            <div className="text-xs text-slate-400">방 코드</div>
            <div className="text-3xl font-black font-mono tracking-widest">{roomCode}</div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="text-right">
              <div className="text-xs text-slate-400">진행</div>
              <div className="font-bold">
                {meta.currentIndex + 1 > 0 ? meta.currentIndex + 1 : 0} / {questions.length}
              </div>
            </div>
            <button
              onClick={onExit}
              className="ml-4 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              방 목록
            </button>
            <button
              onClick={onLogout}
              className="text-sm text-slate-400 hover:text-white underline ml-2"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 상태 배너 */}
        <div
          className={`rounded-xl px-4 py-3 mb-4 font-bold text-center ${
            isWaiting
              ? "bg-slate-700"
              : isPreloading
              ? "bg-blue-500/30 border border-blue-500/50"
              : isPlayingPhase && !playingFinished
              ? "bg-amber-500/30 border border-amber-500/50"
              : playingFinished
              ? "bg-orange-500/30 border border-orange-500/50"
              : isRevealed
              ? "bg-teal-500/30 border border-teal-500/50"
              : "bg-purple-500/30 border border-purple-500/50"
          }`}
        >
          {isWaiting && "⏸ 대기 중 — 문제를 시작해주세요"}
          {isPreloading && `⏱ 프리로드 ${Math.ceil((state.playingStartsAt - serverNow) / 1000)}초`}
          {isPlayingPhase && !playingFinished && `🎯 플레이 중 — ${Math.ceil(playingRemainingMs / 1000)}초 남음`}
          {playingFinished && "⌛ 시간 종료 — 곧 자동으로 결과 공개됩니다"}
          {isRevealed && "✅ 결과 공개 중"}
          {isEnded && "🏁 게임 종료"}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* 왼쪽: 현재 문제 */}
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
            <h2 className="font-bold mb-3">📷 현재 문제</h2>
            {currentQuestion ? (
              <>
                <div className="bg-white rounded-lg overflow-hidden aspect-square mb-3">
                  <img
                    src={currentQuestion.imageUrl}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="font-bold mb-1">{currentQuestion.productName}</div>
                <div className="text-sm text-slate-400 mb-2">
                  {CATEGORY_LABELS[currentQuestion.category]}
                </div>
                <div className="bg-slate-900 rounded-lg p-3">
                  <div className="text-xs text-slate-400">정답 (참여자에겐 숨김)</div>
                  <div className="text-2xl font-black text-brand-400">
                    {formatPrice(currentQuestion.actualPrice)}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-center py-8">
                문제가 시작되지 않았어요
              </div>
            )}
          </div>

          {/* 오른쪽: 참여자 & 제출 현황 */}
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
            <h2 className="font-bold mb-3">👥 참여자 ({playerCount}명)</h2>
            {currentQuestion && (
              <div className="bg-slate-900 rounded-lg p-3 mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-slate-400">제출 현황</span>
                  <span className="font-bold">
                    {submissionCount} / {playerCount}
                  </span>
                </div>
                <div className="h-2 bg-slate-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{
                      width: `${playerCount > 0 ? (submissionCount / playerCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {Object.keys(players)
                .sort()
                .map((nick) => {
                  const sub = submissions[nick];
                  return (
                    <li
                      key={nick}
                      className="flex justify-between items-center px-3 py-2 bg-slate-900 rounded text-sm"
                    >
                      <span>{nick}</span>
                      {sub ? (
                        <span className="text-green-400">
                          {sub.guess.toLocaleString("ko-KR")}원
                        </span>
                      ) : currentQuestion ? (
                        <span className="text-slate-500">미제출</span>
                      ) : (
                        <span className="text-slate-500">
                          {(players[nick].totalScore || 0).toFixed(1)}점
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          {(isWaiting || isRevealed) && !isLastQuestion && (
            <button
              onClick={startNextQuestion}
              disabled={busy}
              className="px-6 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-600 rounded-lg font-bold"
            >
              ▶ {isWaiting ? "첫 문제 시작" : "다음 문제"}
            </button>
          )}

          {isPlayingPhase && (
            <button
              onClick={revealAnswer}
              disabled={busy}
              className="px-6 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-600 rounded-lg font-bold"
            >
              ✅ 결과 공개 {!playingFinished && "(일찍 종료)"}
            </button>
          )}

          {isRevealed && isLastQuestion && (
            <button
              onClick={endGame}
              disabled={busy}
              className="px-6 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-600 rounded-lg font-bold"
            >
              🏁 최종 리더보드 공개
            </button>
          )}

          <button
            onClick={resetRoom}
            className="px-4 py-3 bg-red-600/50 hover:bg-red-600 rounded-lg text-sm"
          >
            🗑 방 삭제
          </button>
        </div>

        {/* 리더보드 (종료 시) */}
        {isEnded && (
          <div className="mt-10">
            <Leaderboard entries={leaderboard} maxRows={25} />
          </div>
        )}

        {/* 중간 순위 (종료 아닐 때 간이 표시) */}
        {!isEnded && leaderboard.some((e) => e.totalScore > 0) && (
          <div className="mt-8 bg-slate-800/40 rounded-xl p-4 border border-slate-700">
            <h3 className="font-bold mb-3 text-sm text-slate-400">
              📊 현재 상위 5명 (관리자 전용)
            </h3>
            <ul className="space-y-1">
              {leaderboard.slice(0, 5).map((e) => (
                <li key={e.nickname} className="flex justify-between text-sm">
                  <span>
                    {e.rank}. {e.nickname}
                  </span>
                  <span className="font-bold">{formatScore(e.totalScore)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}