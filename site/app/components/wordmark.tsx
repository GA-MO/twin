import { useId } from 'react';

export function TwinMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff5f6d" />
          <stop offset="0.18" stopColor="#ffb347" />
          <stop offset="0.34" stopColor="#f9e45b" />
          <stop offset="0.5" stopColor="#54d68a" />
          <stop offset="0.66" stopColor="#4fb3ff" />
          <stop offset="0.83" stopColor="#8a6cff" />
          <stop offset="1" stopColor="#e66bd6" />
        </linearGradient>
      </defs>
      <path
        d="M16 4.5 L28.5 26.5 L3.5 26.5 Z"
        stroke={`url(#${id})`}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-[1.05rem] font-semibold tracking-tight">
      <TwinMark className="size-[1.15rem]" />
      twin
    </span>
  );
}
