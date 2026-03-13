import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick, TradeSetup } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles, isMarketOpen } from '../services/twelveDataService';
import { audioService } from '../utils/audioService';

export const GlobalAnalysisCache: Record<string, { analysis: MultiTimeframeAnalysis, trigger: number, newSignalTriggerId?: number | null, lastAction?: ActionType | null }> = {};

interface InstrumentRowProps {
  instrument: Instrument;
  isConnected: boolean;
  onToggleConnect: (id: string) => void;
  globalRefreshTrigger: number;
  strategy: Strategy;
  onAnalysisUpdate?: (id: string, data: MultiTimeframeAnalysis | null) => void;
  isTestMode?: boolean;
  onOpenChart: (symbol: string) => void;
  chartStatus?: 'visible' | 'minimized';
}

type ActiveTrade = {
  entryPrice: number;
  direction: 'buy' | 'sell';
  tp?: number;
};

const calculateProfitDisplay = (tp: number, entry: number, instrument: Instrument): { value: string, unit: string } => {
    const profitDistance = Math.abs(tp - entry);
    
    if (instrument.type === 'forex') {
        const isJpyPair = instrument.symbol.includes('JPY');
        const pips = isJpyPair ? profitDistance * 100 : profitDistance * 10000;
        return { value: pips.toFixed(1), unit: 'PIPS' };
    }
    
    if (instrument.type === 'indices') {
        return { value: profitDistance.toFixed(2), unit: 'PTS' };
    }

    if (instrument.type === 'crypto' || instrument.type === 'stocks' || instrument.type === 'commodities') {
        if (profitDistance >= 10) return { value: profitDistance.toFixed(1), unit: 'PTS' };
        if (profitDistance >= 1) return { value: profitDistance.toFixed(2), unit: 'PTS' };
        return { value: profitDistance.toFixed(4), unit: 'PTS' };
    }

    return { value: profitDistance.toFixed(2), unit: 'PROFIT' };
};

