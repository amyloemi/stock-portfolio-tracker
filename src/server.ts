import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStockPrice, getHistoricalPrices } from './services/stockService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API endpoint to get a single stock price by symbol
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol?.toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol is required' });
    }
    const stockData = await getStockPrice(symbol);
    return res.json(stockData);
  } catch (error) {
    console.error('Error fetching stock data:', error);
    return res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// API endpoint to get multiple stocks at once
app.post('/api/stocks', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    // Fetch all stocks in parallel
    const stockPromises = symbols.map(symbol =>
      getStockPrice(symbol.toUpperCase()).catch(() => ({
        symbol: symbol.toUpperCase(),
        error: 'Failed to fetch',
      }))
    );

    const stocksData = await Promise.all(stockPromises);
    return res.json(stocksData);
  } catch (error) {
    console.error('Error fetching stocks data:', error);
    return res.status(500).json({ error: 'Failed to fetch stocks data' });
  }
});

// API endpoint to get USD/CAD exchange rate
app.get('/api/exchange-rate/usd-cad', async (_req, res) => {
  try {
    // Using Yahoo Finance to get USDCAD=X exchange rate
    const stockData = await getStockPrice('USDCAD=X');
    return res.json({ rate: stockData.price });
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    // Return a fallback rate
    return res.json({ rate: 1.37 }); // Approximate fallback
  }
});

// API endpoint to get historical prices for multiple stocks
app.post('/api/historical-prices', async (req, res) => {
  try {
    const { symbols, days = 30 } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    // Fetch historical prices for all stocks in parallel
    const historicalPromises = symbols.map(async symbol => {
      const prices = await getHistoricalPrices(symbol.toUpperCase(), days);
      return { symbol: symbol.toUpperCase(), prices };
    });

    const historicalData = await Promise.all(historicalPromises);
    return res.json(historicalData);
  } catch (error) {
    console.error('Error fetching historical prices:', error);
    return res.status(500).json({ error: 'Failed to fetch historical prices' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export {};
