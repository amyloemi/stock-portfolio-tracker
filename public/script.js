// Watchlist management
const WATCHLIST_KEY = 'stockWatchlist';
const DAILY_HIGHS_LOWS_KEY = 'stockDailyHighsLows';
const PORTFOLIO_HISTORY_KEY = 'portfolioHistory';
const BACKFILLED_FLAG_KEY = 'portfolioBackfilled';
const CASH_POCKETS_KEY = 'cashPockets';
const PORTFOLIO_CURRENCY_KEY = 'portfolioCurrency';
let watchlist = []; // Array of {symbol, quantity}
let currentStockData = {}; // Cache of stock prices
let dailyHighsLows = {}; // Cache of daily highs/lows: {symbol: {high, low, date}}
let portfolioHistory = []; // Array of {date, value}
let usdCadRate = 1.37; // Default exchange rate, will be updated
let portfolioChart = null; // Chart.js instance
let hasBackfilled = false; // Track if we've already backfilled
let cashPockets = []; // Array of {id, name, balance, currency}
let portfolioCurrency = 'CAD'; // User's preferred portfolio currency (CAD or USD)
let currentSortColumn = null; // Current column being sorted (price, change, changePercent, holdings)
let currentSortDirection = 'desc'; // Current sort direction (asc or desc)

// DOM elements
const refreshAllBtn = document.getElementById('refresh-all-btn');
const addStockBtn = document.getElementById('add-stock-btn');
const addStockInput = document.getElementById('add-stock-input');
const stocksTbody = document.getElementById('stocks-tbody');
const emptyState = document.getElementById('empty-state');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const portfolioValueEl = document.getElementById('portfolio-value');
const portfolioChangeEl = document.getElementById('portfolio-change');
const portfolioCurrencyLabelEl = document.getElementById('portfolio-currency-label');
const portfolioCurrencySelectEl = document.getElementById('portfolio-currency-select');
const stocksValueEl = document.getElementById('stocks-value');
const cashDisplayEl = document.getElementById('cash-display');

// Helper function to detect if stock is USD-denominated
function isUSDStock(symbol) {
    // US stocks (no .TO suffix)
    if (!symbol.includes('.TO')) {
        return true;
    }
    // USD-denominated Canadian stocks (has -U.TO)
    if (symbol.includes('-U.TO')) {
        return true;
    }
    return false;
}

// Fetch exchange rate
async function fetchExchangeRate() {
    try {
        const response = await fetch('/api/exchange-rate/usd-cad');
        const data = await response.json();
        usdCadRate = data.rate;
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        // Keep default rate
    }
}

// ====== PORTFOLIO CURRENCY MANAGEMENT ======

// Load portfolio currency from localStorage
function loadPortfolioCurrency() {
    const saved = localStorage.getItem(PORTFOLIO_CURRENCY_KEY);
    if (saved) {
        portfolioCurrency = saved;
    }
    // Update UI
    if (portfolioCurrencySelectEl) {
        portfolioCurrencySelectEl.value = portfolioCurrency;
    }
    if (portfolioCurrencyLabelEl) {
        portfolioCurrencyLabelEl.textContent = portfolioCurrency;
    }
}

// Save portfolio currency to localStorage
function savePortfolioCurrency() {
    localStorage.setItem(PORTFOLIO_CURRENCY_KEY, portfolioCurrency);
}

// Update portfolio currency
function updatePortfolioCurrency() {
    portfolioCurrency = portfolioCurrencySelectEl.value;
    savePortfolioCurrency();

    // Update label
    if (portfolioCurrencyLabelEl) {
        portfolioCurrencyLabelEl.textContent = portfolioCurrency;
    }

    // Re-render portfolio display with new currency
    updatePortfolioSummary();
    renderPortfolioChart();
}

// ====== CASH ACCOUNT MANAGEMENT ======

// Load cash pockets from localStorage
function loadCashPockets() {
    const saved = localStorage.getItem(CASH_POCKETS_KEY);
    if (saved) {
        cashPockets = JSON.parse(saved);
    }
}

// Save cash pockets to localStorage
function saveCashPockets() {
    localStorage.setItem(CASH_POCKETS_KEY, JSON.stringify(cashPockets));
}

// Get total cash balance in CAD from all pockets
function getTotalCashInCAD() {
    return cashPockets.reduce((total, pocket) => {
        const balance = Math.max(0, pocket.balance); // Ensure non-negative
        if (pocket.currency === 'USD') {
            return total + (balance * usdCadRate);
        }
        return total + balance;
    }, 0);
}

// Update cash pocket values (balance and currency)
function updateCashPocketValues(pocketId) {
    const balanceInput = document.getElementById(`cash-balance-${pocketId}`);
    const currencySelect = document.getElementById(`cash-currency-${pocketId}`);

    const pocket = cashPockets.find(p => p.id === pocketId);
    if (pocket && balanceInput && currencySelect) {
        const newBalance = Math.max(0, parseFloat(balanceInput.value) || 0);
        const newCurrency = currencySelect.value;

        pocket.balance = newBalance;
        pocket.currency = newCurrency;

        saveCashPockets();
        updatePortfolioSummary();
        savePortfolioSnapshot();
        renderStocks();
    }
}

// Update cash pocket values from mobile card
function updateCashPocketValuesMobile(pocketId) {
    const balanceInput = document.getElementById(`cash-balance-mobile-${pocketId}`);
    const currencySelect = document.getElementById(`cash-currency-mobile-${pocketId}`);

    const pocket = cashPockets.find(p => p.id === pocketId);
    if (pocket && balanceInput && currencySelect) {
        const newBalance = Math.max(0, parseFloat(balanceInput.value) || 0);
        const newCurrency = currencySelect.value;

        pocket.balance = newBalance;
        pocket.currency = newCurrency;

        saveCashPockets();
        updatePortfolioSummary();
        savePortfolioSnapshot();
        renderStocks();
    }
}

// Remove cash pocket
function removeCashPocket(pocketId) {
    cashPockets = cashPockets.filter(p => p.id !== pocketId);
    saveCashPockets();
    renderStocks();
}

// ====== STOCK MANAGEMENT ======

