// DEPRECATED FILENAME: This service now connects exclusively to Supabase and is pending a rename to marketDataService.ts.
import { Candlestick, Timeframe } from '../types';
import { supabase } from './supabaseClient';

export const PriceStore: Record<string, number> = {};

/**
 * La Edge Function provee la serie con la vela más reciente primero (orden descendente).
 * Las funciones de análisis esperan la serie con la vela más antigua primero (orden ascendente).
 * Esta función invierte y parsea los datos para prepararlos.
 */
const parseAndPrepareCandles = (rawCandles: any[]): Candlestick[] => {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
    return [];
  }

  // Crea una copia invertida para tener un orden cronológico ascendente.
  const reversed = [...rawCandles].reverse();

  return reversed.map(c => ({
    datetime: c.datetime || new Date().toISOString(),
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseInt(c.volume) || 0,
  }));
};


export const fetchTimeSeries = async (symbol: string, interval: Timeframe, outputSize: number = 2000): Promise<Candlestick[]> => {
  try {
    const { data, error } = await supabase
      .from('market_cache')
      .select('time_series_data') // Pide el historial de datos real.
      .eq('symbol', symbol)
      .single();

    if (error) {
      console.warn(`Error fetching historical data from Supabase for ${symbol}:`, error.message);
      return [];
    }
    
    if (!data || !data.time_series_data) {
        console.warn(`No historical data found in Supabase for ${symbol}`);
        return [];
    }
    
    // ¡Los datos históricos reales están aquí! No más simulaciones.
    const historicalCandles = parseAndPrepareCandles(data.time_series_data);
    
    if (historicalCandles.length > 0) {
      // Actualiza el precio más reciente para la UI.
      const latestCandle = historicalCandles[historicalCandles.length - 1];
      if (latestCandle && latestCandle.close) {
        PriceStore[symbol] = latestCandle.close;
      }
    }

    return historicalCandles;

  } catch (error) { 
    const err = error as Error;
    console.error(`Supabase fetch error for ${symbol}:`, err.message);
    return []; 
  }
};

export const resampleCandles = (candles: Candlestick[], factor: number): Candlestick[] => {
  const resampled: Candlestick[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length === 0) continue;
    
    resampled.push({
      datetime: chunk[0].datetime,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0)
    });
  }
  return resampled;
};

export const isMarketOpen = (type: string, symbol: string): boolean => {
  if (type === 'crypto') return true;
  
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  
  // Forex: Domingo 22:00 UTC a Viernes 22:00 UTC
  if (type === 'forex') {
    if (day === 0) return hour >= 22;
    if (day === 5) return hour < 22;
    return day >= 1 && day <= 4;
  }
  
  // Indices y Acciones (Aproximación US Market 14:30 - 21:00 UTC)
  if (type === 'indices' || type === 'stocks') {
    if (day === 0 || day === 6) return false;
    const timeInMinutes = hour * 60 + minute;
    // 14:30 UTC = 870 min, 21:00 UTC = 1260 min
    return timeInMinutes >= 870 && timeInMinutes <= 1260;
  }
  
  return day >= 1 && day <= 5;
};
