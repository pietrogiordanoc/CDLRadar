import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ALL_INSTRUMENTS, REFRESH_INTERVAL_MS } from './constants.tsx';
import { STRATEGIES } from './utils/tradingLogic';
import { MultiTimeframeAnalysis, ActionType } from './types';
import InstrumentRow from './components/InstrumentRow';
import TimerDonut from './components/TimerDonut';
import TradingViewModal from './components/TradingViewModal';
import TendencialModal from './components/TendencialModal';
import Radar from './components/Radar';
import { audioService } from './utils/audioService';

type SortConfig = { key: 'symbol' | 'action' | 'signal' | 'price' | 'score'; direction: 'asc' | 'desc' } | null;
type ActionFilter = 'all' | 'entrar' | 'salir' | 'esperar';

const App: React.FC = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filter, setFilter] = useState<'all' | 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto'>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [volume, setVolume] = useState(() => parseFloat(localStorage.getItem('alertVolume') || '0.5'));
  const [charts, setCharts] = useState<Record<string, 'visible' | 'minimized'>>({});
  const [isRadarVisible, setIsRadarVisible] = useState(false);
  const [isTendencialModalVisible, setIsTendencialModalVisible] = useState(false);
  
  const analysesRef = useRef<Record<string, MultiTimeframeAnalysis>>({});
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    localStorage.setItem('alertVolume', volume.toString());
    audioService.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    audioService.setVolume(volume);
  }, []);

  const handleRefreshComplete = useCallback(() => {
    setRefreshTrigger(t => t + 1);
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

  const filteredInstruments = useMemo(() => {
    let items = ALL_INSTRUMENTS;
    if (filter !== 'all') items = items.filter(i => i.type === filter);
    if (searchQuery) items = items.filter(i => i.symbol.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const currentAnalyses = analysesRef.current;

    // Filtro por acción
    if (actionFilter !== 'all') {
      items = items.filter(i => {
        const analysis = currentAnalyses[i.id];
        if (actionFilter === 'entrar') return analysis?.action === ActionType.ENTRAR_AHORA;
        if (actionFilter === 'salir') return analysis?.action === ActionType.SALIR;
        if (actionFilter === 'esperar') return analysis?.action === ActionType.ESPERAR || analysis?.action === ActionType.NADA;
        return true;
      });
    }

    return [...items].sort((a, b) => {
      const analysisA = currentAnalyses[a.id];
      const analysisB = currentAnalyses[b.id];

      if (sortConfig) {
        const { key, direction } = sortConfig;
        let valA: any, valB: any;
        
        if (key === 'action') {
          // Lógica cíclica solicitada: Standby -> Entrar -> Salir
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

      // Default sort by score and entries
      const isEntryA = analysisA?.action === ActionType.ENTRAR_AHORA;
      const isEntryB = analysisB?.action === ActionType.ENTRAR_AHORA;
      if (isEntryA && !isEntryB) return -1;
      if (!isEntryA && isEntryB) return 1;
      
      return (analysisB?.powerScore || 0) - (analysisA?.powerScore || 0);
    });
  }, [filter, actionFilter, searchQuery, sortConfig, refreshTrigger]);

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
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase">CDLRadar V5.7</h1>
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
          <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] rounded-xl border border-white/5 mb-4 text-[10px] font-black uppercase tracking-widest text-neutral-600">
            <div className="w-16 text-center">Status</div>
            <div className="w-1/4 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('symbol')}>Instrument</div>
            <div className="w-1/5 text-center">MTF Alignment</div>
            <div className="w-16 text-center">
              <span className="cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('score')}>Score</span>
            </div>
            <div className="w-40 text-center">Trade Setup</div>
            <div className="w-24 text-center">Session</div>
            <div className="w-48 text-center">
               <div className="flex items-center justify-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/5 scale-90">
                <button 
                  onClick={() => setActionFilter('all')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'all' ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
                >All</button>
                <button 
                  onClick={() => setActionFilter('entrar')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'entrar' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-neutral-500'}`}
                >Entrar</button>
                <button 
                  onClick={() => setActionFilter('salir')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'salir' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-neutral-500'}`}
                >Salir</button>
                <button 
                  onClick={() => setActionFilter('esperar')}
                  className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest transition-all ${actionFilter === 'esperar' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-neutral-500'}`}
                >Standby</button>
              </div>
            </div>
            <div className="w-10"></div>
          </div>
          
          {filteredInstruments.map(instrument => (
            <InstrumentRow
              key={instrument.id}
              instrument={instrument}
              isConnected={true}
              onToggleConnect={() => {}}
              globalRefreshTrigger={refreshTrigger}
              strategy={STRATEGIES[0]}
              onAnalysisUpdate={handleAnalysisUpdate}
              isTestMode={false}
              onOpenChart={handleOpenChart}
              chartStatus={charts[instrument.symbol]}
            />
          ))}
          {filteredInstruments.length === 0 && (
            <div className="py-20 text-center text-neutral-600 font-bold uppercase tracking-widest border border-dashed border-white/5 rounded-3xl">
              No instruments found with current filters
            </div>
          )}
        </div>
      </main>

      <div id="chart-modals-container">
        {Object.entries(charts).map(([symbol, status]) => {
          const instrument = ALL_INSTRUMENTS.find(i => i.symbol === symbol);
          if (!instrument) return null;
          return (
            <TradingViewModal
              key={symbol}
              instrument={instrument}
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