// Get the current trading day (Friday if weekend)
function getTradingDay() {
    const now = new Date();
    const day = now.getDay();

    // If Saturday (6), go back 1 day to Friday
    if (day === 6) {
        const friday = new Date(now);
        friday.setDate(now.getDate() - 1);
        return friday.toDateString();
    }
    // If Sunday (0), go back 2 days to Friday
    if (day === 0) {
        const friday = new Date(now);
        friday.setDate(now.getDate() - 2);
        return friday.toDateString();
    }
    // Otherwise, use today
    return now.toDateString();
}

// Load daily highs/lows from localStorage
function loadDailyHighsLows() {
    const saved = localStorage.getItem(DAILY_HIGHS_LOWS_KEY);
    if (saved) {
        dailyHighsLows = JSON.parse(saved);

        // Check if we need to reset (new trading day)
        const tradingDay = getTradingDay();
        for (const symbol in dailyHighsLows) {
            if (dailyHighsLows[symbol].date !== tradingDay) {
                delete dailyHighsLows[symbol];
            }
        }
        saveDailyHighsLows();
    }
}

// Save daily highs/lows to localStorage
function saveDailyHighsLows() {
    localStorage.setItem(DAILY_HIGHS_LOWS_KEY, JSON.stringify(dailyHighsLows));
}

// Update high/low for a stock
function updateHighLow(symbol, price) {
    const tradingDay = getTradingDay();

    if (!dailyHighsLows[symbol] || dailyHighsLows[symbol].date !== tradingDay) {
        // First price of the trading day or new trading day
        dailyHighsLows[symbol] = {
            high: price,
            low: price,
            date: tradingDay
        };
    } else {
        // Update high/low if needed
        if (price > dailyHighsLows[symbol].high) {
            dailyHighsLows[symbol].high = price;
        }
        if (price < dailyHighsLows[symbol].low) {
            dailyHighsLows[symbol].low = price;
        }
    }

    saveDailyHighsLows();
}

// Load portfolio history from localStorage
function loadPortfolioHistory() {
    const saved = localStorage.getItem(PORTFOLIO_HISTORY_KEY);
    if (saved) {
        portfolioHistory = JSON.parse(saved);
        // Keep only last 30 days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        portfolioHistory = portfolioHistory.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= cutoffDate;
        });
        savePortfolioHistory();
    }

    // Check if we've already backfilled
    const backfilledFlag = localStorage.getItem(BACKFILLED_FLAG_KEY);
    hasBackfilled = backfilledFlag === 'true';
}

// Save portfolio history to localStorage
function savePortfolioHistory() {
    localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(portfolioHistory));
}

// Calculate current stocks value (excluding cash)
function calculateStocksValue() {
    let totalValueCAD = 0;
    watchlist.forEach(item => {
        const stockData = currentStockData[item.symbol];
        const qty = parseInt(item.quantity) || 0;

        if (stockData && qty > 0) {
            const isUSD = isUSDStock(item.symbol);
            const holdingValue = stockData.price * qty;

            if (isUSD) {
                totalValueCAD += holdingValue * usdCadRate;
            } else {
                totalValueCAD += holdingValue;
            }
        }
    });
    return totalValueCAD;
}

// Calculate current total portfolio value (stocks + cash) in selected currency
function calculateCurrentPortfolioValue() {
    const stocksValueCAD = calculateStocksValue();
    const cashInCAD = getTotalCashInCAD();
    const totalValueCAD = stocksValueCAD + cashInCAD;

    // Convert to selected currency if needed
    let totalValue = totalValueCAD;
    if (portfolioCurrency === 'USD') {
        totalValue = totalValueCAD / usdCadRate;
    }

    console.log('Calculate Portfolio Value - Stocks:', stocksValueCAD.toFixed(2), 'CAD, Cash:', cashInCAD.toFixed(2), 'CAD, Total:', totalValue.toFixed(2), portfolioCurrency);
    return totalValue;
}

// Portfolio history management - NO backfilling, only saves actual daily snapshots
// This function does nothing - portfolio history is built organically from daily snapshots
async function backfillPortfolioHistory() {
    console.log('Portfolio history will be built from daily snapshots - no backfilling');
    // Portfolio history starts from today and grows organically
    // Each day's snapshot is saved with actual quantities and prices at market close
    // Historical snapshots are NEVER modified when user changes quantities
}

// Check if market is closed (simplified - after 4 PM EST or on weekends)
function isMarketClosed() {
    const now = new Date();
    const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = estTime.getHours();
    const day = estTime.getDay();

    // Weekend (Saturday = 6, Sunday = 0)
    if (day === 0 || day === 6) {
        return true;
    }

    // After 4 PM EST (16:00) or before 9:30 AM EST
    if (hour >= 16 || hour < 9 || (hour === 9 && estTime.getMinutes() < 30)) {
        return true;
    }

    return false;
}

// Finalize previous day snapshots when a new day starts
function finalizePreviousDays() {
    const tradingDay = getTradingDay();

    portfolioHistory.forEach(entry => {
        // If entry is not the current trading day and not already finalized, mark it as finalized
        if (entry.date !== tradingDay && !entry.finalized) {
            entry.finalized = true;
            console.log('Finalized snapshot for', entry.date, '- Value:', entry.value.toFixed(2));
        }
    });
}

