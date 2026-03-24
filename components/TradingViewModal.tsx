import React, { useEffect, useRef, useState } from 'react';
import { Instrument, SignalType, TradeSetup } from '../types';

interface TradingViewModalProps {
  instrument: Instrument;
  tradeSetup?: TradeSetup | null;
  mainSignal?: SignalType;
  isVisible: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

const formatSetupValue = (value: number): string => {
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
};

const TradingViewModal: React.FC<TradingViewModalProps> = ({ instrument, tradeSetup, mainSignal, isVisible, onMinimize, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const initializedSymbolRef = useRef<string | null>(null);

  const handleClose = () => {
    // Resetear el ref cuando se cierra (X) para permitir reinicialización limpia
    initializedSymbolRef.current = null;
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    onClose();
  };

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Solo reinicializar si el símbolo cambió (no reinicializar al minimizar/maximizar)
    if (initializedSymbolRef.current === instrument.symbol) {
      return; // Widget ya inicializado para este símbolo, preservar dibujos
    }
    
    // Nuevo símbolo: limpiar y reinicializar
    containerRef.current.innerHTML = '';
    initializedSymbolRef.current = instrument.symbol;

    const { symbol, type } = instrument;
    let tvSymbol = symbol.replace('/', '');

    switch (type) {
      case 'forex':
        tvSymbol = `OANDA:${tvSymbol}`;
        break;
      case 'commodities':
        if (symbol === 'XAU/USD') tvSymbol = 'TVC:GOLD';
        else if (symbol === 'XAG/USD') tvSymbol = 'TVC:SILVER';
        else if (symbol === 'WTI') tvSymbol = 'TVC:USOIL';
        else if (symbol === 'CC') tvSymbol = 'ICEUS:CC1!'; // Cocoa
        else if (symbol === 'KC') tvSymbol = 'ICEUS:KC1!'; // Coffee
        else tvSymbol = `TVC:${tvSymbol}`;
        break;
      case 'indices':
        if (symbol === 'SPX') tvSymbol = 'SP:SPX';
        else if (symbol === 'IXIC') tvSymbol = 'NASDAQ:IXIC';
        else if (symbol === 'DJI') tvSymbol = 'DJ:DJI';
        else if (symbol === 'CAC') tvSymbol = 'TVC:CAC40';
        else if (symbol === 'DAX') tvSymbol = 'XETR:DAX';
        else if (symbol === 'FTSE') tvSymbol = 'FTSE:UKX';
        else if (symbol === 'N225') tvSymbol = 'TVC:NI225';
        else if (symbol === 'NDX') tvSymbol = 'NASDAQ:NDX';
        else if (symbol === 'HSI') tvSymbol = 'HSI:HSI';
        else if (symbol === 'KS11') tvSymbol = 'KRX:KOSPI';
        else if (symbol === 'BVSP') tvSymbol = 'BMFBOVESPA:IBOV';
        else if (symbol === 'STOXX50E') tvSymbol = 'STOXX:SX5E';
        else if (symbol === 'SSEC') tvSymbol = 'SSE:000001';
        else if (symbol === 'AXJO') tvSymbol = 'ASX:XJO';
        else if (symbol === 'RUT') tvSymbol = 'TVC:RUT';
        else tvSymbol = `TVC:${tvSymbol}`;
        break;
      case 'crypto':
        tvSymbol = symbol.replace('/', '');
        // Mapeo específico por disponibilidad en exchanges
        if (['BTC', 'ETH', 'SOL', 'LINK', 'AAVE', 'UNI', 'ALGO', 'XLM'].some(s => tvSymbol.startsWith(s))) {
          tvSymbol = `COINBASE:${tvSymbol}`;
        } else if (tvSymbol.startsWith('DOT')) {
          // DOT tiene mejor liquidez en Kraken
          tvSymbol = `KRAKEN:${tvSymbol}`;
        } else if (['BNB', 'XRP', 'ADA', 'FIL', 'TRX', 'ETC', 'BCH'].some(s => tvSymbol.startsWith(s))) {
          tvSymbol = `BINANCE:${tvSymbol}`;
        } else if (['XTZ', 'INJ', 'OP', 'ARB', 'APT', 'SUSHI', 'ICP', 'NEAR'].some(s => tvSymbol.startsWith(s))) {
          tvSymbol = `BINANCE:${tvSymbol}`;
        } else {
          // Default a BINANCE para tokens menos comunes
          tvSymbol = `BINANCE:${tvSymbol}`;
        }
        break;
      case 'stocks':
        // Stocks en NYSE
        if (symbol === 'TSM') tvSymbol = 'NYSE:TSM';
        else if (symbol === 'V') tvSymbol = 'NYSE:V';
        else if (symbol === 'ORCL') tvSymbol = 'NYSE:ORCL';
        else if (symbol === 'LLY') tvSymbol = 'NYSE:LLY';
        // El resto en NASDAQ
        else tvSymbol = `NASDAQ:${symbol}`;
        break;
      default:
        if (symbol.includes('/')) tvSymbol = `FX:${tvSymbol}`;
        break;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "15",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "hide_side_toolbar": false,
      "allow_symbol_change": false,
      "save_image": false,
      "withdateranges": true,
      "details": true,
      "calendar": false,
      "overrides": {
        // Set default cursor to Arrow. 0: Cross, 1: Dot, 2: Arrow
        "paneProperties.cursor": 2,
      },
      "support_host": "https://www.tradingview.com"
    });

    containerRef.current.appendChild(script);
    
  }, [instrument.symbol]);

  return (
    <div 
      className={`fixed inset-0 flex items-center justify-center transition-all duration-300 ${isVisible ? 'z-[100] bg-black/80 backdrop-blur-sm pointer-events-auto' : 'z-10 bg-transparent pointer-events-none opacity-0'}`}
      onClick={isVisible ? onMinimize : undefined}
    >
      <style>{`
        @keyframes modal-slide-up {
          from { opacity: 0; transform: translateY(50px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-modal-slide-up {
          animation: modal-slide-up 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>

      <div 
        className={`relative bg-[#131722] overflow-hidden shadow-2xl flex flex-col border-2 border-rose-500/50 transition-all duration-300 ease-in-out ${isMaximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-7xl h-[90vh] rounded-2xl'} ${isVisible ? 'animate-modal-slide-up' : ''}`}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        <div className="relative flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-lg font-bold tracking-tighter text-white">{instrument.symbol}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
              LIVE ADVANCED ENGINE
            </span>
          </div>

          {tradeSetup && (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
              <div className="flex items-center gap-4 text-sm font-mono">
                <span>E: {formatSetupValue(tradeSetup.entry)}</span>
                <span>TP: {formatSetupValue(tradeSetup.tp)}</span>
                <span>Δ: {formatSetupValue(Math.abs(tradeSetup.tp - tradeSetup.entry))}</span>
                {mainSignal && <span>{mainSignal === SignalType.SALE ? 'SELL' : 'BUY'}</span>}
              </div>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onMinimize(); }}
              className="p-2 text-neutral-500 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Minimize">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M20 12H4" /></svg>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMaximized(!isMaximized); }}
              className="p-2 text-neutral-500 hover:text-white hover:bg-white/10 rounded-md transition-colors" title={isMaximized ? "Restore" : "Maximize"}>
               {isMaximized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
               ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
               )}
            </button>
            <button 
              onClick={handleClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-rose-500/50 rounded-md transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="w-full flex-grow relative" key={`chart-${instrument.symbol}`}>
          <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
            <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingViewModal;