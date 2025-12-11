export interface StockAnalysis {
  symbol: string;
  name: string;
  marketCap: string;
  high52Week: number;
  low52Week: number;
  currentPrice: number;
  suggestBuyPrice: number;
  suggestSellPrice: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  analysis: string;
  projectedAnnualYield: string; // e.g. "8-12%"
  exampleScenario: string;
}

export interface RetirementPlan {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlySavings: number;
  targetMonthlyPension: number;
  expectedAnnualReturn: number;
  // Insurance specific fields
  insurancePrincipal: number;
  insuranceRate: number;
  insuranceYearDone: number;
}

export interface RetirementResult {
  yearsToRetire: number;
  totalAccumulated: number;
  monthlyPensionPossible: number;
  isGoalReachable: boolean;
  shortfall: number;
  advice: string;
}

export enum TabView {
  MARKET_ANALYSIS = 'MARKET_ANALYSIS',
  RETIREMENT_PLANNING = 'RETIREMENT_PLANNING'
}