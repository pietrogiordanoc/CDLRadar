
import { Strategy, MultiTimeframeAnalysis, SignalType, ActionType, Timeframe, Candlestick, Instrument } from '../types';
import { analyzeSMC } from '../strategies/smcLux';
import { analyzeSqzMom } from '../strategies/sqzMom';
import { analyzeMACDUlt } from '../strategies/macdUlt';
import { validateV4Signal } from './v4Validator';

export const analyzeOrchestraV4 = (symbol: string, data: Partial<Record<Timeframe, Candlestick[]>>, isPrecisionMode: boolean, instrument?: Instrument): MultiTimeframeAnalysis => {
  const smc = analyzeSMC(symbol, data, isPrecisionMode);
  const sqz = analyzeSqzMom(symbol, data, isPrecisionMode);
  const macd = analyzeMACDUlt(symbol, data, isPrecisionMode);

  const tfs: Timeframe[] = ['4h', '1h', '15min', '5min'];
  const finalSignals = {} as Record<Timeframe, SignalType>;
  
  tfs.forEach(tf => {
    const votes = [smc.signals[tf], sqz.signals[tf], macd.signals[tf]];
    const buyVotes = votes.filter(v => v === SignalType.BUY).length;
    const saleVotes = votes.filter(v => v === SignalType.SALE).length;

    if (buyVotes >= 2) finalSignals[tf] = SignalType.BUY;
    else if (saleVotes >= 2) finalSignals[tf] = SignalType.SALE;
    else finalSignals[tf] = SignalType.NEUTRAL;
  });

  const { action, score, tradeSetup } = validateV4Signal(data, finalSignals['5min'], finalSignals, isPrecisionMode, instrument);

  const m5Data = data['5min'];
  const price = m5Data && m5Data.length > 0 ? m5Data[m5Data.length - 1].close : 0;

  return {
    symbol,
    price,
    signals: finalSignals,
    action,
    mainSignal: finalSignals['5min'] || SignalType.NEUTRAL,
    lastUpdated: Date.now(),
    isPrecisionMode,
    powerScore: score,
    tradeSetup,
  };
};

export const STRATEGIES: Strategy[] = [
  { 
    id: 'orchestra-v4', 
    name: 'Screener V4 (Precision)', 
    description: 'Alineación MTF + Volumen + ATR + Pendiente. Regla de Oro Score > 85.',
    analyze: analyzeOrchestraV4 
  }
];