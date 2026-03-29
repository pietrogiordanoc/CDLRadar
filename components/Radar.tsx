import React, { useMemo, useEffect, useState } from 'react';
import { MultiTimeframeAnalysis, SignalType } from '../types';

interface RadarProps {
  analyses: MultiTimeframeAnalysis[];
  onClose: () => void;
}

const StatBar: React.FC<{ label: string; value: number; colorClass: string }> = ({ label, value, colorClass }) => (
  <div>
    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">{label}</div>
    <div className="h-2.5 bg-neutral-800/50 rounded-full border border-white/5 overflow-hidden">
      <div 
        className={`h-full rounded-full ${colorClass} transition-all duration-500`} 
        style={{ width: `${value * 100}%` }}
      ></div>
    </div>
  </div>
);

const Radar: React.FC<RadarProps> = ({ analyses, onClose }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const metrics = useMemo(() => {
    if (!analyses || analyses.length === 0) {
      return {
        highPriorityCount: 0,
        topTargets: [],
        macroTrend: 0.5,
        volatility: 0,
      };
    }

    const highPriority = analyses.filter(a => (a.powerScore || 0) >= 85);
    
    const topTargets = [...analyses]
        .sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0))
        .slice(0, 5)
        .map(a => ({ symbol: a.symbol, score: a.powerScore || 0 }));
        
    let macroBuy = 0;
    let macroSell = 0;
    let totalScore = 0;
    analyses.forEach(a => {
        if(a.signals['4h'] === SignalType.BUY) macroBuy++;
        if(a.signals['4h'] === SignalType.SALE) macroSell++;
        if(a.signals['1h'] === SignalType.BUY) macroBuy++;
        if(a.signals['1h'] === SignalType.SALE) macroSell++;
        totalScore += a.powerScore || 0;
    });

    const totalMacro = macroBuy + macroSell;
    const macroTrend = totalMacro > 0 ? macroBuy / totalMacro : 0.5;
    const volatility = Math.min(1, (totalScore / analyses.length) / 80); // Normalize volatility based on average score

    return {
      highPriorityCount: highPriority.length,
      topTargets,
      macroTrend,
      volatility,
    };
  }, [analyses]);

  const blips = useMemo(() => {
    return analyses.map(analysis => {
      const { symbol, powerScore = 0, mainSignal } = analysis;
      const angle = (symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) * 137.5) % 360;
      const radiusPercent = 95 - (powerScore / 100) * 80; // Maps 0-100 score to 95%-15% radius
      
      const angleRad = angle * (Math.PI / 180);
      const xPos = (radiusPercent / 2) * Math.cos(angleRad);
      const yPos = (radiusPercent / 2) * Math.sin(angleRad);
      
      let colorClass = 'bg-amber-500/80';
      if (mainSignal === SignalType.BUY) colorClass = 'bg-emerald-400';
      if (mainSignal === SignalType.SALE) colorClass = 'bg-rose-500';

      const size = 6 + (powerScore / 100) * 14;
      const hasPulse = powerScore >= 85;

      return {
        id: symbol,
        style: {
          left: `calc(50% + ${xPos}%)`,
          top: `calc(50% + ${yPos}%)`,
          transform: 'translate(-50%, -50%)',
          width: `${size}px`,
          height: `${size}px`,
        },
        colorClass,
        hasPulse,
        symbol,
      };
    });
  }, [analyses]);

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-lg font-mono overflow-hidden"
      onClick={onClose}
    >
      <style>{`
        @keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blip-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.7; } }
        .animate-radar-sweep { animation: radar-sweep 5s linear infinite; }
        .animate-blip-pulse { animation: blip-pulse 2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
      
      {/* Title - Hidden on mobile */}
      <div className="hidden md:block absolute top-5 left-8 text-white uppercase">
        <h2 className="text-2xl font-bold tracking-widest">Radar Financiero <span className="text-emerald-400">v5.8</span></h2>
      </div>

      {/* Time and Stats - Top on mobile, left on desktop */}
      <div className="absolute top-3 left-3 md:top-[12%] md:left-8 text-white space-y-2 md:space-y-4 w-48 md:w-64">
        <div className="flex flex-col md:flex-row md:items-baseline space-y-1 md:space-y-0 md:space-x-4">
          <div className="text-2xl md:text-5xl font-bold text-emerald-400">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-xs md:text-lg text-neutral-400">{currentTime.toLocaleDateString([], { month: 'short', day: '2-digit' })}</div>
          <div className="flex items-center space-x-2 text-emerald-400">
            <span className="font-black text-xl md:text-4xl">›{metrics.highPriorityCount}</span>
          </div>
        </div>
        <div className="hidden md:block">
          <StatBar label="Tendencia Macro" value={metrics.macroTrend} colorClass="bg-emerald-500" />
        </div>
      </div>

      {/* Objectives - Bottom on mobile, right on desktop */}
      <div className="absolute bottom-3 left-3 right-3 md:top-[12%] md:right-8 md:left-auto md:bottom-auto text-white w-auto md:w-64 space-y-2 md:space-y-4">
        <div className="hidden md:block">
          <StatBar label="Volatilidad" value={metrics.volatility} colorClass="bg-amber-500" />
        </div>
        <div className="bg-black/40 md:bg-black/20 p-2 md:p-3 rounded-lg border border-white/10 backdrop-blur-sm">
          <h3 className="text-[8px] md:text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1 md:mb-2">Objetivos</h3>
          <ul className="space-y-0.5 md:space-y-1 flex md:flex-col gap-2 md:gap-0 overflow-x-auto md:overflow-x-visible">
            {metrics.topTargets.map(t => (
              <li key={t.symbol} className="flex md:justify-between items-center text-xs md:text-sm whitespace-nowrap md:whitespace-normal flex-shrink-0">
                <span className="font-bold text-neutral-300">{t.symbol}</span>
                <span className="font-mono text-emerald-400 ml-2 md:ml-0">{t.score.toFixed(0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      {/* Status message - Hidden on mobile to avoid overlap */}
      {metrics.highPriorityCount > 0 && (
        <div className="hidden md:block absolute bottom-[8%] left-1/2 -translate-x-1/2 text-center">
            <div className="text-lg font-bold text-emerald-400 uppercase tracking-widest">
            [ ] Escaneando confluencias de alta probabilidad...
            </div>
        </div>
      )}

      {/* Radar Circle - Smaller on mobile */}
      <div className="relative w-[85vw] h-[85vw] md:w-full md:h-full max-w-[90vh] max-h-[90vh] aspect-square mt-16 md:mt-0">
        <div className="absolute inset-0 rounded-full border border-emerald-500/10 bg-black/10"></div>
        <div className="absolute inset-[12.5%] rounded-full border border-dashed border-emerald-500/10"></div>
        <div className="absolute inset-[25%] rounded-full border border-emerald-500/10"></div>
        <div className="absolute inset-[37.5%] rounded-full border border-dashed border-emerald-500/10"></div>
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
        <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent"></div>
        <div className="absolute inset-0 w-full h-full animate-radar-sweep origin-center">
          <div className="w-full h-1/2 bg-gradient-to-b from-emerald-400/20 via-emerald-400/5 to-transparent"></div>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-400/50 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
        </div>
        
        <div className="absolute inset-0">
          {blips.map(blip => (
            <div
              key={blip.id}
              className={`absolute rounded-full transition-all duration-1000 ease-out group`}
              style={blip.style}
            >
              <div 
                className={`w-full h-full rounded-full ${blip.colorClass} ${blip.hasPulse ? 'animate-blip-pulse' : ''}`}
                style={{ boxShadow: `0 0 10px ${blip.colorClass.replace('/80', '').replace('bg-', '')}` }}
              ></div>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/50 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {blip.symbol}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Close button - Smaller and repositioned on mobile */}
      <button 
        onClick={onClose}
        className="absolute top-3 right-3 md:top-8 md:right-8 p-2 md:p-3 bg-white/10 rounded-full text-white hover:bg-rose-500/50 transition-colors z-10"
        title="Close Radar (Esc)"
      >
        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
};

export default Radar;