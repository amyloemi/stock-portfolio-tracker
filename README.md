# Stock Portfolio Tracker

A customizable stock portfolio tracking application that displays real-time stock prices and calculates your total portfolio value.

## Features

- **Portfolio Tracking** - Track quantity owned and total value for each stock
- **Dual Currency Support** - USD stocks show values in both USD and CAD
- **Total Portfolio Value** - See your entire portfolio value in CAD at a glance
- **Real-time Exchange Rates** - USD/CAD conversion updates automatically
- **Customizable Watchlist** - Add and remove any stock symbol
- **Real-time Data** - Live prices from Yahoo Finance
- **Persistent Storage** - Your watchlist and quantities are saved automatically
- **Auto-refresh** - Prices and exchange rates update every 60 seconds
- **Multiple Stocks** - Track as many stocks as you want
- **Individual Holdings** - See value of each stock position
- **Responsive Design** - Works on desktop and mobile
- **Beautiful Grid Layout** - Stock cards in a responsive grid
- **International Markets** - Supports US, Canadian, and other markets

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser to:
```
http://localhost:3000
```

## How to Use

1. **View Portfolio** - The page loads with default stocks (TSLA, AAPL, MSFT)
2. **Add a Stock** - Type a stock symbol and quantity (optional), then click "Add Stock"
   - US Stocks: `TSLA`, `AAPL`, `GOOGL`, `AMZN`
   - Canadian Stocks/ETFs: `ZGD.TO`, `XIU.TO`, `VFV.TO`
3. **Set Quantities** - Enter the number of shares you own in the quantity field on each card
4. **View Holdings** - See the total value of each position calculated automatically
5. **Portfolio Summary** - Your total portfolio value is displayed at the top
6. **Remove a Stock** - Click the "Remove" button on any stock card
7. **Refresh** - Click "Refresh All" to update all prices immediately
8. **Auto-save** - Your watchlist and quantities are automatically saved to your browser

### Supported Markets

The app supports stocks from various exchanges via Yahoo Finance:
- **US Markets**: No suffix needed (e.g., `TSLA`, `AAPL`)
- **Canadian (TSX)**: Add `.TO` suffix (e.g., `ZGD.TO`, `XIU.TO`)
  - **USD-denominated**: Use `-U.TO` (e.g., `ZGLD-U.TO`, `VFV-U.TO`)
- **Other markets**: Use Yahoo Finance symbol format

## Real Stock Data

The app fetches **real-time stock prices** from Yahoo Finance automatically - no API key or configuration needed! Just start the server and you'll see live market data.

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run clean` - Remove build artifacts

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **API**: Yahoo Finance (no API key required)
- **Dev Tools**: tsx, TypeScript ESM

## Project Structure

```
src/
  server.ts           # Express server
  services/
    stockService.ts   # Stock data API integration
public/
  index.html          # Web page
  style.css           # Styling
  script.js           # Client-side logic
```

## License

ISC