const InstrumentRow: React.FC<InstrumentRowProps> = ({ 
  instrument, isConnected, onToggleConnect, globalRefreshTrigger, strategy, onAnalysisUpdate, isTestMode = false, onOpenChart, chartStatus
}) => {
  const [analysis, setAnalysis] = useState<MultiTimeframeAnalysis | null>(() => GlobalAnalysisCache[instrument.id]?.analysis || null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(PriceStore[instrument.symbol] || 0);
  const [isBookmarked, setIsBookmarked] = useState(() => {
    const saved = localStorage.getItem('bookmarks');
    return saved ? JSON.parse(saved).includes(instrument.id) : false;
  });
  const [newSignalTriggerId, setNewSignalTriggerId] = useState<number | null>(null);
  const [tradeSetup, setTradeSetup] = useState<TradeSetup | null>(null);
  const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(null);
  const [copyStatus, setCopyStatus] = useState<boolean>(false);
  
  const lastRefreshTriggerRef = useRef<number>(GlobalAnalysisCache[instrument.id]?.trigger ?? -1);

  useEffect(() => {
    const interval = setInterval(async () => {
      // Si hay un trade activo, consultar precio en tiempo real desde Supabase
      if (activeTrade) {
        try {
          const { supabase } = await import('../services/supabaseClient');
          const { data } = await supabase
            .from('market_cache')
            .select('time_series_data')
            .eq('symbol', instrument.symbol)
            .single();
          
          if (data?.time_series_data && Array.isArray(data.time_series_data) && data.time_series_data.length > 0) {
            const latestCandle = data.time_series_data[0]; // Primer elemento es el más reciente
            const latestPrice = parseFloat(latestCandle.close);
            if (latestPrice > 0) {
              setCurrentPrice(latestPrice);
              PriceStore[instrument.symbol] = latestPrice;
            }
          }
        } catch (error) {
          console.error(`Error fetching live price for ${instrument.symbol}:`, error);
        }
      } else {
        // Sin trade activo, usar PriceStore (más eficiente)
        if (PriceStore[instrument.symbol]) {
          setCurrentPrice(PriceStore[instrument.symbol]);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [instrument.symbol, activeTrade]);

  const handleCopyTradeSetup = (setup: TradeSetup) => {
    if (!setup) return;
    const copyText = `E: ${setup.entry.toFixed(5)}\nTP: ${setup.tp.toFixed(5)}`;
    navigator.clipboard.writeText(copyText);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 1500);
  };

  const toggleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBookmarked(prev => {
      const newState = !prev;
      const saved = localStorage.getItem('bookmarks');
      let list = saved ? JSON.parse(saved) : [];
      if (newState) {
        if (!list.includes(instrument.id)) list.push(instrument.id);
      } else {
        list = list.filter((id: string) => id !== instrument.id);
      }
      localStorage.setItem('bookmarks', JSON.stringify(list));
      return newState;
    });
  };

  const playAlertSound = useCallback((type: 'entry' | 'exit') => {
    audioService.play(type);
  }, []);

  const performAnalysis = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      const data5m = await fetchTimeSeries(instrument.symbol, '5min', 5000);
      
      if (data5m.length >= 100) {
        const combinedData: Partial<Record<Timeframe, Candlestick[]>> = {
          '5min': data5m,
          '15min': resampleCandles(data5m, 3),
          '1h': resampleCandles(data5m, 12),
          '4h': resampleCandles(data5m, 48)
        };

        const result = strategy.analyze(instrument.symbol, combinedData as any, false, instrument);
        
        if (result.tradeSetup) setTradeSetup(result.tradeSetup);
        else if (!activeTrade) setTradeSetup(null);
        
        const lastActionInCache = GlobalAnalysisCache[instrument.id]?.lastAction;
        const isNewEntry = result.action === ActionType.ENTRAR_AHORA && lastActionInCache !== ActionType.ENTRAR_AHORA;
        const isNewExit = result.action === ActionType.SALIR && lastActionInCache !== ActionType.SALIR;
        
        let signalTriggerForUpdate = GlobalAnalysisCache[instrument.id]?.newSignalTriggerId;

        if (isNewEntry || isNewExit) {
          playAlertSound(isNewEntry ? 'entry' : 'exit');
          signalTriggerForUpdate = globalRefreshTrigger;
          setNewSignalTriggerId(signalTriggerForUpdate);
        }
        
        setAnalysis(result);
        if (result.price) setCurrentPrice(result.price);
        
        GlobalAnalysisCache[instrument.id] = { 
            analysis: result, 
            trigger: globalRefreshTrigger,
            newSignalTriggerId: signalTriggerForUpdate,
            lastAction: result.action,
        };
        
        if (onAnalysisUpdate) onAnalysisUpdate(instrument.id, result);
      } else {
         if (onAnalysisUpdate) onAnalysisUpdate(instrument.id, null);
      }
    } catch (err)
 {
      console.error(`Error ${instrument.symbol}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [instrument, strategy, onAnalysisUpdate, playAlertSound, globalRefreshTrigger, activeTrade]);

  // Authoritative effect to sync "NOW" state from global cache and handle cleanup.
  useEffect(() => {
    const signalInfo = GlobalAnalysisCache[instrument.id];

    if (signalInfo?.newSignalTriggerId && signalInfo.newSignalTriggerId === globalRefreshTrigger) {
      // Case 1: A "NOW" signal exists for the CURRENT refresh cycle. Show it.
      setNewSignalTriggerId(signalInfo.newSignalTriggerId);
    } else {
      // Case 2: No current signal or signal is old. Ensure local state is cleared.
      setNewSignalTriggerId(null);
      // And if it's an old signal, clean the cache too.
      if (signalInfo?.newSignalTriggerId && signalInfo.newSignalTriggerId < globalRefreshTrigger) {
        signalInfo.newSignalTriggerId = null;
      }
    }
  }, [globalRefreshTrigger, instrument.id]);

  // Effect to run analysis on global refresh
  useEffect(() => { 
    if (globalRefreshTrigger !== lastRefreshTriggerRef.current) {
      lastRefreshTriggerRef.current = globalRefreshTrigger;
      if (!activeTrade) {
          performAnalysis();
      }
    }
  }, [globalRefreshTrigger, performAnalysis, activeTrade]);
  
  const handleTakeTrade = (direction: 'buy' | 'sell') => {
    setActiveTrade({ 
      entryPrice: currentPrice, 
      direction,
      tp: tradeSetup?.tp
    });
  };

  const handleCloseTrade = () => {
    setActiveTrade(null);
    performAnalysis();
  };

  const getActionColor = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (isLoading) return 'text-neutral-700 border-white/5';
    if (action === ActionType.MERCADO_CERRADO) return 'text-neutral-500 bg-black/40 border-neutral-800/50';
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
        if (mainSignal === SignalType.SALE) return 'text-rose-400 bg-rose-500/20 border-rose-400 precision-alert-blink font-black ring-1 ring-rose-500/50';
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-400 precision-alert-blink font-black ring-1 ring-emerald-500/50';
    }
    switch(action) {
      case ActionType.SALIR: return 'text-rose-400 bg-rose-500/20 border-rose-400 font-black precision-alert-blink ring-1 ring-rose-500/50';
      case ActionType.ESPERAR: return 'text-amber-400 bg-amber-500/10 border-amber-400/50';
      default: return 'text-neutral-500 bg-white/5 border-white/5';
    }
  };

  const getActionText = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
      return mainSignal === SignalType.SALE ? 'VENDER' : 'COMPRAR';
    }
    if (action === ActionType.MERCADO_CERRADO) return '🔒 CERRADO';
    return action || 'STANDBY';
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-neutral-600';
  };
  
  const getRRColor = (rr?: number) => {
    if (!rr) return 'text-neutral-400';
    if (rr >= 2.5) return 'text-cyan-300'; // A+ signal
    if (rr >= 2.0) return 'text-emerald-400'; // Exceptional
    return 'text-amber-400'; // High quality base
  };

  const getSignalDotColor = (tf: Timeframe) => {
    if (isLoading || !analysis || !analysis.signals) return 'bg-neutral-800';
    const sig = analysis.signals[tf];
    if (sig === SignalType.BUY) return 'bg-emerald-500';
    if (sig === SignalType.SALE) return 'bg-rose-500';
    return 'bg-neutral-800';
  };
  
  const calculatePL = () => {
    if (!activeTrade || !currentPrice) return { value: 0, color: 'text-neutral-400', prefix: '' };
    const pl = ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100 * (activeTrade.direction === 'buy' ? 1 : -1);
    const absValue = Math.abs(pl);
    return {
        value: absValue,
        color: pl >= 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        prefix: pl >= 0 ? '+' : '-'
    };
  };

  const checkTPStatus = () => {
    if (!activeTrade || !currentPrice || !activeTrade.tp) {
      // Debug: verificar por qué no hay TP
      if (activeTrade && !activeTrade.tp) {
        console.log(`[${instrument.symbol}] Trade activo SIN TP guardado:`, { 
          entryPrice: activeTrade.entryPrice, 
          direction: activeTrade.direction,
          tp: activeTrade.tp 
        });
      }
      return null;
    }
    
    const isBuy = activeTrade.direction === 'buy';
    const tpReached = isBuy ? currentPrice >= activeTrade.tp : currentPrice <= activeTrade.tp;
    
    // Verificar si está cerca del TP (dentro del 0.1%)
    const distanceToTP = Math.abs(currentPrice - activeTrade.tp) / activeTrade.tp * 100;
    const nearTP = distanceToTP <= 0.1 && !tpReached;
    
    // Verificar si falló (precio se movió 2% en contra)
    const currentPL = ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100 * (isBuy ? 1 : -1);
    const failed = currentPL <= -2.0;
    
    // Debug logging
    console.log(`[${instrument.symbol}] TP Check:`, {
      currentPrice,
      entryPrice: activeTrade.entryPrice,
      tp: activeTrade.tp,
      direction: activeTrade.direction,
      tpReached,
      distanceToTP: distanceToTP.toFixed(3) + '%',
      currentPL: currentPL.toFixed(2) + '%'
    });
    
    if (tpReached) return { status: 'achieved', label: 'TP ALCANZADO', color: 'bg-cyan-500/30 text-cyan-300 border-cyan-400 animate-pulse' };
    if (nearTP) return { status: 'near', label: 'CERCA TP', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
    if (failed) return { status: 'failed', label: 'STOP SUGERIDO', color: 'bg-rose-500/30 text-rose-300 border-rose-400 animate-pulse' };
    
    return null;
  };

  const marketOpen = isMarketOpen(instrument.type, instrument.symbol);
  const pl = calculatePL();
  const tpStatus = checkTPStatus();
  const isHighSignal = analysis?.action === ActionType.ENTRAR_AHORA && (analysis?.powerScore || 0) >= 85;
  const profitInfo = tradeSetup ? calculateProfitDisplay(tradeSetup.tp, tradeSetup.entry, instrument) : null;

  const getChartButtonClass = () => {
    if (chartStatus === 'visible') {
      return 'bg-emerald-500/20 text-emerald-400';
    }
    if (chartStatus === 'minimized') {
      return 'bg-amber-500/20 text-amber-400 animate-pulse';
    }
    return 'hover:bg-emerald-500/20 text-neutral-500 group-hover:text-emerald-400';
  };

  return (
    <div className={`flex items-center justify-between p-3 px-4 rounded-2xl border transition-all duration-500 
      ${isBookmarked ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/[0.03] border-white/5'}
      hover:bg-white/[0.06] hover:border-white/10`}>
      
      <div className="flex items-center justify-center w-16">
        <div className="h-7 w-12 rounded-full transition-all duration-300 flex items-center p-1 bg-neutral-800 border border-white/5">
          <div className={`h-5 w-5 rounded-full shadow-lg transition-all duration-500 ${isLoading ? 'bg-amber-500 animate-pulse' : (!marketOpen ? 'bg-neutral-600 translate-x-0' : 'bg-emerald-500 translate-x-5')}`} />
        </div>
      </div>

      <div className="flex flex-col w-1/4">
        <div className="flex items-center space-x-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white text-lg tracking-tight">{instrument.symbol}</span>
                {newSignalTriggerId === globalRefreshTrigger && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-cyan-400 text-black animate-pulse">
                        NOW
                    </span>
                )}
            </div>
            <span className="text-[9px] text-neutral-500 font-medium leading-none mt-0.5">{instrument.name}</span>
          </div>
          <button onClick={() => onOpenChart(instrument.symbol)} className={`p-1.5 rounded-lg transition-colors group cursor-pointer ${getChartButtonClass()}`} title="Abrir Gráfico">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
          </button>
          {currentPrice > 0 && <span className="text-[13px] font-mono text-white/90 font-bold ml-auto">${currentPrice.toLocaleString()}</span>}
        </div>
        <span className="text-[8px] text-neutral-600 font-black uppercase tracking-widest">{instrument.type}</span>
      </div>

      <div className="flex space-x-4 w-1/5 justify-center">
        {(['4h', '1h', '15min', '5min'] as Timeframe[]).map(tf => (
          <div key={tf} className="flex flex-col items-center">
            <span className="text-[7px] text-neutral-500 font-bold mb-1 uppercase">{tf}</span>
            <div className={`h-2 w-8 rounded-full transition-all duration-700 ${getSignalDotColor(tf)}`}></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center w-16">
        <span className={`text-xl font-mono font-black ${getScoreColor(analysis?.powerScore || 0)}`}>
            {isLoading ? '---' : `${analysis?.powerScore || 0}`}
        </span>
        <span className="text-[7px] text-neutral-700 font-bold uppercase tracking-tighter">Score</span>
      </div>

      <div className="w-48">
        {tradeSetup && isHighSignal && (
            <button
              onClick={() => handleCopyTradeSetup(tradeSetup)}
              className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono h-full w-full text-left group hover:bg-white/10 transition-colors"
            >
              {copyStatus ? (
                <div className="w-full text-center flex-grow">
                  <span className="text-emerald-400 font-bold text-xs">¡COPIADO E & P!</span>
                </div>
              ) : (
                <>
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-500 group-hover:text-neutral-300 transition-colors">E:</span>
                      <span className="text-emerald-400 font-bold">{tradeSetup.entry.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-500 group-hover:text-neutral-300 transition-colors">P:</span>
                      <span className="text-amber-400 font-bold">{tradeSetup.tp.toFixed(4)}</span>
                    </div>
                  </div>
                  {profitInfo && tradeSetup.rr && (
                    <div className="flex flex-col items-center justify-center pl-3 border-l border-white/10 ml-3">
                      <span className={`text-xl font-black leading-none ${getRRColor(tradeSetup.rr)}`}>
                        {profitInfo.value}
                      </span>
                      <span className="text-[8px] font-bold text-neutral-500 leading-none tracking-tighter mt-0.5">
                        {profitInfo.unit}
                      </span>
                    </div>
                  )}
                </>
              )}
            </button>
        )}
      </div>

      <div className="flex flex-col items-center justify-center w-24 text-center">
        {marketOpen ? <span className="text-[11px] font-black uppercase text-emerald-500 tracking-wider">ABIERTO</span> : <span className="text-[11px] font-black uppercase text-neutral-600 tracking-wider">CERRADO</span>}
      </div>

      <div className="flex items-center justify-center w-48 space-x-2">
        {isLoading && !activeTrade ? (
            <div className={`px-4 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest w-[110px] text-center ${getActionColor()}`}>
                <div className="flex items-center justify-center space-x-2"><span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span><span>SCAN</span></div>
            </div>
        ) : (
            <div className="flex items-center space-x-2">
                <button
                    onClick={isHighSignal && !activeTrade ? () => handleTakeTrade(analysis.mainSignal === SignalType.SALE ? 'sell' : 'buy') : undefined}
                    disabled={!!activeTrade}
                    className={`px-4 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest w-[110px] text-center transition-all duration-300
                    ${getActionColor(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
                    ${activeTrade ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                >
                    {getActionText(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
                </button>

                {activeTrade && (
                    <div className="flex items-center justify-center space-x-2">
                        {tpStatus && (
                            <div className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${tpStatus.color}`}>
                                {tpStatus.label}
                            </div>
                        )}
                        <div className={`flex items-center gap-1 text-xs font-mono font-bold px-3 py-1 rounded-full border ${pl.color}`}>
                            <span className="text-sm">{pl.prefix}</span>
                            <span>{pl.value.toFixed(2)}%</span>
                        </div>
                        <button onClick={handleCloseTrade} title="Close Trade" className="p-1.5 rounded-full bg-neutral-700/50 text-neutral-400 hover:bg-rose-500/30 hover:text-rose-300 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="w-10 flex justify-center items-center">
        <button onClick={toggleBookmark} className={`transition-all duration-300 transform hover:scale-125 ${isBookmarked ? 'text-emerald-500' : 'text-neutral-800 hover:text-neutral-600'}`}>
          <svg className="w-6 h-6" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
      </div>
    </div>
  );
};

export default memo(InstrumentRow);