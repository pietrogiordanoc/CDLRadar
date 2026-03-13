
import { Candlestick } from '../types';

export const calculateSMA = (data: number[], period: number): number => {
  if (data.length < period) return 0;
  return data.slice(-period).reduce((acc, val) => acc + val, 0) / period;
};

export const calculateEMA = (data: number[], period: number): number => {
  if (data.length < period) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = calculateSMA(data.slice(0, period), period);
  for (let i = period; i < data.length; i++) {
    ema = (data[i] * k) + (ema * (1 - k));
  }
  return ema;
};

export const calculateRSI = (data: number[], period: number = 14): number => {
  if (data.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[data.length - i] - data[data.length - i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
};

export const calculateStdev = (data: number[], period: number): number => {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  const mean = slice.reduce((acc, val) => acc + val, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
  return Math.sqrt(variance);
};

export const calculateLinReg = (data: number[], period: number): number => {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = period;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = slice[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return slope * (n - 1) + intercept;
};

export const calculateTrueRange = (current: Candlestick, previous?: Candlestick): number => {
  if (!previous) return current.high - current.low;
  const hl = current.high - current.low;
  const hpc = Math.abs(current.high - previous.close);
  const lpc = Math.abs(current.low - previous.close);
  return Math.max(hl, hpc, lpc);
};

export const calculateATR = (candles: Candlestick[], period: number = 14): number => {
  if (candles.length < period + 1) return 0;
  const trs = candles.map((c, i) => calculateTrueRange(c, candles[i - 1]));
  return calculateSMA(trs.slice(1), period);
};

export const calculateSlope = (data: number[], period: number = 5): number => {
  if (data.length < period) return 0;
  const current = data[data.length - 1];
  const previous = data[data.length - period];
  const angle = Math.atan((current - previous) / period) * (180 / Math.PI);
  return angle;
};

export const getHighest = (data: number[], period: number): number => {
  if (data.length < period) return Math.max(...data);
  return Math.max(...data.slice(-period));
};

export const getLowest = (data: number[], period: number): number => {
  if (data.length < period) return Math.min(...data);
  return Math.min(...data.slice(-period));
};

export const detectFractalHigh = (candles: Candlestick[], index: number, size: number): boolean => {
  if (index < size || index >= candles.length - size) return false;
  const target = candles[index].high;
  for (let i = 1; i <= size; i++) {
    if (candles[index - i].high >= target || candles[index + i].high > target) return false;
  }
  return true;
};

export const detectFractalLow = (candles: Candlestick[], index: number, size: number): boolean => {
  if (index < size || index >= candles.length - size) return false;
  const target = candles[index].low;
  for (let i = 1; i <= size; i++) {
    if (candles[index - i].low <= target || candles[index + i].low < target) return false;
  }
  return true;
};
