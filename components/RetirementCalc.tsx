import React, { useState, useEffect } from 'react';
import { RetirementPlan, RetirementResult, StockAnalysis } from '../types';
import { Calculator, ArrowRight, DollarSign, PiggyBank, Coins, Calculator as CalcIcon, ShieldCheck, Info } from 'lucide-react';
import { getRetirementAdvice } from '../services/geminiService';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface RetirementCalcProps {
  portfolioStocks?: StockAnalysis[];
  stockQuantities?: Record<string, number>;
  onQuantityChange?: (symbol: string, qty: number) => void;
}

const RetirementCalc: React.FC<RetirementCalcProps> = ({ 
  portfolioStocks = [], 
  stockQuantities = {},
  onQuantityChange
}) => {
  // Initialize from LocalStorage
  const [plan, setPlan] = useState<RetirementPlan>(() => {
    try {
      const saved = localStorage.getItem('finance_retirement_plan');
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        currentAge: parsed.currentAge || 30,
        retirementAge: parsed.retirementAge || 65,
        currentSavings: parsed.currentSavings || 1000000,
        monthlySavings: parsed.monthlySavings || 20000,
        targetMonthlyPension: parsed.targetMonthlyPension || 50000,
        expectedAnnualReturn: parsed.expectedAnnualReturn || 6,
        // Default Insurance values (User request: 200k, 2.5%, Year 111/2022)
        insurancePrincipal: parsed.insurancePrincipal || 200000,
        insuranceRate: parsed.insuranceRate || 2.5,
        insuranceYearDone: parsed.insuranceYearDone || 2022
      };
    } catch (e) {
      return {
        currentAge: 30,
        retirementAge: 65,
        currentSavings: 1000000,
        monthlySavings: 20000,
        targetMonthlyPension: 50000,
        expectedAnnualReturn: 6,
        insurancePrincipal: 200000,
        insuranceRate: 2.5,
        insuranceYearDone: 2022
      };
    }
  });

  // Separate Cash Savings to distinguish from Portfolio Value in UI
  // Note: plan.currentSavings tracks the TOTAL of Cash + Portfolio (excluding insurance)
  const [cashSavings, setCashSavings] = useState<number>(0);
  
  const [result, setResult] = useState<RetirementResult | null>(null);
  const [advice, setAdvice] = useState<string>('');
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [showPortfolioCalc, setShowPortfolioCalc] = useState(false);

  // Calculate Total Portfolio Value
  const portfolioTotalValue = portfolioStocks.reduce((sum, stock) => {
    const qty = stockQuantities[stock.symbol] || 0;
    return sum + (stock.currentPrice * qty);
  }, 0);

  // Derived values for UI display
  const currentYear = new Date().getFullYear();
  const yearsToRetire = plan.retirementAge - plan.currentAge;
  const retireYear = currentYear + yearsToRetire;
  const insuranceCompoundingYears = Math.max(0, retireYear - plan.insuranceYearDone);
  const insuranceFinalValue = Math.round(plan.insurancePrincipal * Math.pow(1 + (plan.insuranceRate / 100), insuranceCompoundingYears));

  // On mount, split plan.currentSavings into cash (estimate) and portfolio
  useEffect(() => {
    // If we have a saved total, subtract portfolio to find cash
    // This is a simple approximation to keep UI in sync
    const calculatedCash = Math.max(0, plan.currentSavings - portfolioTotalValue);
    setCashSavings(calculatedCash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Sync Plan when cash or portfolio changes
  useEffect(() => {
    const totalInvestableAssets = cashSavings + portfolioTotalValue;
    if (plan.currentSavings !== totalInvestableAssets) {
      setPlan(prev => ({ ...prev, currentSavings: totalInvestableAssets }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashSavings, portfolioTotalValue]);

  // Persist plan whenever it changes
  useEffect(() => {
    localStorage.setItem('finance_retirement_plan', JSON.stringify(plan));
    calculate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const calculate = () => {
    if (yearsToRetire <= 0) return;

    // 1. Calculate General Investments (Cash + Stocks) using Expected Return
    const monthlyRate = plan.expectedAnnualReturn / 100 / 12;
    const months = yearsToRetire * 12;
    const fvLumpSum = plan.currentSavings * Math.pow(1 + monthlyRate, months);
    const fvMonthly = plan.monthlySavings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

    // 2. Calculate Insurance (Fixed Rate)
    // Formula: Principal * (1 + rate)^(RetireYear - YearDone)
    const fvInsurance = plan.insurancePrincipal * Math.pow(1 + (plan.insuranceRate / 100), insuranceCompoundingYears);

    const totalAccumulated = fvLumpSum + fvMonthly + fvInsurance;

    const safeAnnualWithdrawal = totalAccumulated * 0.04;
    const monthlyPensionPossible = safeAnnualWithdrawal / 12;
    
    const requiredTotal = (plan.targetMonthlyPension * 12) / 0.04;
    const shortfall = Math.max(0, requiredTotal - totalAccumulated);

    const calcResult: RetirementResult = {
      yearsToRetire: yearsToRetire,
      totalAccumulated,
      monthlyPensionPossible,
      isGoalReachable: monthlyPensionPossible >= plan.targetMonthlyPension,
      shortfall,
      advice: ''
    };

    setResult(calcResult);
  };

  const fetchAdvice = async () => {
    if (!result) return;
    setLoadingAdvice(true);
    const adviceText = await getRetirementAdvice(plan, result);
    setAdvice(adviceText);
    setLoadingAdvice(false);
  };

  const handleInputChange = (field: keyof RetirementPlan, value: string) => {
    setPlan(prev => ({ ...prev, [field]: Number(value) }));
  };

  const handleCashChange = (value: string) => {
    setCashSavings(Number(value));
  };

  // Chart Data Preparation
  const chartData = result ? [
    { name: '目前投資複利', value: Math.round(plan.currentSavings * Math.pow(1 + (plan.expectedAnnualReturn / 100 / 12), (plan.retirementAge - plan.currentAge) * 12)) },
    { name: '儲蓄險複利', value: insuranceFinalValue },
    { name: '未來投入本金', value: plan.monthlySavings * 12 * (plan.retirementAge - plan.currentAge) },
    { name: '未來投入複利', value: Math.round(result.totalAccumulated - 
      (plan.currentSavings * Math.pow(1 + (plan.expectedAnnualReturn / 100 / 12), (plan.retirementAge - plan.currentAge) * 12)) - 
      insuranceFinalValue -
      (plan.monthlySavings * 12 * (plan.retirementAge - plan.currentAge))) },
  ] : [];

  const COLORS = ['#94a3b8', '#f59e0b', '#3b82f6', '#10b981'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Input Section */}
      <div className="lg:col-span-4 space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 flex items-center">
          <Calculator className="w-5 h-5 mr-2" /> 參數設定
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">目前年齡</label>
            <input 
              type="number" 
              value={plan.currentAge} 
              onChange={(e) => handleInputChange('currentAge', e.target.value)}
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-right"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">退休年齡</label>
            <input 
              type="number" 
              value={plan.retirementAge} 
              onChange={(e) => handleInputChange('retirementAge', e.target.value)}
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-right"
            />
          </div>
        </div>

        {/* Investment Assets Section */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
             <label className="text-sm font-bold text-slate-700">積極投資部位</label>
             <span className="text-indigo-600 font-bold font-mono text-sm">
               ${plan.currentSavings.toLocaleString()}
             </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">現金 / 儲蓄 / 其他投資 (元)</label>
            <div className="relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <DollarSign className="h-4 w-4 text-slate-400" />
              </div>
              <input 
                type="number" 
                value={cashSavings} 
                onChange={(e) => handleCashChange(e.target.value)}
                className="w-full rounded-md border-slate-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-right text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
             <div 
               className="flex items-center justify-between cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors"
               onClick={() => setShowPortfolioCalc(!showPortfolioCalc)}
             >
                <div className="flex items-center text-xs font-medium text-slate-600">
                  <Coins className="h-3 w-3 mr-1" /> 持股現值換算
                </div>
                <div className="flex items-center">
                   <span className="text-xs font-mono font-medium text-slate-700 mr-2">
                     + ${portfolioTotalValue.toLocaleString()}
                   </span>
                   <CalcIcon className="h-3 w-3 text-indigo-500" />
                </div>
             </div>

             {showPortfolioCalc && (
               <div className="mt-3 space-y-2 animate-fadeIn">
                  {portfolioStocks.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto pr-1 space-y-2">
                       {portfolioStocks.map(stock => (
                         <div key={stock.symbol} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-slate-200">
                            <div>
                               <div className="font-bold">{stock.symbol}</div>
                               <div className="text-slate-400">${stock.currentPrice}</div>
                            </div>
                            <div className="flex items-center space-x-2">
                               {onQuantityChange ? (
                                 <input 
                                   type="number"
                                   placeholder="股數"
                                   value={stockQuantities[stock.symbol] || ''}
                                   onChange={(e) => onQuantityChange(stock.symbol, Number(e.target.value))}
                                   className="w-16 border rounded p-1 text-right"
                                 />
                               ) : (
                                 <span className="w-16 text-right font-mono">{stockQuantities[stock.symbol] || 0}</span>
                               )}
                               <div className="w-16 text-right font-mono text-slate-600">
                                  ${Math.round(stock.currentPrice * (stockQuantities[stock.symbol] || 0)).toLocaleString()}
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic text-center py-2">
                       請先在「市場與持股分析」頁籤加入股票並進行分析。
                    </p>
                  )}
               </div>
             )}
          </div>
          
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">預期年化報酬率 (%)</label>
             <input 
                type="number" 
                value={plan.expectedAnnualReturn} 
                onChange={(e) => handleInputChange('expectedAnnualReturn', e.target.value)}
                className="w-full rounded-md border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-right text-sm"
              />
          </div>
        </div>

        {/* Insurance Assets Section */}
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 space-y-3">
          <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
             <label className="text-sm font-bold text-amber-800 flex items-center">
               <ShieldCheck className="w-4 h-4 mr-1" /> 已繳清儲蓄險
             </label>
             <span className="text-amber-700 font-mono text-sm font-bold">
               ${insuranceFinalValue.toLocaleString()}
             </span>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-amber-700 mb-1">期滿繳清本金 (元)</label>
            <input 
              type="number" 
              value={plan.insurancePrincipal} 
              onChange={(e) => handleInputChange('insurancePrincipal', e.target.value)}
              className="w-full rounded-md border-amber-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 border p-2 text-right text-sm bg-white"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
             <div>
                <label className="block text-xs font-medium text-amber-700 mb-1">複利利率 (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={plan.insuranceRate} 
                  onChange={(e) => handleInputChange('insuranceRate', e.target.value)}
                  className="w-full rounded-md border-amber-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 border p-2 text-right text-sm bg-white"
                />
             </div>
             <div>
                <label className="block text-xs font-medium text-amber-700 mb-1">繳清年份 (西元)</label>
                <input 
                  type="number" 
                  value={plan.insuranceYearDone} 
                  onChange={(e) => handleInputChange('insuranceYearDone', e.target.value)}
                  className="w-full rounded-md border-amber-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 border p-2 text-right text-sm bg-white"
                />
                <div className="text-[10px] text-amber-600 text-right mt-0.5">民國 {plan.insuranceYearDone - 1911} 年</div>
             </div>
          </div>
          
          {/* Calculation Info Box */}
          <div className="bg-white/60 p-2 rounded border border-amber-200 text-xs text-amber-800/80">
            <div className="flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <div className="leading-relaxed">
                <span className="font-semibold">複利試算公式：</span>
                <br/>本金 × (1 + 利率)<sup className="text-[10px]">年數</sup>
                <br/>
                <span className="font-mono text-amber-600">
                  {plan.insurancePrincipal.toLocaleString()} × (1.0{plan.insuranceRate.toString().replace('.','')})
                  <sup className="text-[10px]">{insuranceCompoundingYears}年</sup>
                </span>
                <div className="mt-1 pt-1 border-t border-amber-200/50">
                   複利年數: {plan.insuranceYearDone}年 ➔ {retireYear}年 (共{insuranceCompoundingYears}年)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">每月預計持續投入 (元)</label>
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <PiggyBank className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="number" 
              value={plan.monthlySavings} 
              onChange={(e) => handleInputChange('monthlySavings', e.target.value)}
              className="w-full rounded-md border-slate-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-right"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">目標退休後月領 (元)</label>
          <div className="relative rounded-md shadow-sm">
             <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-slate-400 text-sm">目標</span>
            </div>
            <input 
              type="number" 
              value={plan.targetMonthlyPension} 
              onChange={(e) => handleInputChange('targetMonthlyPension', e.target.value)}
              className="w-full rounded-md border-slate-300 pl-12 focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-right"
            />
          </div>
        </div>

        <button
          onClick={fetchAdvice}
          disabled={loadingAdvice || !result}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loadingAdvice ? "AI 分析中..." : "取得 AI 專業建議"}
        </button>
      </div>

      {/* Result Section */}
      <div className="lg:col-span-8 space-y-6">
        {result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-6 rounded-xl border ${result.isGoalReachable ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
                <h4 className={`text-sm font-bold uppercase ${result.isGoalReachable ? 'text-emerald-700' : 'text-orange-700'}`}>
                  預估結果
                </h4>
                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {result.isGoalReachable ? '目標可達成' : '目標有差距'}
                </div>
                <p className="text-slate-600 mt-1 text-sm">
                   {plan.retirementAge}歲時每月可領約 NT$ <span className="font-mono font-bold text-lg">{result.monthlyPensionPossible.toLocaleString()}</span>
                </p>
                {!result.isGoalReachable && (
                   <p className="text-orange-600 text-xs mt-2 font-medium">
                     尚缺總資產約 NT$ {result.shortfall.toLocaleString()}
                   </p>
                )}
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                 <div className="text-sm text-slate-500 mb-1">預估退休時總資產</div>
                 <div className="text-2xl font-bold text-slate-800 font-mono">
                   NT$ {result.totalAccumulated.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                 </div>
                 <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-2">
                   <span className="bg-indigo-50 px-2 py-0.5 rounded text-indigo-700">投資 {plan.expectedAnnualReturn}%</span>
                   <span className="bg-amber-50 px-2 py-0.5 rounded text-amber-700">儲蓄險 {plan.insuranceRate}%</span>
                 </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80">
                <h4 className="text-sm font-bold text-slate-700 mb-4">資產累積結構預測</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
            </div>

            {advice && (
              <div className="bg-gradient-to-r from-indigo-50 to-white p-6 rounded-xl border border-indigo-100 shadow-sm animate-fadeIn">
                <h4 className="text-sm font-bold text-indigo-900 flex items-center mb-3">
                   <ArrowRight className="w-4 h-4 mr-2" /> AI 理財教練建議
                </h4>
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {advice}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RetirementCalc;