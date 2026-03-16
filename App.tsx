import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ALL_INSTRUMENTS, REFRESH_INTERVAL_MS } from './constants.tsx';
import { STRATEGIES } from './utils/tradingLogic';
import { MultiTimeframeAnalysis, ActionType } from './types';
import InstrumentRow, { GlobalAnalysisCache } from './components/InstrumentRow';
import TimerDonut from './components/TimerDonut';
import TradingViewModal from './components/TradingViewModal';
import TendencialModal from './components/TendencialModal';
import Radar from './components/Radar';
import { audioService } from './utils/audioService';

type SortConfig = { key: 'symbol' | 'action' | 'signal' | 'price' | 'score'; direction: 'asc' | 'desc' } | null;

interface DemoTrade {
  id: string;
  symbol: string;
  direction: 'buy' | 'sell';
  entry: number;
  tp: number;
  positionSize: number;
  riskAmount: number;
  openTime: number;
  closeTime?: number;
  profit?: number;
  closed: boolean;
}

interface DemoAccount {
  enabled: boolean;
  initialBalance: number;
  currentBalance: number;
  riskPercentage: number;
  trades: DemoTrade[];
}

const App: React.FC = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filter, setFilter] = useState<'all' | 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [volume, setVolume] = useState(() => parseFloat(localStorage.getItem('alertVolume') || '0.5'));
  const [charts, setCharts] = useState<Record<string, 'visible' | 'minimized'>>({});
  const [isRadarVisible, setIsRadarVisible] = useState(false);
  const [isTendencialModalVisible, setIsTendencialModalVisible] = useState(false);
  const [showActiveTradesOnly, setShowActiveTradesOnly] = useState(false);
  const [refreshJustCompleted, setRefreshJustCompleted] = useState(false);
  const [demoBalanceInput, setDemoBalanceInput] = useState('10000');
  
  const [demoAccount, setDemoAccount] = useState<DemoAccount>(() => {
    const saved = localStorage.getItem('demoAccount');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      enabled: false,
      initialBalance: 10000,
      currentBalance: 10000,
      riskPercentage: 2,
      trades: []
    };
  });
  
  const analysesRef = useRef<Record<string, MultiTimeframeAnalysis>>({});
  const [forceUpdateTrigger, forceUpdate] = useState(0);

  // Guardar demoAccount en localStorage
  useEffect(() => {
    localStorage.setItem('demoAccount', JSON.stringify(demoAccount));
  }, [demoAccount]);

  const handleActivateDemo = () => {
    const balance = parseFloat(demoBalanceInput) || 10000;
    setDemoAccount({
      enabled: true,
      initialBalance: balance,
      currentBalance: balance,
      riskPercentage: 2,
      trades: []
    });
  };

  const handleDemoTrade = useCallback((symbol: string, direction: 'buy' | 'sell', entry: number, tp: number) => {
    if (!demoAccount.enabled) return null;

    const riskAmount = demoAccount.currentBalance * (demoAccount.riskPercentage / 100);
    const stopDistance = Math.abs(tp - entry) * 0.5; // SL a mitad de distancia al TP
    const positionSize = riskAmount / stopDistance;

    const trade: DemoTrade = {
      id: `${symbol}-${Date.now()}`,
      symbol,
      direction,
      entry,
      tp,
      positionSize,
      riskAmount,
      openTime: Date.now(),
      closed: false
    };

    setDemoAccount(prev => ({
      ...prev,
      trades: [...prev.trades, trade]
    }));

    return trade;
  }, [demoAccount]);

  const handleCloseDemoTrade = useCallback((tradeId: string, currentPrice: number) => {
    setDemoAccount(prev => {
      const trade = prev.trades.find(t => t.id === tradeId);
      if (!trade || trade.closed) return prev;

      const priceChange = trade.direction === 'buy' 
        ? (currentPrice - trade.entry)
        : (trade.entry - currentPrice);
      const profit = priceChange * trade.positionSize;

      const updatedTrades = prev.trades.map(t => 
        t.id === tradeId 
          ? { ...t, closed: true, closeTime: Date.now(), profit }
          : t
      );

      return {
        ...prev,
        currentBalance: prev.currentBalance + profit,
        trades: updatedTrades
      };
    });
  }, []);

  const resetDemoAccount = () => {
    setDemoAccount(prev => ({
      ...prev,
      currentBalance: prev.initialBalance,
      trades: []
    }));
  };

  // Calcular estadísticas de sesión
  const demoStats = useMemo(() => {
    const sessionTrades = demoAccount.trades.filter(t => t.closed);
    const totalPL = demoAccount.currentBalance - demoAccount.initialBalance;
    const plPercentage = (totalPL / demoAccount.initialBalance) * 100;
    const wins = sessionTrades.filter(t => (t.profit || 0) > 0).length;
    const losses = sessionTrades.filter(t => (t.profit || 0) < 0).length;
    const winRate = sessionTrades.length > 0 ? (wins / sessionTrades.length) * 100 : 0;
    
    return {
      totalPL,
      plPercentage,
      totalTrades: sessionTrades.length,
      wins,
      losses,
      winRate,
      activeTrades: demoAccount.trades.filter(t => !t.closed).length
    };
  }, [demoAccount]);

  useEffect(() => {
    localStorage.setItem('alertVolume', volume.toString());
    audioService.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    audioService.setVolume(volume);
  }, []);

  const handleRefreshComplete = useCallback(() => {
    setRefreshTrigger(t => t + 1);
    setRefreshJustCompleted(true);
    setTimeout(() => setRefreshJustCompleted(false), 3000); // Parpadeo dura 3s
  }, []);

  const handleAnalysisUpdate = useCallback((id: string, data: MultiTimeframeAnalysis | null) => {
    if (!data) return;
    analysesRef.current[id] = data;
    forceUpdate(t => t + 1);
  }, []);

  const requestSort = (key: 'symbol' | 'action' | 'signal' | 'price' | 'score') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const playManualSound = (type: 'entry' | 'exit') => {
    audioService.play(type);
  };

  const handleOpenChart = useCallback((symbol: string) => {
    setCharts(prev => {
      const newChartsState: Record<string, 'visible' | 'minimized'> = {};
      // Minimize all other charts
      for (const key in prev) {
        if (key !== symbol) {
            newChartsState[key] = 'minimized';
        }
      }
      // Set the selected chart to visible
      newChartsState[symbol] = 'visible';
      return newChartsState;
    });
  }, []);
  
  const handleMinimizeChart = useCallback((symbol: string) => {
    setCharts(prev => (prev[symbol] ? { ...prev, [symbol]: 'minimized' } : prev));
  }, []);
  
  const handleCloseChart = useCallback((symbol: string) => {
    setCharts(prev => {
      const newChartsState = { ...prev };
      delete newChartsState[symbol];
      return newChartsState;
    });
  }, []);

  // Función helper para determinar si un instrumento debe ser VISIBLE (no eliminado)
  const isInstrumentVisible = useCallback((instrument: typeof ALL_INSTRUMENTS[0]) => {
    // Filtro de trades activos (tiene máxima prioridad)
    if (showActiveTradesOnly) {
      const cache = GlobalAnalysisCache[instrument.id];
      // Solo mostrar si tiene activeTrade en el cache
      return cache?.hasActiveTrade === true;
    }
    
    // Filtro por categoría
    if (filter !== 'all' && instrument.type !== filter) return false;
    
    // Filtro por búsqueda
    if (searchQuery && !instrument.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    return true;
  }, [filter, searchQuery, forceUpdateTrigger, showActiveTradesOnly]);

  const sortedInstruments = useMemo(() => {
    const items = ALL_INSTRUMENTS;
    const currentAnalyses = analysesRef.current;

    return [...items].sort((a, b) => {
      const analysisA = currentAnalyses[a.id];
      const analysisB = currentAnalyses[b.id];
      
      // 🎯 PRIORIDAD MÁXIMA: Obtener info del cache global
      const cacheA = GlobalAnalysisCache[a.id];
      const cacheB = GlobalAnalysisCache[b.id];
      const hasActiveTradeA = cacheA?.hasActiveTrade === true;
      const hasActiveTradeB = cacheB?.hasActiveTrade === true;
      const isNewSignalA = cacheA?.newSignalTriggerId === refreshTrigger;
      const isNewSignalB = cacheB?.newSignalTriggerId === refreshTrigger;

      // 🟢 PRIORIDAD 0: TRADES ACTIVOS van SIEMPRE PRIMERO
      if (hasActiveTradeA && !hasActiveTradeB) return -1;
      if (!hasActiveTradeA && hasActiveTradeB) return 1;

      // 🚨 PRIORIDAD 1: Señales "NOW" (nuevas) van SIEMPRE arriba, sin excepción
      if (isNewSignalA && !isNewSignalB) return -1;
      if (!isNewSignalA && isNewSignalB) return 1;
      
      // 🔥 PRIORIDAD 2: Si AMBAS son "NOW", ordenar por SCORE DESCENDENTE (mayor score primero)
      if (isNewSignalA && isNewSignalB) {
        return (analysisB?.powerScore || 0) - (analysisA?.powerScore || 0);
      }

      // 📊 PRIORIDAD 3: Para señales NO-NOW, aplicar sortConfig si existe
      if (sortConfig) {
        const { key, direction } = sortConfig;
        let valA: any, valB: any;
        
        if (key === 'action') {
          const actionOrder = {
            [ActionType.ESPERAR]: 1,
            [ActionType.NADA]: 1,
            [ActionType.ENTRAR_AHORA]: 2,
            [ActionType.SALIR]: 3,
            [ActionType.MERCADO_CERRADO]: 4,
            [ActionType.NOTICIA]: 5
          };
          valA = actionOrder[analysisA?.action || ActionType.NADA];
          valB = actionOrder[analysisB?.action || ActionType.NADA];
        } else if (key === 'symbol') { valA = a.symbol; valB = b.symbol; }
        else if (key === 'price') { valA = analysisA?.price || 0; valB = analysisB?.price || 0; }
        else if (key === 'score') { valA = analysisA?.powerScore || 0; valB = analysisB?.powerScore || 0; }
        else if (key === 'signal') { valA = analysisA?.mainSignal || ''; valB = analysisB?.mainSignal || ''; }
        
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
      }

      // 🎲 PRIORIDAD 4: Default sort por score y señales de entrada
      const isEntryA = analysisA?.action === ActionType.ENTRAR_AHORA;
      const isEntryB = analysisB?.action === ActionType.ENTRAR_AHORA;
      if (isEntryA && !isEntryB) return -1;
      if (!isEntryA && isEntryB) return 1;
      
      return (analysisB?.powerScore || 0) - (analysisA?.powerScore || 0);
    });
  }, [sortConfig, refreshTrigger, forceUpdateTrigger]);

  return (
    <div className="min-h-screen pb-24 bg-[#050505] text-white selection:bg-emerald-500/30">
      <header className="sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-2xl border-b border-white/5 px-8 py-5">
        <div className="max-w-[1500px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div 
              className="relative w-14 h-14 cursor-pointer group"
              onClick={() => setIsRadarVisible(true)}
            >
              <div className="absolute inset-0 bg-emerald-500/10 rounded-full border-2 border-emerald-500/20 group-hover:border-emerald-500/50 transition-colors"></div>
              <div className="absolute inset-2 bg-black/20 rounded-full"></div>
              <div 
                className="absolute inset-0 w-full h-full bg-no-repeat bg-center"
                style={{
                  backgroundImage: `conic-gradient(from 0deg, transparent 0%, #10b98130 5%, transparent 20%)`,
                  animation: 'spin 4s linear infinite'
                }}
              ></div>
              <svg className="absolute inset-0 w-full h-full text-emerald-500/60" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" strokeWidth="0.5" d="M12 2 L12 22 M2 12 L22 12" />
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="0.5" />
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase">CDLRadar V5.8</h1>
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Live Market Scanner</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(['all', 'forex', 'indices', 'stocks', 'commodities', 'crypto'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 border
                    ${filter === f 
                      ? 'bg-emerald-500 border-emerald-400 text-black' 
                      : 'bg-white/5 border-white/5 text-neutral-500 hover:text-white hover:bg-white/10'}`}
                >
                  {f}
                </button>
              ))}
            </div>
             <div className="flex items-center justify-center gap-3 mt-3 border-t border-white/5 pt-3 w-full">
                <button onClick={() => setIsTendencialModalVisible(true)} className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Tendencial</button>
                <button className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Fundamentales</button>
                <button className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Calendario</button>
                <button className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Mercado Cripto</button>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {/* Paper Money Demo */}
            {!demoAccount.enabled ? (
              <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl px-3 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">Paper Money</span>
                <input
                  type="number"
                  value={demoBalanceInput}
                  onChange={(e) => setDemoBalanceInput(e.target.value)}
                  placeholder="10000"
                  className="w-20 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyan-500/50"
                />
                <button
                  onClick={handleActivateDemo}
                  className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-400 text-[9px] font-black uppercase tracking-widest border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors"
                >
                  Start
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Paper Balance</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black font-mono text-white">
                      ${(demoAccount.currentBalance / 1000).toFixed(1)}k
                    </span>
                    <span className={`text-xs font-bold ${
                      demoStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {demoStats.totalPL >= 0 ? '+' : ''}{demoStats.plPercentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {demoStats.totalTrades > 0 && (
                  <div className="flex flex-col border-l border-white/10 pl-3">
                    <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Stats</span>
                    <div className="flex items-center gap-2 text-[9px]">
                      <span className="text-emerald-400">{demoStats.wins}W</span>
                      <span className="text-rose-400">{demoStats.losses}L</span>
                      <span className="text-neutral-400">{demoStats.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={resetDemoAccount}
                  className="text-[8px] px-2 py-1 rounded bg-neutral-800/50 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors font-bold uppercase tracking-wider"
                  title="Reset paper account"
                >
                  Reset
                </button>
              </div>
            )}
            
            <div className="flex items-center space-x-4 bg-white/5 p-2 px-3 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => playManualSound('entry')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                  title="Test Entry Sound"
                >
                  Entry
                </button>
                <button 
                  onClick={() => playManualSound('exit')}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase border border-rose-500/20 hover:bg-rose-500/20 transition-all"
                  title="Test Exit Sound"
                >
                  Exit
                </button>
              </div>
              <div className="h-6 w-px bg-white/10"></div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <input 
                  type="range" min="0" max="1" step="0.1" 
                  value={volume} 
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500/50 w-40 transition-all"
              />
            </div>
            <TimerDonut 
              durationMs={REFRESH_INTERVAL_MS} 
              onComplete={handleRefreshComplete} 
              isPaused={false} 
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-8 mt-10">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-start gap-4 px-4 py-3 bg-white/[0.02] rounded-xl border border-white/5 mb-4 text-[10px] uppercase tracking-widest text-neutral-600">
            <div className="w-16 text-center shrink-0">Status</div>
            <div className="w-[190px] shrink-0 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('symbol')}>Instrument</div>
            <div className="w-[44px] shrink-0 text-center">Chart</div>
            <div className="w-[90px] shrink-0">Price</div>
            <div className="w-[170px] shrink-0 text-center">MTF Alignment</div>
            <div className="w-14 shrink-0 text-center">
              <span className="cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('score')}>Score</span>
            </div>
            <div className="w-[190px] shrink-0 text-center">Trade Setup</div>
            <div className="w-[78px] shrink-0 text-center ml-auto">Session</div>
            <div className="w-[120px] shrink-0 text-center">Action</div>
            <div 
              className="w-[190px] shrink-0 text-center cursor-pointer hover:text-white transition-colors relative group"
              onClick={() => {
                setShowActiveTradesOnly(!showActiveTradesOnly);
                forceUpdate(t => t + 1); // Forzar re-render inmediato
              }}
              title="Click para filtrar trades activos"
            >
              P&amp;L / Progress
              {showActiveTradesOnly && (
                <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">ACTIVE</span>
              )}
              <svg className="w-3 h-3 inline-block ml-1 opacity-50 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div className="w-10 shrink-0"></div>
          </div>
          
          {sortedInstruments.map(instrument => {
            const isVisible = isInstrumentVisible(instrument);
            return (
              <div key={instrument.id} className={isVisible ? '' : 'hidden'}>
                <InstrumentRow
                  instrument={instrument}
                  isConnected={true}
                  onToggleConnect={() => {}}
                  globalRefreshTrigger={refreshTrigger}
                  strategy={STRATEGIES[0]}
                  onAnalysisUpdate={handleAnalysisUpdate}
                  isTestMode={false}
                  onOpenChart={handleOpenChart}
                  chartStatus={charts[instrument.symbol]}
                  demoAccount={demoAccount}
                  onDemoTrade={handleDemoTrade}
                  onCloseDemoTrade={handleCloseDemoTrade}
                  refreshJustCompleted={refreshJustCompleted}
                />
              </div>
            );
          })}
          {sortedInstruments.filter(i => isInstrumentVisible(i)).length === 0 && (
            <div className="py-20 text-center text-neutral-600 font-bold uppercase tracking-widest border border-dashed border-white/5 rounded-3xl">
              No instruments found with current filters
            </div>
          )}
        </div>
      </main>

      <div id="chart-modals-container">
        {Object.entries(charts).map(([symbol, status]) => {
          const instrument = ALL_INSTRUMENTS.find(i => i.symbol === symbol);
          const analysis = instrument ? analysesRef.current[instrument.id] : null;
          if (!instrument) return null;
          return (
            <TradingViewModal
              key={symbol}
              instrument={instrument}
              tradeSetup={analysis?.tradeSetup || null}
              mainSignal={analysis?.mainSignal}
              isVisible={status === 'visible'}
              onMinimize={() => handleMinimizeChart(symbol)}
              onClose={() => handleCloseChart(symbol)}
            />
          );
        })}
      </div>
      
      {isRadarVisible && (
        <Radar
          analyses={Object.values(analysesRef.current).filter(a => a)}
          onClose={() => setIsRadarVisible(false)}
        />
      )}

      {isTendencialModalVisible && (
        <TendencialModal
          isVisible={isTendencialModalVisible}
          onClose={() => setIsTendencialModalVisible(false)}
        />
      )}
    </div>
  );
};

export default App;