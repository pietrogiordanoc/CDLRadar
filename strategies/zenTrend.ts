
import { Candlestick, SignalType, ActionType, Timeframe, MultiTimeframeAnalysis } from '../types';
import { calculateSMA, calculateRSI } from '../utils/indicators';

export const analyzeZenTrend = (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean): MultiTimeframeAnalysis => {
  const detect = (candles: Candlestick[] | undefined): SignalType => {
    if (!candles || candles.length < 20) return SignalType.NEUTRAL;
    const closes = candles.map(c => c.close);
    const price = closes[closes.length - 1];
    const sma20 = calculateSMA(closes, 20);
    const rsi = calculateRSI(closes, 14);
    if (price > sma20 && rsi > 50) return SignalType.BUY;
    if (price < sma20 && rsi < 50) return SignalType.SALE;
    return SignalType.NEUTRAL;
  };

  const signals = {} as Record<Timeframe, SignalType>;
  const tfs: Timeframe[] = ['4h', '1h', '15min', '5min'];
  if (isPrecisionMode) tfs.push('30s');
  
  tfs.forEach(tf => signals[tf] = detect(data[tf]));

  let isAligned = signals['5min'] === signals['15min'] && signals['1h'] === signals['5min'];
  if (isPrecisionMode) isAligned = isAligned && signals['30s'] === signals['5min'];

  const action = isAligned ? ActionType.ENTRAR_AHORA : ActionType.ESPERAR;

  const m5 = data['5min'];
  return {
    symbol,
    price: m5 && m5.length > 0 ? m5[m5.length - 1].close : 0,
    signals,
    action,
    mainSignal: signals['5min'] || SignalType.NEUTRAL,
    lastUpdated: Date.now(),
    isPrecisionMode
  };
};
