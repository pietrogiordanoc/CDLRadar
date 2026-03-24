
import React, { useEffect, useState } from 'react';

interface TimerDonutProps {
  durationMs: number;
  onComplete: () => void;
  isPaused: boolean;
  onClick?: () => void;
}

const TimerDonut: React.FC<TimerDonutProps> = ({ durationMs, onComplete, isPaused, onClick }) => {
  const [timeLeft, setTimeLeft] = useState(durationMs);
  const radius = 18; // Radio aumentado ligeramente
  const circumference = 2 * Math.PI * radius;
  const progress = ((durationMs - timeLeft) / durationMs) * circumference;

  const handleManualRefresh = () => {
    // Feedback inmediato: al click, refresca y reinicia el contador visual.
    onClick?.();
    setTimeLeft(durationMs);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          // Solo llamar onComplete si no está pausado
          if (!isPaused) {
            onComplete();
          }
          return durationMs;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [durationMs, onComplete, isPaused]);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center space-y-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={handleManualRefresh}
      title="Click to refresh"
      aria-label="Manual refresh"
    >
      <div className="relative inline-flex items-center justify-center">
        <svg className="w-14 h-14 transform -rotate-90">
          <circle
            cx="28"
            cy="28"
            r={radius}
            stroke="currentColor"
            strokeWidth="3.5"
            fill="transparent"
            className="text-neutral-800"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            stroke="currentColor"
            strokeWidth="3.5"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="text-emerald-500 transition-all duration-1000 ease-linear"
          />
        </svg>
        <span className="absolute text-[12px] font-mono text-neutral-300 font-bold">
          {formatTime(timeLeft)}
        </span>
      </div>
    </button>
  );
};

export default TimerDonut;