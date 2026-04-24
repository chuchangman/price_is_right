"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ref, get, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { validateNickname, validateRoomCode, sanitizeNickname } from "@/lib/roomCode";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 이전 세션 복구
  useEffect(() => {
    const savedNick = localStorage.getItem("pir:nickname");
    const savedRoom = localStorage.getItem("pir:roomCode");
    if (savedNick) setNickname(savedNick);
    if (savedRoom) setRoomCode(savedRoom);
  }, []);

  const handleJoin = async () => {
    setError(null);
    const nick = sanitizeNickname(nickname);
    const code = roomCode.trim().toUpperCase();

    if (!validateNickname(nick)) {
      setError("닉네임은 2~10자로 입력해주세요");
      return;
    }
    if (!validateRoomCode(code)) {
      setError("방 코드는 6자리여야 해요");
      return;
    }

    setLoading(true);
    try {
      // 방 존재 여부 확인
      const roomSnap = await get(ref(db, `rooms/${code}/meta`));
      if (!roomSnap.exists()) {
        setError("존재하지 않는 방 코드예요");
        setLoading(false);
        return;
      }

      // 닉네임 중복 확인 (단, 본인 재접속 허용 — localStorage의 nickname과 같으면 OK)
      const playerSnap = await get(ref(db, `rooms/${code}/players/${nick}`));
      const savedNick = localStorage.getItem("pir:nickname");
      const savedRoom = localStorage.getItem("pir:roomCode");
      const isReconnect = savedNick === nick && savedRoom === code;

      if (playerSnap.exists() && !isReconnect) {
        setError("이미 사용 중인 닉네임이에요");
        setLoading(false);
        return;
      }

      // 플레이어 등록
      await set(ref(db, `rooms/${code}/players/${nick}`), {
        joinedAt: playerSnap.exists() ? playerSnap.val().joinedAt : Date.now(),
        lastSeenAt: Date.now(),
        totalScore: playerSnap.exists() ? playerSnap.val().totalScore || 0 : 0,
      });

      localStorage.setItem("pir:nickname", nick);
      localStorage.setItem("pir:roomCode", code);

      router.push(`/play?room=${code}&nick=${encodeURIComponent(nick)}`);
    } catch (e: any) {
      setError("입장 중 오류가 발생했어요: " + (e?.message || String(e)));
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black mb-3">🎯 가격 맞추기</h1>
          <p className="text-slate-400">상품 사진을 보고 가격을 맞혀보세요!</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
          <label className="block mb-4">
            <span className="text-sm font-medium text-slate-300 mb-1 block">닉네임</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="2~10자"
              maxLength={10}
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-600 focus:border-brand-500 focus:outline-none text-white placeholder-slate-500"
            />
          </label>

          <label className="block mb-6">
            <span className="text-sm font-medium text-slate-300 mb-1 block">방 코드</span>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-600 focus:border-brand-500 focus:outline-none text-white placeholder-slate-500 tracking-widest text-center text-xl uppercase"
            />
          </label>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition"
          >
            {loading ? "입장 중..." : "입장하기"}
          </button>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/admin"
            className="text-slate-500 hover:text-slate-300 text-sm underline"
          >
            관리자로 입장
          </Link>
        </div>
      </div>
    </main>
  );
}