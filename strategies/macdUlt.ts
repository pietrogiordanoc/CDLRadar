
import { Candlestick, SignalType, ActionType, Timeframe, MultiTimeframeAnalysis } from '../types';
import { calculateEMA, calculateSMA } from '../utils/indicators';
import { validateV4Signal } from '../utils/v4Validator';

export const analyzeMACDUlt = (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean): MultiTimeframeAnalysis => {
  const fastLength = 12;
  const slowLength = 26;
  const signalLength = 9;

  const calculateMACDSignal = (candles: Candlestick[] | undefined) => {
    if (!candles || candles.length < slowLength + signalLength) return SignalType.NEUTRAL;
    const closes = candles.map(c => c.close);
    const macdSeries: number[] = [];
    for (let i = slowLength; i <= closes.length; i++) {
      const subCloses = closes.slice(0, i);
      const fast = calculateEMA(subCloses, fastLength);
      const slow = calculateEMA(subCloses, slowLength);
      macdSeries.push(fast - slow);
    }
    const macd = macdSeries[macdSeries.length - 1];
    const signal = calculateSMA(macdSeries, signalLength);
    return macd > signal ? SignalType.BUY : macd < signal ? SignalType.SALE : SignalType.NEUTRAL;
  };

  const signals = {} as Record<Timeframe, SignalType>;
  const tfs: Timeframe[] = ['4h', '1h', '15min', '5min'];
  if (isPrecisionMode) tfs.push('30s');

  tfs.forEach(tf => {
    signals[tf] = calculateMACDSignal(data[tf]);
  });

  // Extract the action and score properties correctly
  const { action, score, tradeSetup } = validateV4Signal(data, signals['5min'], signals, isPrecisionMode);

  const m5Data = data['5min'];
  return {
    symbol,
    price: m5Data && m5Data.length > 0 ? m5Data[m5Data.length - 1].close : 0,
    signals,
    action,
    mainSignal: signals['5min'] || SignalType.NEUTRAL,
    lastUpdated: Date.now(),
    isPrecisionMode,
    powerScore: score,
    tradeSetup,
  };
};