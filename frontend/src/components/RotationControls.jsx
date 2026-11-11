import React from 'react';
import { Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react';

export default function RotationControls({
  progress, paused, onToggle, onPrev, onNext, index, total, intervalMs,
}) {
  const R = 14;
  const C = 2 * Math.PI * R;
  const dash = C * (1 - progress);
  const secondsLeft = Math.max(0, Math.ceil((1 - progress) * (intervalMs / 1000)));

  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5">
      <button
        onClick={onPrev}
        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
        aria-label="Previous"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={onToggle}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-800"
        aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
        title={paused ? 'Resume' : `Pause (${secondsLeft}s left)`}
      >
        <svg viewBox="0 0 36 36" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r={R}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeDasharray={C}
            strokeDashoffset={dash}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 80ms linear' }}
          />
        </svg>
        {paused ? <Play className="w-3.5 h-3.5 relative" /> : <Pause className="w-3.5 h-3.5 relative" />}
      </button>

      <button
        onClick={onNext}
        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
        aria-label="Next"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <span className="text-[11px] font-mono text-slate-400 tabular-nums w-12 text-center">
        {index + 1}/{total}
      </span>
    </div>
  );
}