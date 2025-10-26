export interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
  lastUpdated: string;
}

export interface HistoricalPrice {
  date: string;
  close: number;
}

// Using Yahoo Finance API - no API key required
export async function getStockPrice(symbol: string): Promise<StockData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as any;

    // Check if we got valid data
    if (!data.chart?.result?.[0]) {
      throw new Error('Invalid response from Yahoo Finance');
    }

    const result = data.chart.result[0];
    const meta = result.meta;

    // Get current price (regularMarketPrice)
    const currentPrice = meta.regularMarketPrice ?? meta.previousClose ?? 0;

    // Get previous close
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;

    // Get day high and low
    const dayHigh = meta.regularMarketDayHigh ?? currentPrice;
    const dayLow = meta.regularMarketDayLow ?? currentPrice;

    // Validate we have valid data
    if (!currentPrice || !previousClose) {
      throw new Error('Missing price data from Yahoo Finance');
    }

    // Calculate change and percent change
    const change = currentPrice - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: meta.symbol || symbol,
      price: parseFloat(currentPrice.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      dayHigh: parseFloat(dayHigh.toFixed(2)),
      dayLow: parseFloat(dayLow.toFixed(2)),
      previousClose: parseFloat(previousClose.toFixed(2)),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
}

// Get historical prices for a stock (past 30 days)
export async function getHistoricalPrices(symbol: string, days: number = 30): Promise<Record<string, number>> {
  // Calculate timestamps for the date range
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (days * 24 * 60 * 60);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startDate}&period2=${endDate}&interval=1d`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.chart?.result?.[0]) {
      throw new Error('Invalid response from Yahoo Finance');
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close;

    if (!timestamps || !closes) {
      throw new Error('Missing historical data');
    }

    // Create a map of date string to closing price
    const historicalPrices: Record<string, number> = {};

    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000);
      const dateStr = date.toDateString();
      const closePrice = closes[i];

      if (closePrice) {
        historicalPrices[dateStr] = closePrice;
      }
    }

    return historicalPrices;
  } catch (error) {
    console.error(`Error fetching historical prices for ${symbol}:`, error);
    return {};
  }
}

export {};
