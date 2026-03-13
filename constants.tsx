import { Instrument } from './types';

export const REFRESH_INTERVAL_MS = 300000; // 5 minutes

export const INSTRUMENT_NAMES: Record<string, string> = {
  "EUR/USD": "Euro / US Dollar",
  "USD/JPY": "US Dollar / Japanese Yen",
  "GBP/USD": "British Pound / US Dollar",
  "AUD/USD": "Australian Dollar / US Dollar",
  "USD/CAD": "US Dollar / Canadian Dollar",
  "USD/CHF": "US Dollar / Swiss Franc",
  "NZD/USD": "NZ Dollar / US Dollar",
  "EUR/GBP": "Euro / British Pound",
  "USD/CNH": "US Dollar / Chinese Yuan",
  "EUR/JPY": "Euro / Japanese Yen",
  "GBP/JPY": "British Pound / Japanese Yen",
  "AUD/JPY": "Australian Dollar / Japanese Yen",
  "EUR/CHF": "Euro / Swiss Franc",
  "USD/MXN": "US Dollar / Mexican Peso",
  "BTC/USD": "Bitcoin / US Dollar",
  "ETH/USD": "Ethereum / US Dollar",
  "SOL/USD": "Solana / US Dollar",
  "BNB/USD": "Binance Coin / US Dollar",
  "XRP/USD": "Ripple / US Dollar",
  "ADA/USD": "Cardano / US Dollar",
  "DOT/USD": "Polkadot / US Dollar",
  "LINK/USD": "Chainlink / US Dollar",
  "XTZ/USD": "Tezos",
  "INJ/USD": "Injective",
  "OP/USD": "Optimism",
  "ARB/USD": "Arbitrum",
  "APT/USD": "Aptos",
  "FIL/USD": "Filecoin",
  "SUSHI/USD": "SushiSwap",
  "AAVE/USD": "Aave",
  "UNI/USD": "Uniswap",
  "ICP/USD": "Internet Computer",
  "ALGO/USD": "Algorand",
  "NEAR/USD": "Near Protocol",
  "XLM/USD": "Stellar",
  "ETC/USD": "Ethereum Classic",
  "TRX/USD": "Tron",
  "BCH/USD": "Bitcoin Cash",
  "XAU/USD": "Gold / US Dollar",
  "XAG/USD": "Silver / US Dollar",
  "WTI": "Crude Oil WTI",
  "CC": "Cocoa Futures",
  "KC": "Coffee Futures",
  "SPX": "S&P 500 Index",
  "IXIC": "Nasdaq Composite",
  "DJI": "Dow Jones Industrial",
  "NDX": "Nasdaq 100",
  "N225": "Nikkei 225",
  "HSI": "Hang Seng Index",
  "KS11": "KOSPI Index",
  "FTSE": "FTSE 100",
  "BVSP": "Bovespa Index",
  "DAX": "DAX Index",
  "CAC": "CAC 40",
  "STOXX50E": "Euro Stoxx 50",
  "SSEC": "Shanghai Composite",
  "AXJO": "ASX 200",
  "RUT": "Russell 2000",
  "NVDA": "NVIDIA Corp",
  "AAPL": "Apple Inc",
  "TSLA": "Tesla Inc",
  "MSFT": "Microsoft Corp",
  "GOOGL": "Alphabet Inc",
  "AMZN": "Amazon Inc",
  "TSM": "Taiwan Semiconductor",
  "META": "Meta Platforms",
  "AVGO": "Broadcom Inc",
  "LRCX": "Lam Research",
  "KLAC": "KLA Corporation",
  "NFLX": "Netflix Inc",
  "V": "Visa Inc",
  "MU": "Micron Technology",
  "ORCL": "Oracle Corp",
  "ASML": "ASML Holding",
  "AMD": "Advanced Micro Devices",
  "LLY": "Eli Lilly and Company"
};

export const INSTRUMENTS_DATA: Record<string, string[]> = {
  "forex": [
    "EUR/USD", "USD/JPY", "GBP/USD", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP", "USD/CNH", "EUR/JPY", "GBP/JPY", "AUD/JPY", "EUR/CHF", "USD/MXN"
  ],
  "indices": [
    "SPX", "IXIC", "DJI", "NDX", "N225", "HSI", "KS11", "FTSE", "BVSP", "DAX", "CAC", "STOXX50E", "SSEC", "AXJO", "RUT"
  ],
  "stocks": [
    "NVDA", "MSFT", "GOOGL", "AMZN", "TSM", "META", "AVGO", "LRCX", "KLAC", "NFLX", "V", "MU", "AAPL", "TSLA", "ORCL", "ASML", "AMD", "LLY"
  ],
  "commodities": [
    "XAG/USD", "XAU/USD", "WTI", "CC", "KC"
  ],
  "crypto": [
    "BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "XRP/USD", "ADA/USD", "DOT/USD", "LINK/USD",
    "XTZ/USD", "INJ/USD", "OP/USD", "ARB/USD", "APT/USD", "FIL/USD", "SUSHI/USD", "AAVE/USD",
    "UNI/USD", "ICP/USD", "ALGO/USD", "NEAR/USD", "XLM/USD", "ETC/USD", "TRX/USD", "BCH/USD"
  ]
};

export const ALL_INSTRUMENTS: Instrument[] = Object.entries(INSTRUMENTS_DATA).flatMap(([type, symbols]) => 
  symbols.map(symbol => ({
    id: symbol,
    name: INSTRUMENT_NAMES[symbol] || symbol,
    symbol: symbol,
    type: type as Instrument['type'],
    marketStatus: 'open' 
  }))
);

export const TIMEFRAMES: { label: string, value: any }[] = [
  { label: '4H', value: '4h' },
  { label: '1H', value: '1h' },
  { label: '15M', value: '15min' },
  { label: '5M', value: '5min' },
  { label: '30S', value: '30s' }
];