import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { StockAnalysis } from '../types';

interface AnalysisChartProps {
  data: StockAnalysis;
}

const AnalysisChart: React.FC<AnalysisChartProps> = ({ data }) => {
  // Simulate a curve based on high/low/current/buy/sell to visualize the "zone"
  // Since we don't have historical data, we create a schematic representation
  
  const range = data.high52Week - data.low52Week;
  const points = 20;
  const chartData = Array.from({ length: points }, (_, i) => {
    // Create a dummy trend that sits somewhere between low and high, ending at current
    // This is purely schematic as requested ("示意圖")
    const progress = i / (points - 1);
    const wave = Math.sin(progress * Math.PI * 2) * (range * 0.2);
    // Linear interpolation from some start point to current price
    const estimatedValue = data.low52Week + (data.currentPrice - data.low52Week) * progress + wave;
    
    return {
      name: `T-${points - i}`,
      price: Math.max(data.low52Week, Math.min(data.high52Week, estimatedValue)),
    };
  });

  // Ensure the last point is exactly current price
  chartData[chartData.length - 1].price = data.currentPrice;

  return (
    <div className="h-64 w-full bg-white rounded-lg p-4 border border-slate-100">
      <h4 className="text-sm font-semibold text-slate-500 mb-2">價格區間示意圖 (Price Action Schematic)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" hide />
          <YAxis domain={[data.low52Week * 0.95, data.high52Week * 1.05]} hide />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number) => [value.toFixed(2), 'Price']}
          />
          <ReferenceLine y={data.suggestBuyPrice} label="建議買入" stroke="#10b981" strokeDasharray="3 3" />
          <ReferenceLine y={data.suggestSellPrice} label="建議賣出" stroke="#ef4444" strokeDasharray="3 3" />
          <ReferenceLine y={data.currentPrice} label="現價" stroke="#3b82f6" />
          <Area type="monotone" dataKey="price" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-xs text-slate-400 mt-2 px-2">
        <span>52W Low: {data.low52Week}</span>
        <span>52W High: {data.high52Week}</span>
      </div>
    </div>
  );
};

export default AnalysisChart;
