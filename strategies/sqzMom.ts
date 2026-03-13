
import { Candlestick, SignalType, ActionType, Timeframe, MultiTimeframeAnalysis } from '../types';
import { calculateSMA, calculateStdev, calculateLinReg, calculateTrueRange, getHighest, getLowest } from '../utils/indicators';
import { validateV4Signal } from '../utils/v4Validator';

export const analyzeSqzMom = (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean): MultiTimeframeAnalysis => {
  const length = 20;
  const multBB = 2.0;
  const multKC = 1.5;

  const calculateSqzSignal = (candles: Candlestick[] | undefined) => {
    if (!candles || candles.length < length + 5) return SignalType.NEUTRAL;
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const momentumSource: number[] = [];
    for (let i = length; i <= candles.length; i++) {
      const subHighs = highs.slice(0, i);
      const subLows = lows.slice(0, i);
      const subCloses = closes.slice(0, i);
      const hh = getHighest(subHighs, length);
      const ll = getLowest(subLows, length);
      const smaClose = calculateSMA(subCloses, length);
      const avgHl = (hh + ll) / 2;
      const finalAvg = (avgHl + smaClose) / 2;
      momentumSource.push(closes[i - 1] - finalAvg);
    }
    const val = calculateLinReg(momentumSource, length);
    return val > 0 ? SignalType.BUY : val < 0 ? SignalType.SALE : SignalType.NEUTRAL;
  };

  const signals = {} as Record<Timeframe, SignalType>;
  const tfs: Timeframe[] = ['4h', '1h', '15min', '5min'];
  if (isPrecisionMode) tfs.push('30s');

  tfs.forEach(tf => {
    signals[tf] = calculateSqzSignal(data[tf]);
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