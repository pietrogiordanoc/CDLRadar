
export type Timeframe = '30s' | '5min' | '15min' | '1h' | '4h';

export interface EconomicEvent {
  event: string;
  date: string;
  impact: 'High' | 'Medium' | 'Low';
  previous?: string;
  estimate?: string;
}

export interface Instrument {
  id: string;
  name: string;
  symbol: string;
  type: 'forex' | 'indices' | 'stocks' | 'commodities' | 'crypto';
  marketStatus?: 'open' | 'closed';
  nextNews?: EconomicEvent | null;
}

export interface Candlestick {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export enum SignalType {
  BUY = 'COMPRA',
  SALE = 'VENTA',
  NEUTRAL = 'Neutral'
}

export enum ActionType {
  ENTRAR_AHORA = 'Entrar ahora',
  ESPERAR = 'Esperar',
  SALIR = 'Salir',
  NADA = 'Sin acción',
  NOTICIA = '⚠️ Noticia',
  MERCADO_CERRADO = '🔒 Cerrado'
}

export interface TradeSetup {
  entry: number;
  tp: number;
  rr?: number; // Risk/Reward multiplier
}

export interface MultiTimeframeAnalysis {
  symbol: string;
  price: number;
  signals: Partial<Record<Timeframe, SignalType>>;
  action: ActionType;
  mainSignal: SignalType;
  lastUpdated: number;
  isPrecisionMode?: boolean;
  powerScore?: number; // Score de 0 a 100
  tradeSetup?: TradeSetup | null;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  analyze: (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean, instrument?: Instrument) => MultiTimeframeAnalysis;
}