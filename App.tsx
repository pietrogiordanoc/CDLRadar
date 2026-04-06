import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ALL_INSTRUMENTS, REFRESH_INTERVAL_MS } from './constants.tsx';
import { STRATEGIES } from './utils/tradingLogic';
import { MultiTimeframeAnalysis, ActionType } from './types';
import InstrumentRow, { GlobalAnalysisCache } from './components/InstrumentRow';
import TimerDonut from './components/TimerDonut';
import TradingViewModal from './components/TradingViewModal';
import TendencialModal from './components/TendencialModal';
import Radar from './components/Radar';
import SessionMonitor from './components/SessionMonitor';
import TelegramConnect from './components/TelegramConnect';
import { audioService } from './utils/audioService';
import { telegramService } from './utils/telegramService';
import { PriceStore } from './services/twelveDataService';
import { supabase } from './services/supabaseClient';

type SortConfig = { key: 'symbol' | 'action' | 'signal' | 'price' | 'score'; direction: 'asc' | 'desc' } | null;

interface DemoTrade {
  id: string;
  symbol: string;
  instrumentType: 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto';
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
  const [audioReady, setAudioReady] = useState(() => localStorage.getItem('audioActivated') === 'true');
  const [isRadarVisible, setIsRadarVisible] = useState(false);
  const [isTendencialModalVisible, setIsTendencialModalVisible] = useState(false);
  const [showActiveTradesOnly, setShowActiveTradesOnly] = useState(false);
  const [refreshJustCompleted, setRefreshJustCompleted] = useState(false);
  const [demoBalanceInput, setDemoBalanceInput] = useState('10000');
  const [showDemoScreener, setShowDemoScreener] = useState(false);
  const [showDebugFrames, setShowDebugFrames] = useState(false);
  const [demoTradesTab, setDemoTradesTab] = useState<'active' | 'closed'>('active');
  const [demoRiskInput, setDemoRiskInput] = useState(() => {
    const saved = localStorage.getItem('demoAccount');
    if (saved) {
      const account = JSON.parse(saved);
      return account.riskPercentage?.toString() || '2';
    }
    return '2';
  });
  
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
  
  const [userId, setUserId] = useState<string | null>(null);
  
  const analysesRef = useRef<Record<string, MultiTimeframeAnalysis>>({});
  const [forceUpdateTrigger, forceUpdate] = useState(0);

  // Formatear números con punto como separador de miles (formato español)
  const formatNumber = (num: number, decimals: number = 0): string => {
    const parts = num.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimals > 0 ? parts.join(',') : parts[0];
  };

  // Guardar demoAccount en localStorage
  useEffect(() => {
    localStorage.setItem('demoAccount', JSON.stringify(demoAccount));
  }, [demoAccount]);

  const handleActivateDemo = () => {
    const balance = parseFloat(demoBalanceInput) || 10000;
    const risk = parseFloat(demoRiskInput) || 2;
    setDemoAccount({
      enabled: true,
      initialBalance: balance,
      currentBalance: balance,
      riskPercentage: risk,
      trades: []
    });
  };

  const updateDemoRisk = () => {
    const newRisk = parseFloat(demoRiskInput) || 2;
    setDemoAccount(prev => ({
      ...prev,
      riskPercentage: Math.max(0.1, Math.min(10, newRisk))
    }));
  };

  const handleDemoTrade = useCallback((symbol: string, instrumentType: 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto', direction: 'buy' | 'sell', entry: number, tp: number) => {
    if (!demoAccount.enabled) return null;

    const riskAmount = demoAccount.currentBalance * (demoAccount.riskPercentage / 100);
    const stopDistance = Math.abs(tp - entry) * 0.5; // SL a mitad de distancia al TP
    const positionSize = riskAmount / stopDistance;

    console.log('Demo Trade Opened:', {
      symbol,
      instrumentType,
      direction,
      entry,
      tp,
      currentBalance: demoAccount.currentBalance,
      riskPercentage: demoAccount.riskPercentage,
      riskAmount,
      stopDistance,
      positionSize
    });

    const trade: DemoTrade = {
      id: `${symbol}-${Date.now()}`,
      symbol,
      instrumentType,
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

      console.log('Demo Trade Closed:', {
        symbol: trade.symbol,
        direction: trade.direction,
        entry: trade.entry,
        exit: currentPrice,
        priceChange,
        positionSize: trade.positionSize,
        profit,
        balanceBefore: prev.currentBalance,
        balanceAfter: prev.currentBalance + profit
      });

      const updatedTrades = prev.trades.map(t => 
        t.id === tradeId 
          ? { ...t, closed: true, closeTime: Date.now(), profit }
          : t
      );

      // Forzar actualización de UI después de cerrar el trade
      setTimeout(() => forceUpdate(t => t + 1), 0);

      return {
        ...prev,
        currentBalance: prev.currentBalance + profit,
        trades: updatedTrades
      };
    });
  }, []);

  const resetDemoAccount = () => {
    setDemoAccount({
      enabled: false,
      initialBalance: 10000,
      currentBalance: 10000,
      riskPercentage: 2,
      trades: []
    });
    setDemoBalanceInput('10000');
  };

  // Calcular estadísticas de sesión
  const demoStats = useMemo(() => {
    const sessionTrades = demoAccount.trades.filter(t => t.closed);
    const activeTrades = demoAccount.trades.filter(t => !t.closed);
    
    // Calcular P&L flotante de trades activos
    let floatingPL = 0;
    activeTrades.forEach(trade => {
      const currentPrice = PriceStore[trade.symbol];
      if (currentPrice && currentPrice > 0) {
        const priceChange = trade.direction === 'buy'
          ? (currentPrice - trade.entry)
          : (trade.entry - currentPrice);
        floatingPL += priceChange * trade.positionSize;
      }
    });
    
    // Balance realizado + P&L flotante
    const realizedPL = demoAccount.currentBalance - demoAccount.initialBalance;
    const totalPL = realizedPL + floatingPL;
    const currentEquity = demoAccount.currentBalance + floatingPL;
    const plPercentage = (totalPL / demoAccount.initialBalance) * 100;
    
    const wins = sessionTrades.filter(t => (t.profit || 0) > 0).length;
    const losses = sessionTrades.filter(t => (t.profit || 0) < 0).length;
    const winRate = sessionTrades.length > 0 ? (wins / sessionTrades.length) * 100 : 0;
    
    return {
      totalPL,
      plPercentage,
      currentEquity,
      floatingPL,
      realizedPL,
      totalTrades: sessionTrades.length,
      wins,
      losses,
      winRate,
      activeTrades: activeTrades.length
    };
  }, [demoAccount, forceUpdateTrigger]);

  // Forzar actualización cada 5s para reflejar P&L flotante en tiempo real
  useEffect(() => {
    if (!demoAccount.enabled || demoAccount.trades.filter(t => !t.closed).length === 0) return;
    
    const interval = setInterval(() => {
      forceUpdate(t => t + 1);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [demoAccount.enabled, demoAccount.trades]);

  useEffect(() => {
    localStorage.setItem('alertVolume', volume.toString());
    audioService.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    audioService.setVolume(volume);
  }, []);

  // Listener para Shift + F10 (toggle debug frames)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        setShowDebugFrames(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // TELEGRAM TEMPORALMENTE DESACTIVADO
  /*
  // Inicializar Telegram service con userId (genera uno único si no hay sesión)
  useEffect(() => {
    const isInIframe = window.self !== window.top;
    
    const initTelegram = async () => {
      // Si estamos en iframe, ESPERAR el postMessage del portal (máx 3 segundos)
      if (isInIframe) {
        console.log('[Radar] En iframe - esperando autenticación del Portal...');
        // Esperar 3 segundos para que llegue el postMessage
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verificar si el postMessage ya autenticó
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('[Radar] Autenticado via postMessage:', user.id);
          return; // El postMessage ya manejó la inicialización
        } else {
          console.log('[Radar] No se recibió autenticación del Portal, iniciando como anónimo');
        }
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      let id: string;
      let isPaid = false;
      
      if (user) {
        // Usuario autenticado
        id = user.id;
        
        // Obtener plan del usuario
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', user.id)
          .single();
        
        isPaid = profile?.plan === 'paid';
      } else {
        // Usuario anónimo: generar ID único persistente
        const stored = localStorage.getItem('cdl_radar_visitor_id');
        if (stored) {
          id = stored;
        } else {
          // Generar nuevo ID único
          id = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          localStorage.setItem('cdl_radar_visitor_id', id);
        }
      }
      
      setUserId(id);
      await telegramService.initialize(id);
      
      // DESCONEXIÓN AUTOMÁTICA PARA FREEMIUM AL CERRAR NAVEGADOR
      const handleBeforeUnload = async () => {
        if (!isPaid && telegramService.isConnected()) {
          // Freemium: desconectar sin mensaje (silencioso)
          await telegramService.disconnectSilent(id);
        }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      // Cleanup
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    };
    initTelegram();
  }, []);
  */

  // TELEGRAM TEMPORALMENTE DESACTIVADO - postMessage
  /*
  // Recibir token del portal (cuando está embebido en iframe)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Validar origen (solo del portal)
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type !== 'PORTAL_SESSION') return;
      
      console.log('[Radar] Recibido token del portal');
      
      try {
        const { token, userId } = event.data;
        if (!token || !userId) return;
        
        // Autenticar con el token recibido
        const { data, error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: '' // El portal maneja el refresh
        });
        
        if (!error && data.user) {
          console.log('[Radar] Autenticado con token del portal:', data.user.id);
          
          // LIMPIAR visitor_id de localStorage (ya no es anónimo)
          const oldVisitorId = localStorage.getItem('cdl_radar_visitor_id');
          localStorage.removeItem('cdl_radar_visitor_id');
          
          // ELIMINAR conexión antigua de Telegram si había visitor_id
          if (oldVisitorId) {
            console.log('[Radar] Limpiando conexión visitor antigua:', oldVisitorId);
            await supabase
              .from('telegram_connections')
              .delete()
              .eq('user_id', oldVisitorId);
          }
          
          // Actualizar userId con el UUID del portal
          setUserId(data.user.id);
          
          // Reinicializar Telegram con el userId correcto
          await telegramService.initialize(data.user.id);
          
          // Obtener plan para beforeunload
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', data.user.id)
            .single();
          
          const isPaid = profile?.plan === 'paid';
          
          // Configurar beforeunload con el plan correcto
          const handleBeforeUnload = async () => {
            if (!isPaid && telegramService.isConnected()) {
              await telegramService.disconnectSilent(data.user.id);
            }
          };
          
          window.addEventListener('beforeunload', handleBeforeUnload);
        }
      } catch (error) {
        console.error('[Radar] Error procesando token del portal:', error);
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
  */

  // Auto-activar audio en el primer click del usuario (bypass autoplay policy)
  useEffect(() => {
    if (audioReady) return; // Ya activado previamente

    const activateAudio = async () => {
      // Asegurar que el contexto está inicializado
      audioService.initialize();
      const ctx = audioService.getContext();
      console.log('[AudioService] Estado del contexto:', ctx?.state);
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
        console.log('[AudioService] AudioContext resumed');
      }
      setAudioReady(true);
      localStorage.setItem('audioActivated', 'true');
    };

    const handleFirstInteraction = () => {
      activateAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [audioReady]);

  // Reanudar AudioContext cuando la página vuelve a estar visible (al cambiar de escritorio/pestaña)
  useEffect(() => {
    if (!audioReady) return; // Solo si ya fue activado

    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        const ctx = audioService.getContext();
        if (ctx && ctx.state === 'suspended') {
          try {
            await ctx.resume();
            console.log('[AudioService] AudioContext reanudado al volver a la pestaña');
          } catch (error) {
            console.error('[AudioService] Error al reanudar:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [audioReady]);

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
      // Mantener todos los charts existentes como están y agregar/mostrar el nuevo
      return {
        ...prev,
        [symbol]: 'visible'
      };
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

  // Calcular estadísticas de actividad del mercado
  const marketQuietnessStats = useMemo(() => {
    const visibleInstruments = ALL_INSTRUMENTS.filter(i => isInstrumentVisible(i));
    const totalConnected = visibleInstruments.length;
    
    let waiting = 0;
    let entering = 0;
    let exiting = 0;
    
    visibleInstruments.forEach(inst => {
      const analysis = GlobalAnalysisCache[inst.id]?.analysis;
      if (analysis) {
        if (analysis.action === ActionType.ESPERAR) waiting++;
        else if (analysis.action === ActionType.ENTRAR_AHORA) entering++;
        else if (analysis.action === ActionType.SALIR) exiting++;
      } else {
        waiting++; // Si no hay análisis, cuenta como waiting
      }
    });
    
    const quietPercentage = totalConnected > 0 ? Math.round((waiting / totalConnected) * 100) : 0;
    
    return { totalConnected, waiting, entering, exiting, quietPercentage };
  }, [forceUpdateTrigger, filter, searchQuery, showActiveTradesOnly]);

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

  // Detectar si hay algún chart visible para ajustar z-index del header
  const hasVisibleChart = Object.values(charts).some(status => status === 'visible');

  return (
    <div className="min-h-screen pb-24 bg-[#050505] text-white selection:bg-emerald-500/30">
      {/* Mensaje de activación de audio */}
      {!audioReady && (
        <div className="fixed top-4 right-4 z-[500] px-4 py-2 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/40 rounded-lg shadow-lg backdrop-blur-sm animate-pulse">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <span className="text-xs font-medium text-orange-300">Click anywhere to enable audio alerts</span>
          </div>
        </div>
      )}

      <header className={`sticky top-0 bg-[#050505]/95 backdrop-blur-2xl border-b border-white/5 px-4 md:px-8 py-3 md:py-5 ${showDemoScreener ? 'z-[250]' : hasVisibleChart ? 'z-50' : 'z-[150]'}`}>
        <div className="max-w-[1500px] mx-auto flex flex-col items-start md:items-center md:flex-row justify-between gap-3 md:gap-6">
          <div className={`flex items-center space-x-3 md:space-x-4 p-1 md:p-2 relative ${showDebugFrames ? 'border-2 border-red-500' : ''}`}>
            {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-2 text-xs text-red-500 z-50">HEADER-1: LOGO</span>}
            <div 
              className="relative w-10 h-10 md:w-14 md:h-14 cursor-pointer group"
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
              <h1 className="text-lg md:text-2xl font-black tracking-tighter text-white uppercase">CDLRadar V5.8</h1>
              <div className="flex items-center space-x-2">
                <span className="h-1.5 w-1.5 md:h-2 md:w-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-neutral-500">Live Market Scanner</span>
              </div>
            </div>
          </div>

          <div className={`flex flex-wrap items-center gap-2 md:space-x-6 md:gap-0 p-1 md:p-2 relative w-full md:w-auto ${showDebugFrames ? 'border-2 border-green-500' : ''}`}>
            {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-2 text-xs text-green-500 z-50">HEADER-3: CONTROLS</span>}
            {/* Paper Money Demo */}
            {!demoAccount.enabled ? (
              <div className="flex items-center gap-1.5 md:gap-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-lg md:rounded-xl px-2 md:px-3 py-1.5 md:py-2 relative text-xs md:text-sm">
                {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-1 text-[9px] text-purple-400 z-50">H3A-PaperMoney</span>}
                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-cyan-400 hidden md:inline">Paper Money</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400 md:hidden">Demo</span>
                <input
                  type="text"
                  value={demoBalanceInput}
                  onChange={(e) => setDemoBalanceInput(e.target.value)}
                  placeholder="10000"
                  className="w-16 md:w-24 bg-black/30 border border-white/10 rounded px-1.5 md:px-2 py-0.5 md:py-1 text-xs md:text-sm text-white font-normal focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  type="text"
                  value={demoRiskInput}
                  onChange={(e) => setDemoRiskInput(e.target.value)}
                  placeholder="2"
                  className="w-8 md:w-12 bg-black/30 border border-white/10 rounded px-1 md:px-2 py-0.5 md:py-1 text-xs md:text-sm text-white font-normal focus:outline-none focus:border-cyan-500/50"
                  title="Riesgo % por trade"
                />
                <span className="text-[7px] md:text-[8px] text-neutral-500">%</span>
                <button
                  onClick={handleActivateDemo}
                  className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-400 text-[9px] font-black uppercase tracking-widest border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors"
                >
                  Start
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-3 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-lg md:rounded-xl px-2 md:px-3 py-1.5 md:py-2 relative text-xs md:text-sm">
                {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-1 text-[9px] text-purple-400 z-50">H3A-PaperMoney</span>}
                <div className="flex flex-col">
                  <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-neutral-500">Paper Balance</span>
                  <div className="flex items-baseline gap-1 md:gap-2">
                    <span className="text-sm md:text-lg font-normal text-white">
                      ${formatNumber(demoStats.currentEquity, 2)}
                    </span>
                    <span className={`text-[10px] md:text-xs font-bold ${
                      demoStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {demoStats.totalPL >= 0 ? '+' : ''}{demoStats.plPercentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {demoStats.totalTrades > 0 && (
                  <div className="hidden md:flex flex-col border-l border-white/10 pl-3">
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
                  className="text-[7px] md:text-[8px] px-1.5 md:px-2 py-0.5 md:py-1 rounded bg-neutral-800/50 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors font-bold uppercase tracking-wider"
                  title="Reset paper account"
                >
                  Reset
                </button>
              </div>
            )}
            
            <div className="hidden md:flex items-center space-x-4 bg-white/5 p-2 px-3 rounded-xl border border-white/10 relative">
              {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-1 text-[9px] text-orange-400 z-50">H3B-Audio</span>}
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
                <button 
                  onClick={() => {
                    console.log('[Audio Test] Estado audioReady:', audioReady);
                    console.log('[Audio Test] Estado AudioContext:', audioService.getContext()?.state);
                    audioService.play('entry');
                  }}
                  className="px-2 py-1 text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded transition-colors"
                  title="Probar sonido de alerta"
                >
                  TEST
                </button>
                <div 
                  className={`w-2 h-2 rounded-full ${audioReady ? 'bg-emerald-500' : 'bg-yellow-500'}`}
                  title={audioReady ? 'Audio activado' : 'Haz click para activar audio'}
                ></div>
              </div>
              {/* Telegram temporalmente desactivado */}
              {/* <div className="h-6 w-px bg-white/10"></div> */}
              {/* {userId && <TelegramConnect userId={userId} />} */}
            </div>
            <div className={`p-1 relative ${showDebugFrames ? 'border-2 border-pink-500' : ''}`}>
              {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-1 text-[9px] text-pink-400 z-50">H3D-Timer</span>}
              <TimerDonut 
              durationMs={REFRESH_INTERVAL_MS} 
              onComplete={handleRefreshComplete} 
                isPaused={false}
              onClick={handleRefreshComplete}
            />
            </div>
          </div>
        </div>
        
        {/* HEADER-4: FILTERS + MENU ROW */}
        <div className={`max-w-[1500px] mx-auto px-4 md:px-8 py-2 relative ${showDebugFrames ? 'border-2 border-purple-500' : ''}`}>
          {showDebugFrames && <span className="absolute -top-3 left-4 md:left-8 bg-[#050505] px-2 text-xs text-purple-500 z-50">HEADER-4: FILTERS+MENU</span>}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-start gap-3 md:gap-4">
            {/* Search */}
            <input 
              type="text" 
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg md:rounded-xl px-3 md:px-4 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500/50 w-full md:w-[280px] transition-all"
            />
            
            {/* Separator - Hidden on mobile */}
            <div className="hidden md:block h-6 w-px bg-white/10"></div>
            
            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
              {(['all', 'forex', 'indices', 'stocks', 'commodities', 'crypto'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all duration-300 border whitespace-nowrap flex-shrink-0
                    ${filter === f 
                      ? 'bg-emerald-500 border-emerald-400 text-black' 
                      : 'bg-white/5 border-white/5 text-neutral-500 hover:text-white hover:bg-white/10'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            
            {/* Separator - Hidden on mobile */}
            <div className="hidden md:block h-6 w-px bg-white/10"></div>
            
            {/* Menu Buttons - Hidden on mobile */}
            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => setIsTendencialModalVisible(true)} className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Tendencial</button>
              <button className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Fundamentales</button>
              <button className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Calendario</button>
              <button className="text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest">Mercado Cripto</button>
            </div>
            
            {/* History Toggle Button - Only visible when demo account is active */}
            {demoAccount.enabled && (
              <>
                {/* Separator - Hidden on mobile */}
                <div className="hidden md:block h-6 w-px bg-white/10"></div>
                
                <button
                  onClick={() => setShowDemoScreener(!showDemoScreener)}
                  className="text-[9px] md:text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/40 transition-colors font-bold uppercase tracking-wider"
                >
                  {showDemoScreener ? 'Close History' : 'History'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 md:px-8 mt-4 md:mt-6">
        <SessionMonitor marketStats={marketQuietnessStats} />
        
        <div className="grid grid-cols-1 gap-3 md:gap-4">
          {/* Desktop table header - Hidden on mobile */}
          <div className="hidden md:flex items-center justify-start gap-4 px-4 py-3 bg-white/[0.02] rounded-xl border border-white/5 mb-4 text-[10px] uppercase tracking-widest text-neutral-600">
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
        {Object.entries(charts).map(([symbol, status], index) => {
          const instrument = ALL_INSTRUMENTS.find(i => i.symbol === symbol);
          const analysis = instrument ? analysesRef.current[instrument.id] : null;
          if (!instrument) return null;
          
          // Calcular índice para thumbnails (solo contar los minimizados antes de este)
          const minimizedBefore = Object.entries(charts)
            .slice(0, index)
            .filter(([_, s]) => s === 'minimized').length;
          
          return (
            <TradingViewModal
              key={symbol}
              instrument={instrument}
              tradeSetup={analysis?.tradeSetup || null}
              mainSignal={analysis?.mainSignal}
              isVisible={status === 'visible'}
              onMinimize={() => handleMinimizeChart(symbol)}
              onClose={() => handleCloseChart(symbol)}
              onExpand={() => handleOpenChart(symbol)}
              thumbnailIndex={status === 'minimized' ? minimizedBefore : 0}
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

      {/* Demo Screener Fullscreen */}
      {showDemoScreener && demoAccount.enabled && (
        <div className="fixed inset-0 z-[200] bg-[#050505] pt-[200px]">
          <div className="h-full w-full max-w-[1500px] mx-auto flex flex-col">
          
          {/* SECTIONS A + B: Stats & Top Instruments */}
          <div className="flex gap-6 px-6 border-b border-white/5 flex-shrink-0">
            
            {/* SECTION A: Stats */}
            <div className="flex-1">
              <div className={`flex items-center gap-6 text-[14px] py-1 relative ${showDebugFrames ? 'border-2 border-red-500' : ''}`}>
                {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-2 text-xs text-red-500">SECTION A: STATS</span>}
                
                <div className={`flex items-center gap-3 p-1 relative ${showDebugFrames ? 'border border-purple-400' : ''}`}>
                  {showDebugFrames && <span className="absolute -top-2 left-1 bg-[#050505] px-1 text-[9px] text-purple-400">A1-Balance</span>}
                  <div className="text-[11px] text-neutral-600">balance</div>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-600">${formatNumber(demoAccount.initialBalance, 0)}</span>
                    <span className="text-neutral-700">→</span>
                    <span className="text-white">${formatNumber(demoStats.currentEquity, 2)}</span>
                  </div>
                </div>
                
                <div className="h-8 w-px bg-white/10"></div>
                
                <div className={`flex items-center gap-3 p-1 relative ${showDebugFrames ? 'border border-orange-400' : ''}`}>
                  {showDebugFrames && <span className="absolute -top-2 left-1 bg-[#050505] px-1 text-[9px] text-orange-400">A2-PL</span>}
                  <div className="text-[11px] text-neutral-600">p&l</div>
                  <div className="flex items-center gap-2">
                    <span className={demoStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {demoStats.totalPL >= 0 ? '+' : ''}${formatNumber(Math.abs(demoStats.totalPL), 2)}
                    </span>
                    <span className={demoStats.totalPL >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}>
                      {demoStats.plPercentage >= 0 ? '+' : ''}{demoStats.plPercentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                
                <div className="h-8 w-px bg-white/10"></div>
                
                <div className={`flex items-center gap-3 p-1 relative ${showDebugFrames ? 'border border-pink-400' : ''}`}>
                  {showDebugFrames && <span className="absolute -top-2 left-1 bg-[#050505] px-1 text-[9px] text-pink-400">A3-WinRate</span>}
                  <div className="text-[11px] text-neutral-600">win rate</div>
                  <div className="flex items-center gap-3">
                    <span className="text-cyan-400">{demoStats.winRate.toFixed(0)}%</span>
                    <span className="text-emerald-400">{demoStats.wins}W</span>
                    <span className="text-rose-400">{demoStats.losses}L</span>
                  </div>
                </div>
                
                <div className="h-8 w-px bg-white/10"></div>
                
                <div className={`flex items-center gap-3 p-1 relative ${showDebugFrames ? 'border border-cyan-400' : ''}`}>
                  {showDebugFrames && <span className="absolute -top-2 left-1 bg-[#050505] px-1 text-[9px] text-cyan-400">A4-Risk</span>}
                  <div className="text-[11px] text-neutral-600">risk</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={demoRiskInput}
                      onChange={(e) => setDemoRiskInput(e.target.value)}
                      onBlur={updateDemoRisk}
                      step="0.1"
                      min="0.1"
                      max="10"
                      className="w-12 bg-neutral-900 border border-white/5 rounded px-1.5 py-0.5 text-[14px] text-white focus:outline-none focus:border-cyan-500/30"
                    />
                    <span className="text-neutral-600">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Separator vertical */}
            <div className="w-px bg-white/10"></div>

            {/* SECTION B: Top Instruments */}
            <div className="flex-1">
              <div className={`flex items-center gap-4 py-1 relative ${showDebugFrames ? 'border-2 border-blue-500' : ''}`}>
                {showDebugFrames && <span className="absolute -top-3 left-2 bg-[#050505] px-2 text-xs text-blue-500">SECTION B: TOP INSTRUMENTS</span>}
                <div className="flex-1">
                  {(() => {
                    const instrumentStats: Record<string, { trades: number; totalPL: number; wins: number; losses: number }> = {};
                    
                    demoAccount.trades.filter(t => t.closed).forEach(trade => {
                      if (!instrumentStats[trade.symbol]) {
                        instrumentStats[trade.symbol] = { trades: 0, totalPL: 0, wins: 0, losses: 0 };
                      }
                      instrumentStats[trade.symbol].trades++;
                      instrumentStats[trade.symbol].totalPL += trade.profit || 0;
                      if ((trade.profit || 0) > 0) instrumentStats[trade.symbol].wins++;
                      else instrumentStats[trade.symbol].losses++;
                    });

                    const sortedInstruments = Object.entries(instrumentStats).sort((a, b) => b[1].totalPL - a[1].totalPL);
                    const topInstruments = sortedInstruments.slice(0, 5);

                    return topInstruments.length > 0 ? (
                      <div className="flex items-center gap-3 text-[14px]">
                        <span className="text-neutral-600">top:</span>
                        {topInstruments.map(([symbol, stats]) => (
                          <div key={symbol} className="flex items-center gap-1.5">
                            <span className="text-white">{symbol}</span>
                            <span className={stats.totalPL >= 0 ? 'text-emerald-400 text-xs' : 'text-rose-400 text-xs'}>
                              {stats.totalPL >= 0 ? '+' : ''}${formatNumber(Math.abs(stats.totalPL), 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[14px] text-neutral-600">
                        no instruments yet
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5 flex-shrink-0">
            <button
              onClick={() => setDemoTradesTab('active')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                demoTradesTab === 'active'
                  ? 'bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500/40'
                  : 'bg-white/5 text-neutral-500 border-2 border-transparent hover:text-white hover:bg-white/10'
              }`}
            >
              Active Trades ({demoAccount.trades.filter(t => !t.closed).length})
            </button>
            <button
              onClick={() => setDemoTradesTab('closed')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                demoTradesTab === 'closed'
                  ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40'
                  : 'bg-white/5 text-neutral-500 border-2 border-transparent hover:text-white hover:bg-white/10'
              }`}
            >
              Closed Trades ({demoAccount.trades.filter(t => t.closed).length})
            </button>
          </div>

          {/* Trade List - Full Height con Scroll */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4">
              {demoTradesTab === 'active' ? (
                /* ACTIVE TRADES */
                <>
                  {demoAccount.trades.filter(t => !t.closed).length === 0 ? (
                    <div className="py-12 text-center text-[14px] text-neutral-600 border border-dashed border-white/5 rounded">
                      no active trades
                    </div>
                  ) : (
                  <div className="space-y-4">
                    {(() => {
                      const activeByInstrument: Record<string, any[]> = {};
                      
                      demoAccount.trades.filter(t => !t.closed).forEach(trade => {
                        if (!activeByInstrument[trade.symbol]) {
                          activeByInstrument[trade.symbol] = [];
                        }
                        activeByInstrument[trade.symbol].push(trade);
                      });

                      return Object.entries(activeByInstrument).map(([symbol, trades]) => {
                        const instrumentType = trades[0]?.instrumentType || 'unknown';
                        
                        return (
                          <div key={symbol} className="border border-cyan-500/30 rounded overflow-hidden bg-cyan-500/5">
                            {/* Header: Instrumento */}
                            <div className="grid grid-cols-3 gap-4 px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/20 text-[14px]">
                              <div>
                                <div className="text-white font-bold">{symbol}</div>
                                <div className="text-[10px] text-neutral-600">symbol</div>
                              </div>
                              <div>
                                <div className="text-cyan-400 uppercase text-xs">{instrumentType}</div>
                                <div className="text-[10px] text-neutral-600">type</div>
                              </div>
                              <div>
                                <div className="text-cyan-400">{trades.length} active</div>
                                <div className="text-[10px] text-neutral-600">trades</div>
                              </div>
                            </div>
                            
                            {/* Trades activos */}
                            <div>
                              {/* Headers de columnas */}
                              <div className="grid grid-cols-[40px_60px_60px_100px_100px_100px_80px_100px_100px_60px_50px] gap-4 px-4 py-2 bg-white/[0.01] border-b border-white/5 text-[11px] text-neutral-600">
                                <div>#</div>
                                <div>type</div>
                                <div>side</div>
                                <div className="text-right">entry</div>
                                <div className="text-right">tp</div>
                                <div className="text-right">size</div>
                                <div className="text-right">time</div>
                                <div className="text-right">open</div>
                                <div className="text-right">p&l</div>
                                <div className="text-right">%</div>
                                <div className="text-center">action</div>
                              </div>
                              
                              {trades.map((trade, idx) => {
                                const currentPrice = PriceStore[trade.symbol] || trade.entry;
                                const currentProfit = trade.direction === 'buy' 
                                  ? (currentPrice - trade.entry) * trade.positionSize
                                  : (trade.entry - currentPrice) * trade.positionSize;
                                const profitPercent = (currentProfit / trade.riskAmount) * 100;
                                const duration = Date.now() - trade.openTime;
                                const durationMins = Math.round(duration / 60000);
                                const openDate = new Date(trade.openTime);

                                return (
                                  <div key={trade.id} className="grid grid-cols-[40px_60px_60px_100px_100px_100px_80px_100px_100px_60px_50px] gap-4 px-4 py-2 border-b border-white/5 hover:bg-white/[0.02] text-[14px]">
                                    <div className="text-neutral-600">#{trades.length - idx}</div>
                                    <div className="text-neutral-500 text-xs uppercase">{trade.instrumentType}</div>
                                    <div className={trade.direction === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>
                                      {trade.direction}
                                    </div>
                                    <div className="text-right text-neutral-400">{trade.entry.toFixed(5)}</div>
                                    <div className="text-right text-neutral-400">{trade.tp.toFixed(5)}</div>
                                    <div className="text-right text-cyan-400">{formatNumber(trade.positionSize, 0)}</div>
                                    <div className="text-right text-cyan-400">{durationMins}m</div>
                                    <div className="text-right text-neutral-600">
                                      {openDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} {openDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className={`text-right font-bold ${currentProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {currentProfit >= 0 ? '+' : ''}${formatNumber(Math.abs(currentProfit), 2)}
                                    </div>
                                    <div className={`text-right ${currentProfit >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                      {profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(0)}%
                                    </div>
                                    <div className="text-center">
                                      <button 
                                        onClick={() => handleCloseDemoTrade(trade.id, currentPrice)}
                                        className="px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                        title="Close trade"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  )}
                </>
              ) : (
                /* CLOSED TRADES */
                <>
                  {demoAccount.trades.filter(t => t.closed).length === 0 ? (
                    <div className="py-12 text-center text-[14px] text-neutral-600 border border-dashed border-white/5 rounded">
                      no closed trades yet
                    </div>
                  ) : (
                  <div className="space-y-4">
                    {(() => {
                      const instrumentStats: Record<string, { trades: any[]; totalPL: number; wins: number; losses: number }> = {};
                      
                      demoAccount.trades.filter(t => t.closed).forEach(trade => {
                        if (!instrumentStats[trade.symbol]) {
                          instrumentStats[trade.symbol] = { trades: [], totalPL: 0, wins: 0, losses: 0 };
                        }
                        instrumentStats[trade.symbol].trades.push(trade);
                        instrumentStats[trade.symbol].totalPL += trade.profit || 0;
                        if ((trade.profit || 0) > 0) instrumentStats[trade.symbol].wins++;
                        else instrumentStats[trade.symbol].losses++;
                      });

                      const sortedInstruments = Object.entries(instrumentStats).sort((a, b) => b[1].totalPL - a[1].totalPL);

                      return sortedInstruments.map(([symbol, stats]) => {
                        const instrumentType = stats.trades[0]?.instrumentType || 'unknown';
                        
                        return (
                          <div key={symbol} className="border border-white/5 rounded overflow-hidden">
                            {/* Header: Instrumento y Stats */}
                            <div className="grid grid-cols-6 gap-4 px-4 py-2 bg-white/[0.03] border-b border-white/5 text-[14px]">
                              <div>
                                <div className="text-white font-bold">{symbol}</div>
                                <div className="text-[10px] text-neutral-600">symbol</div>
                              </div>
                              <div>
                                <div className="text-neutral-400 uppercase text-xs">{instrumentType}</div>
                                <div className="text-[10px] text-neutral-600">type</div>
                              </div>
                              <div>
                                <div className={stats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {stats.totalPL >= 0 ? '+' : ''}${formatNumber(Math.abs(stats.totalPL), 0)}
                                </div>
                                <div className="text-[10px] text-neutral-600">p&l</div>
                              </div>
                              <div>
                                <div className="text-neutral-400">{stats.trades.length}</div>
                                <div className="text-[10px] text-neutral-600">trades</div>
                              </div>
                              <div>
                                <div className="text-emerald-400">{stats.wins}</div>
                                <div className="text-[10px] text-neutral-600">wins</div>
                              </div>
                              <div>
                                <div className="text-rose-400">{stats.losses}</div>
                                <div className="text-[10px] text-neutral-600">losses</div>
                              </div>
                            </div>
                            
                            {/* Trades del instrumento */}
                            <div>
                              {/* Headers de columnas */}
                              <div className="grid grid-cols-[40px_60px_60px_100px_100px_100px_80px_100px_100px_60px] gap-4 px-4 py-2 bg-white/[0.01] border-b border-white/5 text-[11px] text-neutral-600">
                                <div>#</div>
                                <div>type</div>
                                <div>side</div>
                                <div className="text-right">entry</div>
                                <div className="text-right">tp</div>
                                <div className="text-right">size</div>
                                <div className="text-right">time</div>
                                <div className="text-right">open</div>
                                <div className="text-right">p&l</div>
                                <div className="text-right">%</div>
                              </div>
                              
                              {stats.trades
                                .sort((a, b) => (b.closeTime || 0) - (a.closeTime || 0))
                                .map((trade, idx) => {
                                  const profit = trade.profit || 0;
                                  const profitPercent = ((profit / trade.riskAmount) * 100);
                                  const duration = trade.closeTime && trade.openTime 
                                    ? Math.round((trade.closeTime - trade.openTime) / 60000) 
                                    : 0;
                                  const openDate = new Date(trade.openTime);

                                  return (
                                    <div key={trade.id} className="grid grid-cols-[40px_60px_60px_100px_100px_100px_80px_100px_100px_60px] gap-4 px-4 py-2 border-b border-white/5 hover:bg-white/[0.02] text-[14px]">
                                      <div className="text-neutral-600">#{stats.trades.length - idx}</div>
                                      <div className="text-neutral-500 text-xs uppercase">{trade.instrumentType}</div>
                                      <div className={trade.direction === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>
                                        {trade.direction}
                                      </div>
                                      <div className="text-right text-neutral-400">{trade.entry.toFixed(5)}</div>
                                      <div className="text-right text-neutral-400">{trade.tp.toFixed(5)}</div>
                                      <div className="text-right text-cyan-400">{formatNumber(trade.positionSize, 0)}</div>
                                      <div className="text-right text-neutral-600">{duration}m</div>
                                      <div className="text-right text-neutral-600">
                                        {openDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} {openDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                      <div className={`text-right ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {profit >= 0 ? '+' : ''}${formatNumber(Math.abs(profit), 2)}
                                      </div>
                                      <div className={`text-right ${profit >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                        {profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(0)}%
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default App;