"use client";

import { LeaderboardEntry } from "@/lib/types";
import { formatScore } from "@/lib/score";

interface Props {
  entries: LeaderboardEntry[];
  highlightNickname?: string;
  title?: string;
  maxRows?: number;
}

const medalEmoji = (rank: number): string => {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
};

export default function Leaderboard({
  entries,
  highlightNickname,
  title = "최종 순위",
  maxRows,
}: Props) {
  const visible = maxRows ? entries.slice(0, maxRows) : entries;
  const myEntry = highlightNickname
    ? entries.find((e) => e.nickname === highlightNickname)
    : null;
  const isMyRankVisible = myEntry && visible.some((e) => e.nickname === highlightNickname);

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-3xl font-black text-center mb-6">🏆 {title}</h2>

      <div className="bg-slate-800/60 backdrop-blur rounded-2xl p-4 border border-slate-700 shadow-xl">
        {visible.length === 0 ? (
          <p className="text-center text-slate-400 py-8">아직 점수가 없어요</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((e) => {
              const isMe = e.nickname === highlightNickname;
              return (
                <li
                  key={e.nickname}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                    isMe
                      ? "bg-brand-500/20 border border-brand-500/50"
                      : e.rank <= 3
                      ? "bg-slate-700/50"
                      : "bg-slate-900/50"
                  }`}
                >
                  <div className="w-8 text-center font-bold text-lg">
                    {medalEmoji(e.rank) || `${e.rank}`}
                  </div>
                  <div className="flex-1 font-medium truncate">
                    {e.nickname}
                    {isMe && <span className="ml-2 text-xs text-brand-300">(나)</span>}
                  </div>
                  <div className="font-black text-lg">{formatScore(e.totalScore)}</div>
                </li>
              );
            })}
          </ul>
        )}

        {myEntry && !isMyRankVisible && (
          <>
            <div className="text-center text-slate-500 my-2">⋮</div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-brand-500/20 border border-brand-500/50">
              <div className="w-8 text-center font-bold text-lg">{myEntry.rank}</div>
              <div className="flex-1 font-medium truncate">
                {myEntry.nickname} <span className="ml-2 text-xs text-brand-300">(나)</span>
              </div>
              <div className="font-black text-lg">{formatScore(myEntry.totalScore)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
