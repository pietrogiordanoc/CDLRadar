import { Candlestick, SignalType, ActionType, Timeframe, Instrument, TradeSetup } from '../types';
import { calculateSMA, calculateATR, calculateEMA, calculateSlope } from './indicators';
import { isMarketOpen } from '../services/twelveDataService';

export const validateV4Signal = (
  data: Partial<Record<Timeframe, Candlestick[]>>,
  strategySignal5m: SignalType,
  signalsMTF: Record<Timeframe, SignalType>,
  isPrecisionMode: boolean,
  instrument?: Instrument
): { action: ActionType; score: number; tradeSetup: TradeSetup | null } => {
  const h4 = signalsMTF['4h'];
  const h1 = signalsMTF['1h'];
  const m15 = signalsMTF['15min'];
  const m5 = strategySignal5m;
  const candles5m = data['5min'] || [];

  const defaultReturn = { action: ActionType.NADA, score: 0, tradeSetup: null };

  if (instrument && !isMarketOpen(instrument.type, instrument.symbol)) {
    return { action: ActionType.MERCADO_CERRADO, score: 0, tradeSetup: null };
  }

  if (m5 === SignalType.NEUTRAL || candles5m.length < 30) {
    return defaultReturn;
  }

  let score = 0;

  // 1. Alineación MTF (+40 puntos)
  const macroTrend = (h4 === h1 && h4 !== SignalType.NEUTRAL) ? h4 : null;
  if (macroTrend === m5) {
    score += 30;
    if (m15 === m5) score += 10;
  }

  // 2. Filtro de Volumen Relativo (+30 puntos)
  const currentVolume = candles5m[candles5m.length - 1].volume;
  const avgVolume = calculateSMA(candles5m.map(c => c.volume), 20);
  if (currentVolume >= avgVolume * 1.5) {
    score += 30;
  } else if (currentVolume >= avgVolume) {
    score += 15;
  }

  // 3. Filtro Volatilidad ATR (+20 puntos)
  const ATR_PERIOD = 14;
  const currentAtr = calculateATR(candles5m, ATR_PERIOD);
  const trs = candles5m.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const hl = c.high - c.low;
    const hpc = Math.abs(c.high - candles5m[i-1].close);
    const lpc = Math.abs(c.low - candles5m[i-1].close);
    return Math.max(hl, hpc, lpc);
  });
  const avgAtr = calculateSMA(trs, 20);
  if (currentAtr > avgAtr) score += 20;

  // 4. Filtro de Pendiente (EMA8) (+10 puntos)
  const closes = candles5m.map(c => c.close);
  const ema8Values = [];
  for(let i = 21; i <= closes.length; i++) ema8Values.push(calculateEMA(closes.slice(0, i), 8));
  if (Math.abs(calculateSlope(ema8Values, 5)) > 30) score += 10;

  let action = ActionType.ESPERAR;
  let tradeSetup: TradeSetup | null = null;

  if (score >= 85) {
    action = ActionType.ENTRAR_AHORA;
    const signalCandle = candles5m[candles5m.length - 1];
    const bodySize = Math.abs(signalCandle.close - signalCandle.open);
    const fibRetracement = bodySize * 0.382;
    
    // Lógica de TP Dinámico basado en Score
    let tpMultiplier = 1.5; // Base para 85-90
    if (score >= 96) {
      tpMultiplier = 2.5; // Señal A+
    } else if (score >= 91) {
      tpMultiplier = 2.0; // Señal Excepcional
    }

    let suggestedEntry, suggestedTp;
    if (m5 === SignalType.BUY) {
      suggestedEntry = signalCandle.high - fibRetracement;
      suggestedTp = suggestedEntry + (currentAtr * tpMultiplier);
    } else { // SALE
      suggestedEntry = signalCandle.low + fibRetracement;
      suggestedTp = suggestedEntry - (currentAtr * tpMultiplier);
    }
    tradeSetup = { entry: suggestedEntry, tp: suggestedTp, rr: tpMultiplier };

  } else if (score >= 60 && macroTrend === m5) {
    action = ActionType.ESPERAR;
  } else if (m5 !== macroTrend && macroTrend !== null) {
    action = ActionType.ESPERAR;
  }

  return { action, score, tradeSetup };
};