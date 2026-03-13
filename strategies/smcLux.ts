
import { Candlestick, SignalType, ActionType, Timeframe, MultiTimeframeAnalysis } from '../types';
import { detectFractalHigh, detectFractalLow } from '../utils/indicators';
import { validateV4Signal } from '../utils/v4Validator';

const detectSMCBias = (candles: Candlestick[] | undefined, swingLength: number = 5) => {
  if (!candles || candles.length < 15) return { bias: 0 };
  let bias = 0; 
  let lastSwingHigh = candles[0].high;
  let lastSwingLow = candles[0].low;
  let highCrossed = false;
  let lowCrossed = false;

  for (let i = swingLength; i < candles.length; i++) {
    const price = candles[i].close;
    if (detectFractalHigh(candles, i - swingLength, swingLength)) lastSwingHigh = candles[i - swingLength].high;
    if (detectFractalLow(candles, i - swingLength, swingLength)) lastSwingLow = candles[i - swingLength].low;

    if (price > lastSwingHigh && !highCrossed) {
      bias = 1; 
      highCrossed = true;
      lowCrossed = false;
    } else if (price < lastSwingLow && !lowCrossed) {
      bias = -1;
      lowCrossed = true;
      highCrossed = false;
    }
  }
  return { bias };
};

export const analyzeSMC = (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean): MultiTimeframeAnalysis => {
  const tfsToAnalyze: Timeframe[] = ['4h', '1h', '15min', '5min'];
  if (isPrecisionMode) tfsToAnalyze.push('30s');

  const signals = {} as Record<Timeframe, SignalType>;
  tfsToAnalyze.forEach(tf => {
    const { bias } = detectSMCBias(data[tf]);
    signals[tf] = bias === 1 ? SignalType.BUY : bias === -1 ? SignalType.SALE : SignalType.NEUTRAL;
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