// Save today's portfolio snapshot
// This function ONLY updates today's value based on current holdings
// Historical data (past days) is NEVER modified, preserving actual portfolio history
function savePortfolioSnapshot() {
    const now = new Date();
    const today = now.toDateString();
    const tradingDay = getTradingDay();
    const totalValueCAD = calculateCurrentPortfolioValue();
    const marketClosed = isMarketClosed();
    const isWeekend = (now.getDay() === 0 || now.getDay() === 6);

    console.log('Saving portfolio snapshot for', tradingDay, '- Value:', totalValueCAD.toFixed(2), '- Market closed:', marketClosed, '- Is weekend:', isWeekend);

    // Finalize all previous days' snapshots
    finalizePreviousDays();

    // Check if we already have an entry for the trading day
    const tradingDayIndex = portfolioHistory.findIndex(entry => entry.date === tradingDay);

    // If it's weekend and Friday's snapshot exists and is finalized, don't update it
    if (isWeekend && tradingDayIndex >= 0 && portfolioHistory[tradingDayIndex].finalized) {
        console.log('Weekend - keeping Friday\'s finalized snapshot unchanged');
        renderPortfolioChart();
        return;
    }

    // Create holdings snapshot
    const holdings = watchlist.map(item => {
        const stockData = currentStockData[item.symbol];
        const qty = parseFloat(item.quantity) || 0;

        if (stockData && qty > 0) {
            const isUSD = isUSDStock(item.symbol);
            const holdingValueUSD = stockData.price * qty;
            const holdingValueCAD = isUSD ? holdingValueUSD * usdCadRate : holdingValueUSD;

            return {
                symbol: item.symbol,
                quantity: qty,
                price: stockData.price,
                currency: isUSD ? 'USD' : 'CAD',
                valueCAD: holdingValueCAD
            };
        }
        return null;
    }).filter(h => h !== null);

    if (tradingDayIndex >= 0) {
        const tradingDayEntry = portfolioHistory[tradingDayIndex];

        // Only update if not finalized
        if (!tradingDayEntry.finalized) {
            console.log('Updating trading day snapshot from', tradingDayEntry.value.toFixed(2), 'to', totalValueCAD.toFixed(2));
            tradingDayEntry.value = totalValueCAD;
            tradingDayEntry.holdings = holdings;
            tradingDayEntry.exchangeRate = usdCadRate;
            tradingDayEntry.cashPockets = JSON.parse(JSON.stringify(cashPockets)); // Store snapshot of cash pockets

            // If market is closed, finalize the snapshot
            if (marketClosed) {
                tradingDayEntry.finalized = true;
                console.log('Finalized trading day snapshot at market close');
            }
        } else {
            console.log('Trading day snapshot already finalized, not updating');
        }
    } else {
        // Add new entry for the trading day (first snapshot of the day)
        console.log('Creating new snapshot for trading day');
        portfolioHistory.push({
            date: tradingDay,
            value: totalValueCAD,
            holdings: holdings,
            exchangeRate: usdCadRate,
            cashPockets: JSON.parse(JSON.stringify(cashPockets)), // Store snapshot of cash pockets
            finalized: marketClosed // Finalize immediately if market is closed
        });
    }

    // Sort by date to maintain chronological order
    portfolioHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

    savePortfolioHistory();
    renderPortfolioChart();
}

