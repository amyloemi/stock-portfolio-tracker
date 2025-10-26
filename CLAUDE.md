# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a stock portfolio tracker that displays real-time stock prices and calculates total portfolio value. Built with Node.js, TypeScript, and Express, using ES modules and strict type checking.

**Key Features:**
- Portfolio tracking with quantity management
- **Dual currency support** - USD stocks show values in both USD and CAD
- Total portfolio value calculation (in CAD)
- Real-time USD/CAD exchange rate conversion
- Individual stock holdings value display
- Customizable watchlist with add/remove functionality
- Real-time stock price display for multiple stocks
- Persistent storage using localStorage (symbols + quantities)
- Express server with REST API
- Stock data fetching from Yahoo Finance (no API key required)
- Auto-refresh functionality (every 60 seconds for prices and exchange rates)
- Responsive grid layout
- International market support (US, Canada, etc.)
- Default stocks: TSLA, AAPL, MSFT

## Development Commands

### Development Mode
```bash
npm run dev
```
Runs the server with tsx in watch mode, automatically restarting on file changes. Server runs on http://localhost:3000

### Build
```bash
npm run build
```
Compiles TypeScript files from `src/` to `dist/` with source maps and type declarations.

### Production
```bash
npm start
```
Runs the compiled JavaScript from `dist/server.js`. Requires building first.

### Clean Build
```bash
npm run clean
```
Removes the `dist/` directory.

### Testing
```bash
npm test
```
Currently not configured. Add a test framework (e.g., Jest, Vitest) when needed.

## Architecture

### Server (src/server.ts)
- Express application serving static files and API endpoints
- Serves the web interface from `public/` directory
- API Endpoints:
  - `GET /api/stock/:symbol` - Fetch single stock data
  - `POST /api/stocks` - Fetch multiple stocks in parallel (expects `{symbols: string[]}`)

### Stock Service (src/services/stockService.ts)
- Fetches real-time stock data from Yahoo Finance API
- No API key required - works out of the box
- Returns structured stock data: price, change, changePercent, lastUpdated
- Handles any valid stock symbol

### Frontend (public/)
- `index.html`: Portfolio interface with quantity management and summary display
- `style.css`: Responsive grid layout with portfolio summary and holdings sections
- `script.js`: Manages portfolio, localStorage persistence, stock fetching, value calculations
  - Data structure: Array of `{symbol, quantity}` objects
  - Loads default watchlist with quantities on first visit
  - Saves user's portfolio (symbols + quantities) to localStorage
  - Automatically migrates from old format (strings) to new format (objects)
  - Auto-refreshes all stocks every 60 seconds
  - Add stocks via symbol and optional quantity input
  - Edit quantities directly on each card with instant calculation updates
  - Calculates individual holdings value (price × quantity)
  - Calculates total portfolio value and total change
  - Remove stocks via button on each card

## API Integration

The project uses Yahoo Finance API for real-time stock data. No API key or configuration required - it works immediately upon running the application.

**Supported Markets:**
- US stocks: No suffix needed (e.g., `TSLA`, `AAPL`)
- Canadian (TSX): Add `.TO` suffix (e.g., `ZGD.TO`, `XIU.TO`, `VFV.TO`)
  - USD-denominated Canadian: Use `-U.TO` format (e.g., `ZGLD-U.TO`, `VFV-U.TO`)
- Other international markets: Use Yahoo Finance symbol format

## Data Persistence

User's portfolio is saved to browser localStorage under the key `stockWatchlist`. The data structure is:
```javascript
[
  { symbol: 'TSLA', quantity: 10 },
  { symbol: 'AAPL', quantity: 5 },
  { symbol: 'ZGD.TO', quantity: 15 }
]
```

**Migration:** The app automatically migrates from the old format (array of strings) to the new format (array of objects with quantity) when loading existing data.

**Calculations:**
- Individual holdings value = stock price × quantity
  - USD stocks: Shows both USD and CAD (converted using exchange rate)
  - CAD stocks: Shows CAD only
- Total portfolio value = sum of all holdings values converted to CAD
- Total portfolio change = sum of (stock change × quantity) for all stocks, converted to CAD
- Exchange rate fetched from Yahoo Finance (USDCAD=X symbol)

**Currency Detection:**
- USD stocks: No `.TO` suffix (e.g., `TSLA`, `AAPL`) OR contains `-U.TO` (e.g., `ZGLD-U.TO`)
- CAD stocks: Contains `.TO` but not `-U.TO` (e.g., `ZGD.TO`, `XIU.TO`)

**API Endpoints:**
- `GET /api/stock/:symbol` - Fetch single stock
- `POST /api/stocks` - Fetch multiple stocks
- `GET /api/exchange-rate/usd-cad` - Fetch current USD/CAD rate

## TypeScript Configuration

The project uses strict TypeScript settings including:
- **Module System**: ES modules (`"type": "module"` in package.json, `module: "nodenext"`)
- **Target**: ESNext for modern JavaScript features
- **TypeScript Execution**: tsx for running TypeScript with ESM support
- **Strict Mode**: Enabled with additional strict checks:
  - `noUncheckedIndexedAccess`: Prevents undefined access errors on array/object indexing
  - `exactOptionalPropertyTypes`: Stricter optional property handling
  - `noImplicitReturns`: Requires explicit returns in all code paths
  - `noUnusedLocals` and `noUnusedParameters`: Prevents unused variables
  - `noFallthroughCasesInSwitch`: Requires break/return in switch cases

## Project Structure

```
src/
  server.ts             # Express server entry point
  services/
    stockService.ts     # Stock data fetching logic
public/
  index.html            # Main web page
  style.css             # Styling
  script.js             # Client-side JavaScript
dist/                   # Compiled JavaScript output (gitignored)
tests/                  # Test files (empty, ready for use)
```

## npm Cache Workaround

If you encounter npm permission errors related to the cache, use the custom cache flag:
```bash
npm install <package> --cache /Users/amy/VibeWorkspace/.npm-cache
```

Alternatively, fix global npm permissions:
```bash
sudo chown -R 501:20 "/Users/amy/.npm"
```
