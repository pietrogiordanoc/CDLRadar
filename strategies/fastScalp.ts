
import { Candlestick, SignalType, ActionType, Timeframe, MultiTimeframeAnalysis } from '../types';
import { calculateSMA } from '../utils/indicators';

export const analyzeFastScalp = (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean): MultiTimeframeAnalysis => {
  const detect = (candles: Candlestick[] | undefined): SignalType => {
    if (!candles || candles.length < 21) return SignalType.NEUTRAL;
    const closes = candles.map(c => c.close);
    const sma8 = calculateSMA(closes, 8);
    const sma21 = calculateSMA(closes, 21);
    return sma8 > sma21 ? SignalType.BUY : SignalType.SALE;
  };

  const signals = {} as Record<Timeframe, SignalType>;
  const tfs: Timeframe[] = ['4h', '1h', '15min', '5min'];
  if (isPrecisionMode) tfs.push('30s');
  
  tfs.forEach(tf => signals[tf] = detect(data[tf]));

  let isAligned = signals['5min'] === signals['15min'] && signals['15min'] === signals['1h'];
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