// Render portfolio history chart
function renderPortfolioChart() {
    const canvas = document.getElementById('portfolio-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    console.log('=== Portfolio History Chart Data ===');
    portfolioHistory.forEach((entry, index) => {
        const date = new Date(entry.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        console.log(`${dateStr}: $${entry.value.toFixed(2)} - ${entry.finalized ? 'Finalized' : 'Live'}`);
    });

    // Prepare data for chart
    const labels = portfolioHistory.map((entry, index) => {
        const date = new Date(entry.date);
        // Show every 3rd label to avoid crowding
        if (portfolioHistory.length > 15 && index % 3 !== 0) {
            return '';
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Convert values to selected currency
    const values = portfolioHistory.map(entry => {
        const valueCAD = entry.value;
        if (portfolioCurrency === 'USD') {
            return valueCAD / usdCadRate;
        }
        return valueCAD;
    });

    // Destroy existing chart if it exists
    if (portfolioChart) {
        portfolioChart.destroy();
    }

    // Create new chart
    portfolioChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Portfolio Value (${portfolioCurrency})`,
                data: values,
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgb(102, 126, 234)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const dataIndex = elements[0].index;
                    showHistoricalPortfolio(dataIndex);
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            const dataIndex = context[0].dataIndex;
                            const entry = portfolioHistory[dataIndex];
                            const date = new Date(entry.date);
                            const dateStr = date.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });
                            return dateStr;
                        },
                        label: function(context) {
                            const dataIndex = context.dataIndex;
                            const entry = portfolioHistory[dataIndex];
                            const value = '$' + context.parsed.y.toFixed(2) + ' ' + portfolioCurrency;
                            const status = entry.finalized ? ' (Close)' : ' (Live)';
                            return value + status;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// ====== TRANSACTION MANAGEMENT ======

// Initialize
loadWatchlist();
loadDailyHighsLows();
loadPortfolioHistory();
loadCashPockets();
loadPortfolioCurrency();
fetchExchangeRate();
renderStocks();
renderPortfolioChart();

// Add new stock or cash pocket from input field
async function addStockOrCash() {
    const input = addStockInput.value.trim();
    if (!input) return;

    const inputUpper = input.toUpperCase();

    // Check if input starts with "cash" (case-insensitive)
    if (input.toLowerCase().startsWith('cash')) {
        // Add cash pocket with auto-generated name or user's custom name
        const name = input.charAt(0).toUpperCase() + input.slice(1); // Capitalize first letter
        const cashPocket = {
            id: Date.now().toString(),
            name: name,
            balance: 0, // Default balance, user can edit in row
            currency: 'CAD' // Default currency, user can edit in row
        };
        cashPockets.push(cashPocket);
        saveCashPockets();
        addStockInput.value = ''; // Clear input
        renderStocks();
        showError(''); // Clear any previous errors
    } else {
        // Add stock - validate symbol first
        try {
            loadingEl.style.display = 'block';
            const response = await fetch(`/api/stock/${inputUpper}`);
            loadingEl.style.display = 'none';

            if (!response.ok) {
                showError(`Invalid stock symbol: ${inputUpper}`);
                return;
            }

            // Add to watchlist with quantity 0 (user can edit in row)
            const existing = watchlist.find(item => item.symbol === inputUpper);
            if (existing) {
                showError(`${inputUpper} is already in your watchlist`);
                return;
            }

            watchlist.push({ symbol: inputUpper, quantity: 0 });
            saveWatchlist();
            addStockInput.value = ''; // Clear input
            renderStocks();
            showError(''); // Clear any previous errors
        } catch (error) {
            loadingEl.style.display = 'none';
            showError(`Failed to add stock: ${inputUpper}`);
        }
    }
}

// Auto-refresh every 60 seconds
setInterval(() => {
    if (watchlist.length > 0) {
        fetchExchangeRate();
        fetchAndRenderStocks();
    }
}, 60000);

// Event listeners
addStockBtn.addEventListener('click', addStockOrCash);
addStockInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addStockOrCash();
    }
});

// Mobile add button
const addStockBtnMobile = document.getElementById('add-stock-btn-mobile');
const addStockInputMobile = document.getElementById('add-stock-input-mobile');
if (addStockBtnMobile) {
    addStockBtnMobile.addEventListener('click', () => {
        const symbol = addStockInputMobile.value.trim().toUpperCase();
        if (symbol) {
            addStockInputMobile.value = symbol;
            // Temporarily swap the input references
            const tempInput = addStockInput.value;
            addStockInput.value = symbol;
            addStockOrCash();
            addStockInput.value = tempInput;
            addStockInputMobile.value = '';
        }
    });
    addStockInputMobile.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const symbol = addStockInputMobile.value.trim().toUpperCase();
            if (symbol) {
                addStockInputMobile.value = symbol;
                const tempInput = addStockInput.value;
                addStockInput.value = symbol;
                addStockOrCash();
                addStockInput.value = tempInput;
                addStockInputMobile.value = '';
            }
        }
    });
}

refreshAllBtn.addEventListener('click', () => fetchAndRenderStocks());
portfolioCurrencySelectEl.addEventListener('change', updatePortfolioCurrency);

// Data management event listeners
document.getElementById('clear-all-data-btn').addEventListener('click', clearAllData);

// Load watchlist from localStorage
function loadWatchlist() {
    const saved = localStorage.getItem(WATCHLIST_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);

        // Migrate from old format (array of strings) to new format (array of objects)
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
            watchlist = parsed.map(symbol => ({ symbol, quantity: 0 }));
            saveWatchlist();
        } else {
            // Ensure pinned field exists (backward compatibility)
            watchlist = parsed.map(item => ({
                symbol: item.symbol,
                quantity: item.quantity !== undefined ? item.quantity : 0,
                pinned: item.pinned !== undefined ? item.pinned : false
            }));
        }
    } else {
        // Default watchlist with quantity 0
        watchlist = [
            { symbol: 'TSLA', quantity: 0 },
            { symbol: 'AAPL', quantity: 0 },
            { symbol: 'MSFT', quantity: 0 }
        ];
        saveWatchlist();
    }
}

// Save watchlist to localStorage
function saveWatchlist() {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
}

// Add stock with action (buy/sell/hold/watch)
// Remove stock from watchlist
function removeStock(symbol) {
    watchlist = watchlist.filter(item => item.symbol !== symbol);
    saveWatchlist();
    renderStocks();
}

// Toggle pin status for a stock
function togglePin(symbol) {
    const item = watchlist.find(item => item.symbol === symbol);
    if (item) {
        item.pinned = !item.pinned;
        saveWatchlist();

        // Re-render with pinned stocks at top
        const stocksData = Object.values(currentStockData);
        renderStockCards(stocksData);
        updateTableHeaders();
    }
}

// Update stock quantity
function updateQuantity(symbol, newQuantity) {
    const item = watchlist.find(item => item.symbol === symbol);
    if (item) {
        item.quantity = parseInt(newQuantity) || 0;
        saveWatchlist();

        // Re-render cards with current stock data
        const stocksData = Object.values(currentStockData);
        if (stocksData.length > 0) {
            renderStockCards(stocksData);
        }

        updatePortfolioSummary();
        savePortfolioSnapshot();
    }
}

// Fetch and render all stocks
async function fetchAndRenderStocks() {
    if (watchlist.length === 0) {
        showEmptyState();
        return;
    }

    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    emptyState.style.display = 'none';

    try {
        const symbols = watchlist.map(item => item.symbol);
        const response = await fetch('/api/stocks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbols }),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch stocks');
        }

        const stocksData = await response.json();

        // Update cache
        stocksData.forEach(stock => {
            if (!stock.error) {
                currentStockData[stock.symbol] = stock;
            }
        });

        renderStockCards(stocksData);
        updatePortfolioSummary();

        // Backfill history on first load if needed (async)
        backfillPortfolioHistory().then(() => {
            savePortfolioSnapshot();
        });

        loadingEl.style.display = 'none';
    } catch (error) {
        console.error('Error:', error);
        loadingEl.style.display = 'none';
        showError('Failed to load stock data. Please try again.');
    }
}

// Update portfolio summary
function updatePortfolioSummary() {
    let stocksValueCAD = 0;
    let totalChangeCAD = 0;

    watchlist.forEach(item => {
        const stockData = currentStockData[item.symbol];
        const qty = parseInt(item.quantity) || 0;

        if (stockData && qty > 0) {
            const isUSD = isUSDStock(item.symbol);
            const holdingValue = stockData.price * qty;
            const holdingChange = stockData.change * qty;

            console.log(`${item.symbol}: price=${stockData.price}, qty=${qty}, isUSD=${isUSD}, holdingValue=${holdingValue}, rate=${usdCadRate}`);

            // Convert USD to CAD for portfolio total
            if (isUSD) {
                stocksValueCAD += holdingValue * usdCadRate;
                totalChangeCAD += holdingChange * usdCadRate;
            } else {
                stocksValueCAD += holdingValue;
                totalChangeCAD += holdingChange;
            }
        }
    });

    // Get cash in CAD from all pockets
    const cashInCAD = getTotalCashInCAD();
    const totalValueCAD = stocksValueCAD + cashInCAD;

    // Convert to selected currency
    let stocksValue = stocksValueCAD;
    let cashValue = cashInCAD;
    let totalValue = totalValueCAD;
    let totalChange = totalChangeCAD;

    if (portfolioCurrency === 'USD') {
        stocksValue = stocksValueCAD / usdCadRate;
        cashValue = cashInCAD / usdCadRate;
        totalValue = totalValueCAD / usdCadRate;
        totalChange = totalChangeCAD / usdCadRate;
    }

    console.log('Portfolio Summary - Stocks:', stocksValue.toFixed(2), portfolioCurrency, 'Cash:', cashValue.toFixed(2), portfolioCurrency, 'Total:', totalValue.toFixed(2), portfolioCurrency);

    // Update display
    stocksValueEl.textContent = stocksValue.toFixed(2);
    cashDisplayEl.textContent = cashValue.toFixed(2);
    portfolioValueEl.textContent = totalValue.toFixed(2);

    const changeSign = totalChange >= 0 ? '+' : '';
    const colorClass = totalChange >= 0 ? 'positive' : 'negative';
    portfolioChangeEl.textContent = `${changeSign}$${totalChange.toFixed(2)} ${portfolioCurrency}`;
    portfolioChangeEl.className = `portfolio-change ${colorClass}`;
}

// Render stocks (fetch if needed)
function renderStocks() {
    if (watchlist.length === 0) {
        showEmptyState();
    } else {
        fetchAndRenderStocks();
    }
}

// Sort stocks by column
function sortStocksByColumn(column) {
    // Toggle direction if clicking same column, otherwise default to desc
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'desc';
    }

    // Separate pinned and unpinned stocks
    const pinnedStocks = watchlist.filter(item => item.pinned);
    const unpinnedStocks = watchlist.filter(item => !item.pinned);

    // Sort unpinned stocks
    unpinnedStocks.sort((a, b) => {
        const stockA = currentStockData[a.symbol];
        const stockB = currentStockData[b.symbol];

        if (!stockA || !stockB) return 0;

        let valueA, valueB;

        switch (column) {
            case 'price':
                valueA = stockA.price;
                valueB = stockB.price;
                break;
            case 'change':
                valueA = stockA.change;
                valueB = stockB.change;
                break;
            case 'changePercent':
                valueA = stockA.changePercent;
                valueB = stockB.changePercent;
                break;
            case 'holdings':
                const qtyA = parseInt(a.quantity) || 0;
                const qtyB = parseInt(b.quantity) || 0;
                const isUSDA = isUSDStock(a.symbol);
                const isUSDB = isUSDStock(b.symbol);
                valueA = stockA.price * qtyA * (isUSDA ? usdCadRate : 1);
                valueB = stockB.price * qtyB * (isUSDB ? usdCadRate : 1);
                break;
            default:
                return 0;
        }

        const comparison = valueA - valueB;
        return currentSortDirection === 'desc' ? -comparison : comparison;
    });

    // Combine pinned (at top) and sorted unpinned stocks
    watchlist = [...pinnedStocks, ...unpinnedStocks];

    // Re-render with sorted order
    const stocksData = Object.values(currentStockData);
    renderStockCards(stocksData);
    updateTableHeaders();
}

// Update table headers to show sort indicator
function updateTableHeaders() {
    // Remove all existing sort indicators
    document.querySelectorAll('.sort-indicator').forEach(el => el.remove());

    if (!currentSortColumn) return;

    // Add sort indicator to current column
    const columnMap = {
        'price': 2,
        'change': 3,
        'changePercent': 4,
        'holdings': 6
    };

    const columnIndex = columnMap[currentSortColumn];
    if (columnIndex) {
        const th = document.querySelector(`.stocks-table th:nth-child(${columnIndex})`);
        if (th) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.textContent = currentSortDirection === 'desc' ? ' ▼' : ' ▲';
            th.appendChild(indicator);
        }
    }
}

// Render stock rows
function renderStockCards(stocksData) {
    stocksTbody.innerHTML = '';
    const mobileCardsContainer = document.getElementById('stocks-cards-container');
    if (mobileCardsContainer) {
        mobileCardsContainer.innerHTML = '';
    }

    // Separate pinned and unpinned stocks
    const pinnedStocks = watchlist.filter(item => item.pinned);
    const unpinnedStocks = watchlist.filter(item => !item.pinned);

    // Render pinned stocks first
    pinnedStocks.forEach(watchlistItem => {
        const stock = stocksData.find(s => s.symbol === watchlistItem.symbol);
        if (stock) {
            const row = createStockRow(stock, watchlistItem);
            stocksTbody.appendChild(row);

            // Also create mobile card
            if (mobileCardsContainer) {
                const card = createMobileStockCard(stock, watchlistItem);
                mobileCardsContainer.appendChild(card);
            }
        }
    });

    // Then render unpinned stocks
    unpinnedStocks.forEach(watchlistItem => {
        const stock = stocksData.find(s => s.symbol === watchlistItem.symbol);
        if (stock) {
            const row = createStockRow(stock, watchlistItem);
            stocksTbody.appendChild(row);

            // Also create mobile card
            if (mobileCardsContainer) {
                const card = createMobileStockCard(stock, watchlistItem);
                mobileCardsContainer.appendChild(card);
            }
        }
    });

    // Add cash pocket rows at the end
    cashPockets.forEach(pocket => {
        const cashRow = createCashPocketRow(pocket);
        stocksTbody.appendChild(cashRow);

        // Also create mobile cash card
        if (mobileCardsContainer) {
            const cashCard = createMobileCashCard(pocket);
            mobileCardsContainer.appendChild(cashCard);
        }
    });
}

// Create stock table row element
function createStockRow(stock, watchlistItem) {
    const row = document.createElement('tr');

    const changeSign = stock.change >= 0 ? '+' : '';
    const colorClass = stock.change >= 0 ? 'positive' : 'negative';

    // Ensure quantity is a number
    const qty = parseInt(watchlistItem.quantity) || 0;
    const isUSD = isUSDStock(stock.symbol);
    const holdingValueUSD = stock.price * qty;
    const holdingValueCAD = holdingValueUSD * usdCadRate;

    // Holdings display
    let holdingsHTML = '';
    if (qty > 0) {
        if (isUSD) {
            // Show both USD and CAD
            holdingsHTML = `
                <div class="dual-currency">
                    <div>$${holdingValueUSD.toFixed(2)} USD</div>
                    <div class="cad-value">$${holdingValueCAD.toFixed(2)} CAD</div>
                </div>
            `;
        } else {
            // Show only CAD
            holdingsHTML = `$${holdingValueUSD.toFixed(2)} CAD`;
        }
    } else {
        holdingsHTML = '-';
    }

    // Daily high/low holdings display
    let highLowHTML = '-';
    if (qty > 0 && stock.dayHigh && stock.dayLow) {
        const highValue = stock.dayHigh * qty;
        const lowValue = stock.dayLow * qty;

        // Calculate percentage from previous close price
        const prevClose = stock.previousClose || stock.price;
        const highPercent = prevClose > 0 ? ((stock.dayHigh - prevClose) / prevClose * 100) : 0;
        const lowPercent = prevClose > 0 ? ((stock.dayLow - prevClose) / prevClose * 100) : 0;

        const highPercentSign = highPercent >= 0 ? '+' : '';
        const lowPercentSign = lowPercent >= 0 ? '+' : '';

        if (isUSD) {
            highLowHTML = `
                <div class="high-low-values">
                    <div class="high-value">H: $${highValue.toFixed(2)} USD <span class="percent-change">(${highPercentSign}${highPercent.toFixed(2)}%)</span></div>
                    <div class="low-value">L: $${lowValue.toFixed(2)} USD <span class="percent-change">(${lowPercentSign}${lowPercent.toFixed(2)}%)</span></div>
                </div>
            `;
        } else {
            highLowHTML = `
                <div class="high-low-values">
                    <div class="high-value">H: $${highValue.toFixed(2)} CAD <span class="percent-change">(${highPercentSign}${highPercent.toFixed(2)}%)</span></div>
                    <div class="low-value">L: $${lowValue.toFixed(2)} CAD <span class="percent-change">(${lowPercentSign}${lowPercent.toFixed(2)}%)</span></div>
                </div>
            `;
        }
    }

    // Add pin badge (no watch badge)
    const symbolBase = stock.symbol;
    const isPinned = watchlistItem.pinned || false;
    const pinBadge = isPinned ? ` <span class="pin-badge">📌</span>` : '';
    const symbolDisplay = `<span class="clickable-symbol" onclick="openStockNews('${symbolBase}')">${symbolBase}</span>${pinBadge}`;

    // Add pinned class to row
    if (isPinned) {
        row.classList.add('pinned-row');
    }

    row.innerHTML = `
        <td class="symbol-cell">${symbolDisplay}</td>
        <td class="price-cell">$${stock.price.toFixed(2)} ${isUSD ? 'USD' : 'CAD'}</td>
        <td class="${colorClass}">${changeSign}$${stock.change.toFixed(2)}</td>
        <td class="${colorClass}">${changeSign}${stock.changePercent.toFixed(2)}%</td>
        <td class="quantity-cell">
            <input
                type="number"
                class="quantity-input-field"
                value="${qty}"
                min="0"
                step="1"
                onchange="updateQuantity('${stock.symbol}', this.value)"
            />
        </td>
        <td class="holdings-cell">${holdingsHTML}</td>
        <td class="high-low-cell">${highLowHTML}</td>
        <td class="action-cell">
            <div style="display: flex; gap: 5px; justify-content: center;">
                <button class="pin-btn ${isPinned ? 'pinned' : ''}" onclick="togglePin('${stock.symbol}')" title="${isPinned ? 'Unpin' : 'Pin to top'}">
                    ${isPinned ? '📌' : '📍'}
                </button>
                <button class="remove-btn" onclick="removeStock('${stock.symbol}')">Remove</button>
            </div>
        </td>
    `;

    return row;
}

// Create cash pocket row
function createCashPocketRow(pocket) {
    const row = document.createElement('tr');
    row.className = 'cash-row';

    const balance = Math.max(0, pocket.balance);
    const balanceInCAD = pocket.currency === 'USD' ? balance * usdCadRate : balance;

    row.innerHTML = `
        <td class="symbol-cell" style="font-weight: 700; color: #27ae60;">💵 ${pocket.name}</td>
        <td class="price-cell">-</td>
        <td>-</td>
        <td>-</td>
        <td class="quantity-cell">
            <div style="display: flex; align-items: center; gap: 5px; justify-content: center;">
                <input
                    type="number"
                    id="cash-balance-${pocket.id}"
                    class="quantity-input-field"
                    value="${balance > 0 ? balance.toFixed(2) : ''}"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style="width: 100px;"
                />
                <select id="cash-currency-${pocket.id}" style="padding: 4px; border-radius: 4px; border: 2px solid #e5e5e5; font-size: 0.85rem;">
                    <option value="CAD" ${pocket.currency === 'CAD' ? 'selected' : ''}>CAD</option>
                    <option value="USD" ${pocket.currency === 'USD' ? 'selected' : ''}>USD</option>
                </select>
            </div>
        </td>
        <td class="holdings-cell" style="font-weight: 700; color: #27ae60;">$${balanceInCAD.toFixed(2)} CAD</td>
        <td class="high-low-cell">-</td>
        <td class="action-cell">
            <div style="display: flex; gap: 5px; justify-content: center;">
                <button class="update-btn" onclick="updateCashPocketValues('${pocket.id}')">Update</button>
                <button class="remove-btn" onclick="removeCashPocket('${pocket.id}')">Remove</button>
            </div>
        </td>
    `;

    return row;
}

// Create mobile stock card
function createMobileStockCard(stock, watchlistItem) {
    const card = document.createElement('div');
    const qty = watchlistItem.quantity || 0;
    const isPinned = watchlistItem.pinned || false;
    const isUSD = isUSDStock(stock.symbol);

    card.className = 'stock-card';
    if (isPinned) {
        card.classList.add('pinned-card');
    }

    const changeSign = stock.change >= 0 ? '+' : '';
    const colorClass = stock.change >= 0 ? 'positive' : 'negative';

    // Calculate holdings
    const holdingValueUSD = stock.price * qty;
    const holdingValueCAD = holdingValueUSD * usdCadRate;

    let holdingsDisplay = '-';
    if (qty > 0) {
        if (isUSD) {
            holdingsDisplay = `
                <div class="dual-currency">
                    <div>$${holdingValueUSD.toFixed(2)} USD</div>
                    <div class="cad-value-small">$${holdingValueCAD.toFixed(2)} CAD</div>
                </div>
            `;
        } else {
            holdingsDisplay = `$${holdingValueUSD.toFixed(2)} CAD`;
        }
    }

    // High/Low values
    let highLowDisplay = '';
    if (stock.dayHigh && stock.dayLow) {
        const currency = isUSD ? 'USD' : 'CAD';
        highLowDisplay = `
            <div class="card-high-low">
                <div class="high-low-item">
                    <span class="high-low-label">Day High</span>
                    <span class="high-low-value high">$${stock.dayHigh.toFixed(2)} ${currency}</span>
                </div>
                <div class="high-low-item">
                    <span class="high-low-label">Day Low</span>
                    <span class="high-low-value low">$${stock.dayLow.toFixed(2)} ${currency}</span>
                </div>
            </div>
        `;
    }

    const pinBadge = isPinned ? `<span class="pin-badge">📌</span>` : '';

    card.innerHTML = `
        <div class="card-header">
            <div class="card-symbol">
                <div class="card-symbol-name">
                    <span class="clickable-symbol" onclick="openStockNews('${stock.symbol}')">${stock.symbol}</span>
                    ${pinBadge}
                </div>
                <div class="card-symbol-subtext">${isUSD ? 'USD Stock' : 'CAD Stock'}</div>
            </div>
            <div class="card-price-section">
                <div class="card-price">$${stock.price.toFixed(2)}</div>
                <div class="card-change-row">
                    <span class="card-change ${colorClass}">${changeSign}$${stock.change.toFixed(2)}</span>
                    <span class="card-percent ${colorClass}">${changeSign}${stock.changePercent.toFixed(2)}%</span>
                </div>
            </div>
        </div>

        ${highLowDisplay}

        <div class="card-details">
            <div class="card-detail-item">
                <span class="card-detail-label">Quantity</span>
                <span class="card-detail-value">${qty}</span>
            </div>
            <div class="card-detail-item">
                <span class="card-detail-label">Holdings Value</span>
                <div class="card-detail-value">${holdingsDisplay}</div>
            </div>
        </div>

        <div class="card-quantity-section">
            <div class="card-quantity-row">
                <span class="card-quantity-label">Update Quantity:</span>
                <div class="card-quantity-input">
                    <input
                        type="number"
                        class="quantity-input-field"
                        value="${qty}"
                        min="0"
                        step="1"
                        onchange="updateQuantity('${stock.symbol}', this.value)"
                    />
                    <button class="update-btn" onclick="updateQuantity('${stock.symbol}', this.previousElementSibling.value)">Update</button>
                </div>
            </div>
        </div>

        <div class="card-actions">
            <button class="pin-btn ${isPinned ? 'pinned' : ''}" onclick="togglePin('${stock.symbol}')" title="${isPinned ? 'Unpin' : 'Pin to top'}">
                ${isPinned ? '📌 Unpin' : '📍 Pin'}
            </button>
            <button class="remove-btn" onclick="removeStock('${stock.symbol}')">Remove</button>
        </div>
    `;

    return card;
}

// Create mobile cash card
function createMobileCashCard(pocket) {
    const card = document.createElement('div');
    card.className = 'stock-card cash-card';

    const balance = Math.max(0, pocket.balance);
    const balanceInCAD = pocket.currency === 'USD' ? balance * usdCadRate : balance;

    card.innerHTML = `
        <div class="card-header">
            <div class="card-symbol">
                <div class="card-symbol-name">💵 ${pocket.name}</div>
                <div class="card-symbol-subtext">Cash Pocket</div>
            </div>
            <div class="card-price-section">
                <div class="card-price" style="color: #27ae60;">$${balanceInCAD.toFixed(2)}</div>
                <div class="card-symbol-subtext">CAD Value</div>
            </div>
        </div>

        <div class="card-quantity-section">
            <div class="card-quantity-row">
                <span class="card-quantity-label">Balance:</span>
                <div class="card-quantity-input">
                    <input
                        type="number"
                        id="cash-balance-mobile-${pocket.id}"
                        class="quantity-input-field"
                        value="${balance > 0 ? balance.toFixed(2) : ''}"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                    />
                    <select id="cash-currency-mobile-${pocket.id}" style="padding: 8px 12px; border-radius: 8px; border: 2px solid #e2e8f0; font-size: 1rem;">
                        <option value="CAD" ${pocket.currency === 'CAD' ? 'selected' : ''}>CAD</option>
                        <option value="USD" ${pocket.currency === 'USD' ? 'selected' : ''}>USD</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="card-actions">
            <button class="update-btn" style="flex: 1;" onclick="updateCashPocketValuesMobile('${pocket.id}')">Update</button>
            <button class="remove-btn" style="flex: 1;" onclick="removeCashPocket('${pocket.id}')">Remove</button>
        </div>
    `;

    return card;
}

// Show empty state
function showEmptyState() {
    stocksTbody.innerHTML = '';

    // Still show cash pocket rows in empty state
    cashPockets.forEach(pocket => {
        const cashRow = createCashPocketRow(pocket);
        stocksTbody.appendChild(cashRow);
    });

    emptyState.style.display = 'none'; // Don't show empty state text if we have cash pockets
    loadingEl.style.display = 'none';
    portfolioValueEl.textContent = '0.00';
    portfolioChangeEl.textContent = '$0.00 CAD';
    portfolioChangeEl.className = 'portfolio-change';
}

// Show error message
function showError(message) {
    if (message) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 3000);
    } else {
        errorEl.style.display = 'none';
    }
}

// Show historical portfolio for a specific date
function showHistoricalPortfolio(dataIndex) {
    const entry = portfolioHistory[dataIndex];
    if (!entry) return;

    console.log('=== Historical Portfolio Details ===');
    console.log('Date:', entry.date);
    console.log('Value:', entry.value);
    console.log('Holdings:', entry.holdings);
    console.log('Finalized:', entry.finalized);
    console.log('Current watchlist:', watchlist);

    const modal = document.getElementById('historical-portfolio-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    const date = new Date(entry.date);
    const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    modalTitle.textContent = `Portfolio on ${dateStr}`;

    // Build portfolio display
    let content = `
        <div class="portfolio-snapshot-summary">
            <div class="snapshot-total">
                <span class="snapshot-label">Total Portfolio Value:</span>
                <span class="snapshot-value">$${entry.value.toFixed(2)} CAD</span>
            </div>
            <div class="snapshot-status">
                ${entry.finalized ? '📊 Market Close Price' : '📈 Live Price'}
            </div>
        </div>
    `;

    if (entry.holdings && entry.holdings.length > 0) {
        content += `
            <div class="snapshot-holdings">
                <h4>Holdings:</h4>
                <table class="snapshot-table">
                    <thead>
                        <tr>
                            <th>Stock</th>
                            <th>Quantity</th>
                            <th>Price</th>
                            <th>Value (CAD)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        entry.holdings.forEach(holding => {
            const priceDisplay = `$${holding.price.toFixed(2)} ${holding.currency}`;
            content += `
                <tr>
                    <td class="snapshot-symbol">${holding.symbol}</td>
                    <td>${holding.quantity.toFixed(2)}</td>
                    <td>${priceDisplay}</td>
                    <td class="snapshot-value-cell">$${holding.valueCAD.toFixed(2)}</td>
                </tr>
            `;
        });

        content += `
                    </tbody>
                </table>
            </div>
        `;
    } else {
        content += `<div class="snapshot-no-holdings">No holdings data available for this date.</div>`;
    }

    // Show cash pockets
    if (entry.cashPockets && entry.cashPockets.length > 0) {
        content += `
            <div class="snapshot-cash">
                <h4>Cash Pockets:</h4>
        `;
        entry.cashPockets.forEach(pocket => {
            const balance = Math.max(0, pocket.balance);
            const balanceInCAD = pocket.currency === 'USD' ? balance * (entry.exchangeRate || usdCadRate) : balance;
            content += `
                <p class="snapshot-cash-value">
                    ${pocket.name}: $${balance.toFixed(2)} ${pocket.currency}
                    ${pocket.currency === 'USD' ? `($${balanceInCAD.toFixed(2)} CAD)` : ''}
                </p>
            `;
        });
        content += `</div>`;
    } else if (entry.cashBalance !== undefined) {
        // Fallback for old format
        const cashCurr = entry.cashCurrency || 'CAD';
        content += `
            <div class="snapshot-cash">
                <h4>Cash Balance:</h4>
                <p class="snapshot-cash-value">$${entry.cashBalance.toFixed(2)} ${cashCurr}</p>
            </div>
        `;
    }

    // Show exchange rate
    if (entry.exchangeRate) {
        content += `
            <div class="snapshot-footer">
                <small>USD/CAD Exchange Rate: ${entry.exchangeRate.toFixed(4)}</small>
            </div>
        `;
    }

    modalBody.innerHTML = content;
    modal.style.display = 'flex';
}

// Close historical portfolio modal
function closeHistoricalPortfolio() {
    const modal = document.getElementById('historical-portfolio-modal');
    modal.style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('historical-portfolio-modal');
    if (event.target === modal) {
        closeHistoricalPortfolio();
    }
};

// ====== DATA MANAGEMENT ======

// Show confirmation modal
function showConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    const messageEl = document.getElementById('confirmation-message');
    const yesBtn = document.getElementById('confirm-yes-btn');

    messageEl.textContent = message;
    modal.style.display = 'flex';

    // Remove existing event listeners
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    // Add new event listener
    newYesBtn.addEventListener('click', () => {
        closeConfirmationModal();
        onConfirm();
    });
}

// Close confirmation modal
function closeConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = 'none';
}

// Clear all data
function clearAllData() {
    showConfirmationModal(
        '⚠️ Are you sure you want to delete ALL data? This will permanently remove your watchlist, cash pockets, portfolio history, and all settings. This action cannot be undone!',
        () => {
            // Second confirmation
            showConfirmationModal(
                '🚨 FINAL WARNING: This will erase everything! Are you absolutely sure?',
                () => {
                    // Actually clear all data
                    localStorage.removeItem(WATCHLIST_KEY);
                    localStorage.removeItem(PORTFOLIO_HISTORY_KEY);
                    localStorage.removeItem(DAILY_HIGHS_LOWS_KEY);
                    localStorage.removeItem(BACKFILLED_FLAG_KEY);
                    localStorage.removeItem(CASH_POCKETS_KEY);

                    // Reset in-memory data
                    watchlist = [];
                    cashPockets = [];
                    portfolioHistory = [];
                    dailyHighsLows = {};
                    currentStockData = {};
                    hasBackfilled = false;

                    // Destroy chart
                    if (portfolioChart) {
                        portfolioChart.destroy();
                        portfolioChart = null;
                    }

                    // Re-render everything
                    showEmptyState();
                    renderPortfolioChart();

                    alert('✅ All data has been cleared successfully!');
                }
            );
        }
    );
}

// Reset and backfill history
function resetAndBackfill() {
    if (watchlist.length === 0) {
        showError('Please add some stocks to your watchlist first before backfilling history.');
        return;
    }

    showConfirmationModal(
        '⚠️ This will reset your portfolio history and regenerate it based on your current holdings. Your transaction history will NOT be affected. Continue?',
        async () => {
            // Clear portfolio history and backfill flag
            localStorage.removeItem(PORTFOLIO_HISTORY_KEY);
            localStorage.removeItem(BACKFILLED_FLAG_KEY);
            portfolioHistory = [];
            hasBackfilled = false;

            // Destroy and recreate chart
            if (portfolioChart) {
                portfolioChart.destroy();
                portfolioChart = null;
            }

            // Trigger backfill
            loadingEl.style.display = 'block';
            try {
                await backfillPortfolioHistory();
                loadingEl.style.display = 'none';
                alert('✅ Portfolio history has been reset and backfilled successfully!');
            } catch (error) {
                loadingEl.style.display = 'none';
                showError('Failed to backfill portfolio history. Please try again.');
            }
        }
    );
}

// Open stock news in new tab
function openStockNews(symbol) {
    const newsUrl = `https://finance.yahoo.com/quote/${symbol}/news`;
    window.open(newsUrl, '_blank');
}

// Make functions global so they can be called from HTML
window.removeStock = removeStock;
window.updateQuantity = updateQuantity;
window.updateCashPocketValues = updateCashPocketValues;
window.removeCashPocket = removeCashPocket;
window.closeHistoricalPortfolio = closeHistoricalPortfolio;
window.closeConfirmationModal = closeConfirmationModal;
window.openStockNews = openStockNews;
window.sortStocksByColumn = sortStocksByColumn;
window.togglePin = togglePin;
