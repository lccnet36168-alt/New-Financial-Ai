import React, { useState, useEffect, useMemo } from 'react';
import { TabView, StockAnalysis } from './types';
import StockTable from './components/StockTable';
import RetirementCalc from './components/RetirementCalc';
import { analyzePortfolio, analyzeMarketTrends } from './services/geminiService';
import { LineChart, Briefcase, Plus, X, Search, Zap, KeyRound, AlertTriangle, PieChart as PieIcon, TrendingUp, RefreshCw, Save, CheckCircle } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabView>(TabView.MARKET_ANALYSIS);
  
  // API Key Management
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  
  // --- STATE INITIALIZATION WITH ROBUST RECOVERY ---

  // 1. Stock Quantities (庫存股數)
  const [stockQuantities, setStockQuantities] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('finance_stock_quantities');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 2. My Symbols (股票代碼清單)
  const [mySymbols, setMySymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('finance_portfolio_symbols');
      let symbols: string[] = saved ? JSON.parse(saved) : [];
      
      // Recovery Mechanism: If symbols list is empty but we have quantities, restore symbols from quantities
      if (symbols.length === 0) {
        const savedQty = localStorage.getItem('finance_stock_quantities');
        if (savedQty) {
          const qtyMap = JSON.parse(savedQty);
          const recoveredSymbols = Object.keys(qtyMap);
          if (recoveredSymbols.length > 0) {
            symbols = recoveredSymbols;
            // Sync back to storage immediately
            localStorage.setItem('finance_portfolio_symbols', JSON.stringify(symbols));
          }
        }
      }
      return symbols;
    } catch (e) {
      return [];
    }
  });

  // 3. Analysis Data (分析結果)
  const [portfolioStocks, setPortfolioStocks] = useState<StockAnalysis[]>(() => {
    try {
      const saved = localStorage.getItem('finance_portfolio_data');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [inputSymbol, setInputSymbol] = useState('');
  const [showSaveToast, setShowSaveToast] = useState(false);
  
  // State for Market Trends
  const [trendStocks, setTrendStocks] = useState<StockAnalysis[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check for API Key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    // @ts-ignore
    const hasEnvKey = (typeof process !== 'undefined' && process.env.API_KEY) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY);
    
    if (!storedKey && !hasEnvKey) {
      setShowApiKeyModal(true);
    } else {
      // Only fetch trends if we have a key
      handleFetchTrends();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- PERSISTENCE EFFECT HANDLERS (Backup) ---
  // Although we save immediately in handlers, these ensure sync on any other state changes
  useEffect(() => {
    localStorage.setItem('finance_portfolio_symbols', JSON.stringify(mySymbols));
  }, [mySymbols]);

  useEffect(() => {
    localStorage.setItem('finance_stock_quantities', JSON.stringify(stockQuantities));
  }, [stockQuantities]);

  useEffect(() => {
    localStorage.setItem('finance_portfolio_data', JSON.stringify(portfolioStocks));
  }, [portfolioStocks]);

  // --- HANDLERS ---

  const handleManualSave = () => {
    try {
      localStorage.setItem('finance_portfolio_symbols', JSON.stringify(mySymbols));
      localStorage.setItem('finance_stock_quantities', JSON.stringify(stockQuantities));
      localStorage.setItem('finance_portfolio_data', JSON.stringify(portfolioStocks));
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2000);
    } catch (e) {
      console.error("Save failed", e);
      alert("儲存失敗，請檢查瀏覽器設定");
    }
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('gemini_api_key', apiKeyInput.trim());
      setShowApiKeyModal(false);
      handleFetchTrends();
    }
  };

  const handleFetchTrends = async () => {
    setErrorMsg(null);
    setTrendLoading(true);
    try {
      const data = await analyzeMarketTrends();
      setTrendStocks(data);
    } catch (err) {
      console.error(err);
      setErrorMsg("無法取得市場資訊。請確認您的 API 金鑰是否正確，或稍後再試。");
    } finally {
      setTrendLoading(false);
    }
  };

  const handleAddSymbol = () => {
    if (inputSymbol) {
      const newSymbols = inputSymbol.split(/[, ]+/).map(s => {
        const cleanS = s.trim().toUpperCase();
        // Client-side quick fix for "304" input
        if (cleanS === '304') return '3042'; 
        return cleanS;
      }).filter(s => s.length > 0);
      
      const uniqueNewSymbols = newSymbols.filter(s => !mySymbols.includes(s));
      
      if (uniqueNewSymbols.length > 0) {
        const updatedList = [...mySymbols, ...uniqueNewSymbols];
        setMySymbols(updatedList);
        // Immediate Save
        localStorage.setItem('finance_portfolio_symbols', JSON.stringify(updatedList));
        setInputSymbol('');
      }
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    const updatedList = mySymbols.filter(s => s !== symbolToRemove);
    setMySymbols(updatedList);
    // Immediate Save
    localStorage.setItem('finance_portfolio_symbols', JSON.stringify(updatedList));
    
    // Also remove from current display data so it disappears immediately
    setPortfolioStocks(prev => {
      const updated = prev.filter(s => s.symbol !== symbolToRemove);
      localStorage.setItem('finance_portfolio_data', JSON.stringify(updated));
      return updated;
    });
  };

  const handleQuantityChange = (symbol: string, qty: number) => {
    setStockQuantities(prev => {
      const updated = { ...prev, [symbol]: qty };
      // Immediate Save
      localStorage.setItem('finance_stock_quantities', JSON.stringify(updated));
      return updated;
    });
  };

  const handleAnalyzePortfolio = async () => {
    if (mySymbols.length === 0) return;
    setErrorMsg(null);
    setPortfolioLoading(true);
    try {
      const data = await analyzePortfolio(mySymbols);
      setPortfolioStocks(data);
      // Immediate Save
      localStorage.setItem('finance_portfolio_data', JSON.stringify(data));
    } catch (err) {
      console.error(err);
      setErrorMsg("分析失敗。請確認您的 API 金鑰是否正確。");
    } finally {
      setPortfolioLoading(false);
    }
  };

  const clearApiKey = () => {
    if(confirm("確定要清除儲存的 API Key 嗎？下次使用需重新輸入。")) {
      localStorage.removeItem('gemini_api_key');
      window.location.reload();
    }
  };

  // Helper to check if we have symbols but missing analysis data
  const hasPendingSymbols = useMemo(() => {
    if (mySymbols.length === 0) return false;
    // If portfolioStocks is empty, obviously pending
    if (portfolioStocks.length === 0) return true;
    // Or if symbols count mismatch significantly (user added new ones)
    const analyzedSymbols = portfolioStocks.map(s => s.symbol);
    return mySymbols.some(s => !analyzedSymbols.includes(s));
  }, [mySymbols, portfolioStocks]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Toast Notification */}
      {showSaveToast && (
        <div className="fixed top-20 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center animate-fadeIn">
          <CheckCircle className="w-5 h-5 mr-2" />
          <span>設定與庫存已儲存！</span>
        </div>
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-indigo-600">
              <KeyRound className="w-8 h-8" />
              <h2 className="text-xl font-bold">設定 API 金鑰</h2>
            </div>
            <p className="text-slate-600 text-sm">
              為了使用此應用程式的 AI 分析功能，請輸入您的 Google Gemini API Key。
              <br/>您的金鑰僅會儲存在您的瀏覽器中，不會傳送至其他伺服器。
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="貼上您的 API Key (AIzaSy...)"
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <div className="flex justify-end space-x-3 pt-2">
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center"
              >
                取得 Key
              </a>
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium shadow-sm transition-colors"
              >
                開始使用
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3 shadow-indigo-200 shadow-lg">
                  <LineChart className="text-white w-5 h-5" />
                </div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 truncate">
                  理財小教室
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <button
                  onClick={() => setActiveTab(TabView.MARKET_ANALYSIS)}
                  className={`${
                    activeTab === TabView.MARKET_ANALYSIS
                      ? 'border-indigo-500 text-slate-900'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
                >
                  市場與持股分析
                </button>
                <button
                  onClick={() => setActiveTab(TabView.RETIREMENT_PLANNING)}
                  className={`${
                    activeTab === TabView.RETIREMENT_PLANNING
                      ? 'border-indigo-500 text-slate-900'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
                >
                  退休金試算
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={clearApiKey}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                title="重設 API Key"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <span className="hidden md:inline text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 font-medium">
                Professional Edition
              </span>
            </div>
          </div>
        </div>
        
        {/* Mobile Tabs */}
        <div className="sm:hidden grid grid-cols-2 border-t border-slate-200">
          <button
            onClick={() => setActiveTab(TabView.MARKET_ANALYSIS)}
            className={`${
              activeTab === TabView.MARKET_ANALYSIS
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                : 'bg-white text-slate-500 border-b-2 border-transparent'
            } py-3 text-sm font-medium text-center transition-colors`}
          >
            市場與持股分析
          </button>
          <button
            onClick={() => setActiveTab(TabView.RETIREMENT_PLANNING)}
            className={`${
              activeTab === TabView.RETIREMENT_PLANNING
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                : 'bg-white text-slate-500 border-b-2 border-transparent'
            } py-3 text-sm font-medium text-center transition-colors`}
          >
            退休金試算
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start animate-fadeIn">
            <AlertTriangle className="w-5 h-5 text-rose-500 mr-3 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-rose-700">{errorMsg}</div>
          </div>
        )}

        {activeTab === TabView.MARKET_ANALYSIS && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* 1. Market Trends Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  <Zap className="w-6 h-6 mr-2 text-yellow-500" /> 
                  本日市場熱點
                </h2>
                <button 
                  onClick={handleFetchTrends}
                  disabled={trendLoading}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                >
                  {trendLoading ? '更新中...' : '刷新資訊'}
                </button>
              </div>
              <StockTable 
                stocks={trendStocks} 
                loading={trendLoading} 
              />
            </section>

            {/* 2. My Portfolio Section */}
            <section className="space-y-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  <Briefcase className="w-6 h-6 mr-2 text-indigo-600" /> 
                  我的持股分析
                </h2>
                {hasPendingSymbols && (
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium animate-pulse">
                    有未更新的代碼
                  </span>
                )}
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-grow">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      輸入股票代號 (逗號分隔)
                    </label>
                    <div className="flex gap-2">
                       <input
                        type="text"
                        value={inputSymbol}
                        onChange={(e) => setInputSymbol(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
                        placeholder="例如: 2330, 0050, 2834, 3042"
                        className="flex-grow p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase"
                      />
                      <button 
                        onClick={handleAddSymbol}
                        disabled={!inputSymbol}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium flex items-center disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4 mr-1" /> 加入
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button 
                      onClick={handleManualSave}
                      className="w-full md:w-auto px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium shadow-sm transition-colors flex items-center justify-center h-[42px]"
                      title="強制儲存目前的設定"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      儲存設定
                    </button>
                    
                    <button 
                      onClick={handleAnalyzePortfolio}
                      disabled={portfolioLoading || mySymbols.length === 0}
                      className={`w-full md:w-auto px-6 py-2 text-white rounded-lg font-medium shadow-sm transition-all flex items-center justify-center h-[42px] ${
                        hasPendingSymbols 
                          ? 'bg-amber-500 hover:bg-amber-600 ring-2 ring-amber-200' 
                          : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50'
                      }`}
                    >
                      {portfolioLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          AI 分析中...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          {hasPendingSymbols ? '更新所有報價' : '開始分析'}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {mySymbols.length > 0 && (
                  <div className="mb-6 flex flex-wrap gap-2 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="w-full text-xs text-slate-400 mb-2">已儲存的觀察名單 (點擊右上角「開始分析」取得報價)：</div>
                    {mySymbols.map(symbol => {
                       const isAnalyzed = portfolioStocks.some(s => s.symbol === symbol);
                       return (
                        <span key={symbol} className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${isAnalyzed ? 'bg-white text-slate-800 border-slate-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                          {symbol}
                          <button 
                            onClick={() => handleRemoveSymbol(symbol)}
                            className="ml-2 text-slate-400 hover:text-rose-500 focus:outline-none"
                            title="移除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                
                {portfolioStocks.length === 0 && mySymbols.length > 0 && !portfolioLoading && (
                  <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                     <div className="mx-auto w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                        <TrendingUp className="w-6 h-6 text-indigo-500" />
                     </div>
                     <h3 className="text-slate-900 font-medium">已讀取到您的觀察名單</h3>
                     <p className="text-slate-500 text-sm mt-1 mb-4">點擊上方的「開始分析」或「更新所有報價」來獲取最新股價與 AI 建議。</p>
                     <button 
                       onClick={handleAnalyzePortfolio}
                       className="text-sm text-indigo-600 font-medium hover:text-indigo-800 underline"
                     >
                       立即更新
                     </button>
                  </div>
                )}

                {(portfolioStocks.length > 0 || portfolioLoading) && (
                  <StockTable 
                    stocks={portfolioStocks} 
                    loading={portfolioLoading}
                    showSummary={false}
                    quantities={stockQuantities}
                    onQuantityChange={handleQuantityChange}
                  />
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === TabView.RETIREMENT_PLANNING && (
          <div className="animate-fadeIn">
            <RetirementCalc 
              portfolioStocks={portfolioStocks}
              stockQuantities={stockQuantities}
              onQuantityChange={handleQuantityChange}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;