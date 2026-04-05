import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Bookmark, X } from 'lucide-react';
import { Instrument, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Strategy, Candlestick, TradeSetup } from '../types';
import { fetchTimeSeries, PriceStore, resampleCandles, isMarketOpen } from '../services/twelveDataService';
import { audioService } from '../utils/audioService';
import { telegramService } from '../utils/telegramService';

export const GlobalAnalysisCache: Record<string, { 
  analysis: MultiTimeframeAnalysis, 
  trigger: number, 
  newSignalTriggerId?: number | null, 
  lastAction?: ActionType | null,
  hasActiveTrade?: boolean 
}> = {};

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
  demoAccount?: any;
  onDemoTrade?: (symbol: string, instrumentType: 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto', direction: 'buy' | 'sell', entry: number, tp: number) => any;
  onCloseDemoTrade?: (tradeId: string, currentPrice: number) => void;
  refreshJustCompleted?: boolean;
}

type ActiveTrade = {
  entryPrice: number;
  direction: 'buy' | 'sell';
  tp?: number;
  demoTradeId?: string;
};

const ChartMonitorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="2.5" y="3" width="19" height="13" rx="2" />
    <path d="M8 21h8M10 16v5M14 16v5" />
    <path d="M5.5 13l4.2-2.7 1.8 1.3 3.4-3.6 2.6 1.6" />
    <path d="M7.5 11V8.7M11 12V9M14.5 9.4V6.8M18 11.2V8.5" />
  </svg>
);

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
  instrument, isConnected, onToggleConnect, globalRefreshTrigger, strategy, onAnalysisUpdate, isTestMode = false, onOpenChart, chartStatus, demoAccount, onDemoTrade, onCloseDemoTrade, refreshJustCompleted = false
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

  // 🟢 Sincronizar activeTrade con GlobalAnalysisCache para ordenamiento
  useEffect(() => {
    if (GlobalAnalysisCache[instrument.id]) {
      GlobalAnalysisCache[instrument.id].hasActiveTrade = activeTrade !== null;
    }
  }, [activeTrade, instrument.id]);

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
          // Alarma se dispara en useEffect vinculado al badge NOW
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

  // Disparar alarma cuando aparece el badge NOW
  useEffect(() => {
    if (newSignalTriggerId === globalRefreshTrigger) {
      const action = GlobalAnalysisCache[instrument.id]?.lastAction;
      const currentAnalysis = GlobalAnalysisCache[instrument.id]?.analysis;
      console.log(`[Alarma] Badge NOW visible para ${instrument.symbol}, acción: ${action}`);
      
      if (action === ActionType.ENTRAR_AHORA) {
        console.log(`[Alarma] 🔔 Disparando alarma de ENTRADA para ${instrument.symbol}`);
        playAlertSound('entry');
        
        // Enviar alerta a Telegram si está conectado
        if (telegramService.isConnected()) {
          const direction = currentAnalysis?.mainSignal === SignalType.SALE ? 'VENTA' : 'COMPRA';
          telegramService.sendSignal(
            instrument.symbol,
            direction,
            currentAnalysis?.powerScore || 0,
            instrument.type,
            tradeSetup?.entry,
            tradeSetup?.tp
          );
        }
      } else if (action === ActionType.SALIR) {
        console.log(`[Alarma] 🔔 Disparando alarma de SALIDA para ${instrument.symbol}`);
        playAlertSound('exit');
      }
    }
  }, [newSignalTriggerId, globalRefreshTrigger, instrument.id, instrument.symbol, instrument.type, tradeSetup, playAlertSound]);

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
    const trade: ActiveTrade = { 
      entryPrice: currentPrice, 
      direction,
      tp: tradeSetup?.tp
    };

    // Si demo está activo, crear trade demo
    if (demoAccount?.enabled && onDemoTrade && tradeSetup) {
      const demoTrade = onDemoTrade(instrument.symbol, instrument.type, direction, currentPrice, tradeSetup.tp);
      if (demoTrade) {
        trade.demoTradeId = demoTrade.id;
      }
    }

    setActiveTrade(trade);
    
    // 🟢 Actualizar cache global para ordenamiento
    if (GlobalAnalysisCache[instrument.id]) {
      GlobalAnalysisCache[instrument.id].hasActiveTrade = true;
    }
  };

  const handleCloseTrade = () => {
    // Si es trade demo, cerrar en el sistema demo
    if (activeTrade?.demoTradeId && onCloseDemoTrade) {
      onCloseDemoTrade(activeTrade.demoTradeId, currentPrice);
    }

    setActiveTrade(null);
    
    // 🟢 Actualizar cache global
    if (GlobalAnalysisCache[instrument.id]) {
      GlobalAnalysisCache[instrument.id].hasActiveTrade = false;
    }
    
    performAnalysis();
  };

  const getActionColor = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (isLoading) return 'text-neutral-700 border-white/5';
    if (action === ActionType.MERCADO_CERRADO) return 'text-neutral-600 bg-neutral-900 border-neutral-800';
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
        if (mainSignal === SignalType.SALE) return 'text-rose-400 bg-rose-500/10 border-rose-500/40';
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
    }
    switch(action) {
      case ActionType.SALIR: return 'text-rose-400 bg-rose-500/10 border-rose-500/40';
      case ActionType.ESPERAR: return 'text-neutral-400 bg-neutral-800/50 border-neutral-700';
      default: return 'text-neutral-600 bg-transparent border-neutral-800';
    }
  };

  const getActionText = (action?: ActionType, score: number = 0, mainSignal?: SignalType) => {
    if (action === ActionType.ENTRAR_AHORA && score >= 85) {
      return mainSignal === SignalType.SALE ? 'VENDER' : 'COMPRAR';
    }
    if (action === ActionType.MERCADO_CERRADO) return 'CERRADO';
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

  const getSignalQualityMessage = (rr?: number) => {
    if (!rr) return null;
    if (rr >= 2.5) return { label: 'A+  Setup premium', color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5' };
    if (rr >= 2.0) return { label: 'A   Alta calidad', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' };
    return { label: 'B   Estándar', color: 'text-neutral-400 border-neutral-700 bg-transparent' };
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

  const calculateTPProgress = () => {
    if (!activeTrade || !currentPrice || !activeTrade.tp) return null;
    
    const isBuy = activeTrade.direction === 'buy';
    const totalDistance = Math.abs(activeTrade.tp - activeTrade.entryPrice);
    const currentDistance = isBuy 
      ? (currentPrice - activeTrade.entryPrice)
      : (activeTrade.entryPrice - currentPrice);
    
    // Calcular progreso (puede ser negativo si va en contra)
    const progress = (currentDistance / totalDistance) * 100;
    const clampedProgress = Math.max(0, Math.min(100, progress)); // 0-100%
    
    // Determinar color basado en progreso
    let barColor = '';
    if (progress >= 100) barColor = 'bg-cyan-400'; // TP alcanzado
    else if (progress >= 75) barColor = 'bg-emerald-400'; // Muy cerca
    else if (progress >= 50) barColor = 'bg-amber-400'; // A mitad
    else if (progress >= 25) barColor = 'bg-yellow-500'; // Avanzando
    else if (progress >= 0) barColor = 'bg-orange-500'; // Poco avance
    else barColor = 'bg-rose-500'; // Perdiendo
    
    return {
      progress: clampedProgress,
      rawProgress: progress,
      barColor,
      distanceRemaining: totalDistance - currentDistance
    };
  };

  const marketOpen = isMarketOpen(instrument.type, instrument.symbol);
  const pl = calculatePL();
  const tpProgress = calculateTPProgress();
  const isHighSignal = analysis?.action === ActionType.ENTRAR_AHORA && (analysis?.powerScore || 0) >= 85;
  const profitInfo = tradeSetup ? calculateProfitDisplay(tradeSetup.tp, tradeSetup.entry, instrument) : null;

  const getChartButtonClass = () => {
    if (chartStatus === 'visible') {
      return 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400';
    }
    if (chartStatus === 'minimized') {
      return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
    }
    return 'bg-transparent border-neutral-800 text-neutral-700 hover:border-neutral-700 hover:text-neutral-400';
  };

  return (
    <>
      {/* Desktop Layout */}
      <div className={`hidden md:flex items-center justify-start gap-4 p-3 px-4 rounded-xl border transition-colors duration-200
        ${isBookmarked ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-white/[0.06]'}
        hover:bg-white/[0.04] hover:border-white/10
        ${refreshJustCompleted && activeTrade ? 'animate-pulse-slow' : ''}
        ${newSignalTriggerId === globalRefreshTrigger ? 'animate-pulse-new-signal' : ''}`}>
      
      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 0.8s ease-in-out 3;
        }
        @keyframes pulseNewSignal {
          0% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          1% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          2% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          3% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          4% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          5% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          6% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          7% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          8% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          9% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          10% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          11.5% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          13% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          15% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          17% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          19.5% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          22% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          25% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          28% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          32% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          36% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          42% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          48% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          56% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          64% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          74% { opacity: 0.4; background-color: rgba(6, 182, 212, 0.02); }
          84% { opacity: 1; background-color: rgba(6, 182, 212, 0.08); }
          100% { opacity: 1; background-color: transparent; }
        }
        .animate-pulse-new-signal {
          animation: pulseNewSignal 30s cubic-bezier(0.4, 0, 0.6, 1);
        }
      `}</style>
      
      <div className="flex items-center justify-center w-16">
        <div className="h-6 w-10 rounded-full transition-all duration-200 flex items-center p-0.5 bg-neutral-900 border border-neutral-800">
          <div className={`h-5 w-5 rounded-full transition-all duration-300 ${isLoading ? 'bg-neutral-600 translate-x-0' : (!marketOpen ? 'bg-neutral-700 translate-x-0' : 'bg-emerald-500 translate-x-4')}`} />
        </div>
      </div>

      <div className="flex flex-col w-[190px] shrink-0">
        <div className="flex items-center space-x-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <span className="font-mono text-white text-sm tracking-tight">{instrument.symbol}</span>
                {newSignalTriggerId === globalRefreshTrigger && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                        NOW
                    </span>
                )}
            </div>
            <span className="text-[9px] text-neutral-500 font-medium leading-none mt-0.5">{instrument.name}</span>
          </div>
        </div>
        <span className="text-[9px] text-neutral-700 uppercase tracking-widest">{instrument.type}</span>
      </div>

      <div className="w-[44px] shrink-0 flex items-center justify-center">
        <button onClick={() => onOpenChart(instrument.symbol)} className={`p-1 rounded border transition-colors ${getChartButtonClass()}`} title="Abrir gráfico">
          <ChartMonitorIcon className="w-7 h-7" />
        </button>
      </div>

      <div className="w-[90px] shrink-0 text-left">
        {currentPrice > 0 && <span className="text-xs font-mono text-neutral-300">${currentPrice.toLocaleString()}</span>}
      </div>

      <div className="flex space-x-4 w-[170px] shrink-0 justify-center">
        {(['4h', '1h', '15min', '5min'] as Timeframe[]).map(tf => (
          <div key={tf} className="flex flex-col items-center">
            <span className="text-[8px] text-neutral-600 mb-1 uppercase">{tf}</span>
            <div className={`h-1 w-7 rounded-sm transition-colors duration-200 ${getSignalDotColor(tf)}`}></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center w-14 shrink-0">
        <span className={`text-base font-mono ${getScoreColor(analysis?.powerScore || 0)}`}>
            {isLoading ? '--' : `${analysis?.powerScore || 0}`}
        </span>
        <span className="text-[8px] text-neutral-700 uppercase tracking-wider">Score</span>
      </div>

      <div className="w-[190px] shrink-0">
        {tradeSetup && isHighSignal && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleCopyTradeSetup(tradeSetup)}
                className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-[10px] font-mono w-full text-left hover:border-neutral-700 transition-colors"
              >
                {copyStatus ? (
                  <div className="w-full text-center">
                    <span className="text-neutral-300 text-[10px]">Copiado</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 flex-grow">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-600">E</span>
                        <span className="text-neutral-200">{tradeSetup.entry.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-600">TP</span>
                        <span className="text-neutral-200">{tradeSetup.tp.toFixed(4)}</span>
                      </div>
                    </div>
                    {profitInfo && tradeSetup.rr && (
                      <div className="flex flex-col items-center justify-center pl-3 border-l border-neutral-800 ml-3">
                        <span className={`text-base font-mono leading-none ${getRRColor(tradeSetup.rr)}`}>
                          {profitInfo.value}
                        </span>
                        <span className="text-[8px] text-neutral-600 leading-none mt-0.5">
                          {profitInfo.unit}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </button>
              
              {tradeSetup.rr && !copyStatus && (() => {
                const qualityMsg = getSignalQualityMessage(tradeSetup.rr);
                return qualityMsg ? (
                  <div className={`flex items-center px-2 py-1 rounded border text-[9px] font-mono ${qualityMsg.color}`}>
                    {qualityMsg.label}
                  </div>
                ) : null;
              })()}
            </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center w-[78px] shrink-0 text-center ml-auto">
        {marketOpen 
          ? <span className="text-[9px] uppercase text-emerald-500 tracking-widest">Abierto</span> 
          : <span className="text-[9px] uppercase text-neutral-700 tracking-widest">Cerrado</span>}
      </div>

      <div className="w-[120px] shrink-0 flex items-center justify-center">
        {isLoading && !activeTrade ? (
          <div className="w-[110px] px-4 py-1.5 rounded border border-neutral-800 text-[9px] text-neutral-600 text-center">
            Escaneando...
          </div>
        ) : (
          <button
            onClick={isHighSignal && !activeTrade ? () => handleTakeTrade(analysis.mainSignal === SignalType.SALE ? 'sell' : 'buy') : undefined}
            disabled={!!activeTrade}
            className={`w-[110px] px-4 py-1.5 rounded border text-[9px] uppercase tracking-wider text-center transition-colors duration-150
            ${getActionColor(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
            ${activeTrade ? 'opacity-30 cursor-not-allowed' : ''}
            `}
          >
            {getActionText(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
          </button>
        )}
      </div>

      <div className="w-[190px] shrink-0 flex items-center justify-center">
        {activeTrade ? (
          <div className="flex flex-col items-center justify-center gap-1.5 w-full">
            <div className="flex items-center justify-center gap-2">
              <div className={`flex items-center text-xs font-mono px-2 py-0.5 rounded border ${pl.color}`}>
                <span>{pl.prefix}{pl.value.toFixed(2)}%</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTrade();
                }} 
                title="Cerrar trade" 
                className="p-1 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {tpProgress && (
              <div className="w-full flex items-center gap-2">
                <div className="flex-grow h-px bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tpProgress.barColor} transition-all duration-500`}
                    style={{ width: `${tpProgress.progress}%` }}
                  />
                </div>
                <span className="text-[9px] text-neutral-600 font-mono tabular-nums min-w-[28px] text-right">
                  {tpProgress.rawProgress >= 0 ? Math.round(tpProgress.progress) : 0}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[22px]" />
        )}
      </div>

      <div className="w-10 flex justify-center items-center shrink-0">
        <button onClick={toggleBookmark} className={`p-1 rounded transition-colors ${isBookmarked ? 'text-neutral-300' : 'text-neutral-800 hover:text-neutral-600'}`}>
          <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>

    {/* Mobile Layout - Card Style */}
    <div className={`md:hidden flex flex-col gap-3 p-3 rounded-lg border transition-colors duration-200
      ${isBookmarked ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-white/[0.06]'}
      ${refreshJustCompleted && activeTrade ? 'animate-pulse-slow' : ''}
      ${newSignalTriggerId === globalRefreshTrigger ? 'animate-pulse-new-signal' : ''}`}>
      
      {/* Row 1: Symbol, Status, Bookmark */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-white text-sm tracking-tight">{instrument.symbol}</span>
            {newSignalTriggerId === globalRefreshTrigger && (
              <span className="px-1.5 py-0.5 rounded text-[7px] uppercase tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                NOW
              </span>
            )}
            <div className="h-4 w-7 rounded-full transition-all duration-200 flex items-center p-0.5 bg-neutral-900 border border-neutral-800 ml-auto">
              <div className={`h-3 w-3 rounded-full transition-all duration-300 ${isLoading ? 'bg-neutral-600 translate-x-0' : (!marketOpen ? 'bg-neutral-700 translate-x-0' : 'bg-emerald-500 translate-x-3')}`} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-neutral-500 font-medium">{instrument.name}</span>
            <span className="text-[8px] text-neutral-700 uppercase">{instrument.type}</span>
          </div>
        </div>
        <button onClick={toggleBookmark} className={`p-1 rounded transition-colors ${isBookmarked ? 'text-neutral-300' : 'text-neutral-800'}`}>
          <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Row 2: Price, Score, Chart */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {currentPrice > 0 && <span className="text-xs font-mono text-neutral-300">${currentPrice.toLocaleString()}</span>}
          <div className="flex flex-col items-center">
            <span className={`text-sm font-mono ${getScoreColor(analysis?.powerScore || 0)}`}>
              {isLoading ? '--' : `${analysis?.powerScore || 0}`}
            </span>
            <span className="text-[7px] text-neutral-700 uppercase">Score</span>
          </div>
        </div>
        <button onClick={() => onOpenChart(instrument.symbol)} className={`p-1 rounded border transition-colors ${getChartButtonClass()}`}>
          <ChartMonitorIcon className="w-6 h-6" />
        </button>
      </div>

      {/* Row 3: Action Button (full width) */}
      {isLoading && !activeTrade ? (
        <div className="w-full px-3 py-2 rounded border border-neutral-800 text-[9px] text-neutral-600 text-center">
          Escaneando...
        </div>
      ) : (
        <button
          onClick={isHighSignal && !activeTrade ? () => handleTakeTrade(analysis.mainSignal === SignalType.SALE ? 'sell' : 'buy') : undefined}
          disabled={!!activeTrade}
          className={`w-full px-3 py-2 rounded border text-[10px] uppercase tracking-wider text-center transition-colors duration-150
          ${getActionColor(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
          ${activeTrade ? 'opacity-30 cursor-not-allowed' : ''}
          `}
        >
          {getActionText(analysis?.action, analysis?.powerScore, analysis?.mainSignal)}
        </button>
      )}

      {/* Row 4: Trade Setup (if available) */}
      {tradeSetup && isHighSignal && (
        <button
          onClick={() => handleCopyTradeSetup(tradeSetup)}
          className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-[10px] font-mono w-full text-left"
        >
          {copyStatus ? (
            <span className="text-neutral-300 text-center w-full">Copiado</span>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-neutral-600">E: </span>
                  <span className="text-neutral-200">{tradeSetup.entry.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-neutral-600">TP: </span>
                  <span className="text-neutral-200">{tradeSetup.tp.toFixed(4)}</span>
                </div>
              </div>
              {profitInfo && (
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-mono ${getRRColor(tradeSetup.rr || 0)}`}>
                    {profitInfo.value}
                  </span>
                  <span className="text-[7px] text-neutral-600">{profitInfo.unit}</span>
                </div>
              )}
            </>
          )}
        </button>
      )}

      {/* Row 5: Active Trade P&L */}
      {activeTrade && (
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center justify-between">
            <div className={`flex items-center text-sm font-mono px-2 py-1 rounded border ${pl.color}`}>
              <span>{pl.prefix}{pl.value.toFixed(2)}%</span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTrade();
              }} 
              className="px-2 py-1 rounded text-xs bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            >
              Cerrar
            </button>
          </div>
          {tpProgress && (
            <div className="w-full flex items-center gap-2">
              <div className="flex-grow h-1 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${tpProgress.barColor} transition-all duration-500`}
                  style={{ width: `${tpProgress.progress}%` }}
                />
              </div>
              <span className="text-[9px] text-neutral-600 font-mono">
                {tpProgress.rawProgress >= 0 ? Math.round(tpProgress.progress) : 0}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
};

export default memo(InstrumentRow);