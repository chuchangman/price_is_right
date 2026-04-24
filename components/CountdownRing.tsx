"use client";

interface Props {
  remaining: number; // ms
  total: number; // ms
  size?: number;
}

export default function CountdownRing({ remaining, total, size = 120 }: Props) {
  const progress = Math.max(0, Math.min(1, remaining / total));
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const seconds = Math.ceil(remaining / 1000);
  const colorClass =
    progress > 0.5
      ? "stroke-green-400 text-green-400"
      : progress > 0.2
      ? "stroke-yellow-400 text-yellow-400"
      : "stroke-red-400 text-red-400";

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={6}
          fill="none"
          className="stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          className={`transition-all duration-100 ease-linear ${colorClass}`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center font-black ${colorClass}`}
        style={{ fontSize: size * 0.35 }}
      >
        {seconds}
      </div>
    </div>
  );
}
