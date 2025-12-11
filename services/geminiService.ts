import { GoogleGenAI } from "@google/genai";
import { StockAnalysis, RetirementPlan, RetirementResult } from "../types";

// Helper to get key from storage or env
const getApiKey = (): string | null => {
  // 1. Check LocalStorage
  const stored = localStorage.getItem('gemini_api_key');
  if (stored) return stored;
  
  // 2. Check Environment Variables
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    // Ignore error
  }

  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore
  }
  
  return null;
};

// Initialize Gemini Client dynamically
const getAIClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

// Helper function to extract JSON from Markdown code blocks
const extractJson = (text: string): any => {
  try {
    // Try to find JSON inside code blocks ```json ... ```
    const jsonMatch = text.match(/```json([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    // Try to find array brackets if code block is missing
    const arrayMatch = text.match(/\[([\s\S]*?)\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
    // Fallback: try parsing the whole text
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON from AI response:", text);
    return [];
  }
};

// Specific corrections for Taiwan stocks based on user feedback and common errors
const PRE_DEFINED_MAPPINGS: Record<string, string> = {
  "2834": "2834 臺企銀", // Often confused with TCC
  "304": "3042 晶技",   // User typo correction
  "3042": "3042 晶技",
  "4564": "4564 元翎",
  "6890": "6890 來億-KY",
  "1101": "1101 台泥",
  "9904": "9904 寶成"
};

const getTaipeiTimeInstruction = () => {
  const now = new Date();
  
  // Convert to Taipei Time to calculate hour/minute
  const taipeiTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
  const hour = taipeiTime.getHours();
  const minute = taipeiTime.getMinutes();
  const timeVal = hour * 100 + minute; // e.g. 1330 for 13:30

  const options: Intl.DateTimeFormatOptions = { 
    timeZone: 'Asia/Taipei', 
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };
  const timeString = now.toLocaleString('zh-TW', options);

  let priceRule = "";
  if (timeVal >= 1330) {
    priceRule = "現在時間已過 13:30 (台股收盤)，請務必提供「今天」的收盤價 (Closing Price)。不要提供昨天的，也不要提供盤中價格。";
  } else if (timeVal < 900) {
    priceRule = "現在時間早於 09:00 (尚未開盤)，請務必提供「上一個交易日」的收盤價 (Previous Close)。";
  } else {
    priceRule = "現在時間介於 09:00 - 13:30 (盤中)，請提供「即時成交價」 (Real-time Price)。";
  }
  
  return `
    現在台北時間是：${timeString}。
    
    **股價時間判定規則 (極重要)：**
    ${priceRule}
    
    請務必檢查 Google Search 結果的時間戳記，確保符合上述規則。
  `;
};

export const analyzePortfolio = async (symbols: string[]): Promise<StockAnalysis[]> => {
  const model = "gemini-2.5-flash";
  if (!symbols || symbols.length === 0) return [];

  // Pre-process symbols to fix known issues before sending to AI
  const querySymbols = symbols.map(s => {
    const cleanS = s.trim();
    // Check strict mapping first
    if (PRE_DEFINED_MAPPINGS[cleanS]) {
      return PRE_DEFINED_MAPPINGS[cleanS];
    }
    // Partial matches or fallbacks
    if (cleanS.includes('4564')) return '4564 元翎';
    return cleanS;
  }).join(", ");

  try {
    const ai = getAIClient();
    const timeInstruction = getTaipeiTimeInstruction();
    
    const prompt = `
      你是一個專業的金融分析系統。請使用 Google Search 查詢以下股票的「正確繁體中文公司名稱」與「最新股價」：${querySymbols}。
      
      ${timeInstruction}
      
      **極重要 - 代碼校正指令：**
      請嚴格遵守以下代碼對應，不可混淆：
      1. **2834 是「臺企銀」(Taiwan Business Bank)**，絕對不是台泥。
      2. **3042 是「晶技」(TXC)**。
      3. **6890 是「來億-KY」**。
      4. 如果輸入是 "304"，請視為 "3042 晶技"。
      
      **一般指令：**
      1. 務必使用 Google Search 獲取真實數據，不要使用估算值。
      2. 「currentPrice」必須嚴格遵守上述的時間規則 (盤前看昨日收盤，盤後看今日收盤)。
      3. 請針對持有狀況給出建議 (BUY/SELL/HOLD)。
      
      請回傳一個純 JSON 陣列 (Array)，不要包含其他解釋文字，格式如下：
      [
        {
          "symbol": "股票代碼 (e.g. 0050)",
          "name": "股票名稱 (繁體中文)",
          "marketCap": "市值 (e.g. 3000億)",
          "high52Week": 數字 (52週最高),
          "low52Week": 數字 (52週最低),
          "currentPrice": 數字 (依據時間規則的精確價格),
          "suggestBuyPrice": 數字 (建議買入價),
          "suggestSellPrice": 數字 (建議賣出價),
          "recommendation": "BUY" | "SELL" | "HOLD",
          "analysis": "簡短分析 (包含查到的最新新聞或價格資訊)",
          "projectedAnnualYield": "預估年化殖利率 (e.g. 5-6%)",
          "exampleScenario": "簡短操作建議"
        }
      ]
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    return extractJson(response.text || "[]");

  } catch (error) {
    console.error("Error analyzing portfolio:", error);
    throw error; 
  }
};

export const analyzeMarketTrends = async (): Promise<StockAnalysis[]> => {
  const model = "gemini-2.5-flash";
  
  try {
    const ai = getAIClient();
    const timeInstruction = getTaipeiTimeInstruction();

    const prompt = `
      請使用 Google Search 掃描「今日」或「近3天」台灣股市 (TWSE/TPEX) 的熱門新聞、成交量排行或法人買賣超資訊。
      找出 3 檔目前討論度最高或趨勢最明顯的股票。
      
      ${timeInstruction}
      
      **重要指令：**
      1. 使用搜尋工具確保價格 (currentPrice) 符合時間規則 (收盤價/即時價)。
      2. analysis 欄位需說明是因為哪則新聞或事件而熱門。
      3. 確保公司名稱準確 (例如: 2834 是 臺企銀)。
      
      請回傳一個純 JSON 陣列 (Array)，不要包含其他解釋文字，格式如下：
      [
        {
          "symbol": "股票代碼",
          "name": "股票名稱",
          "marketCap": "市值",
          "high52Week": 數字,
          "low52Week": 數字,
          "currentPrice": 數字 (最新價格),
          "suggestBuyPrice": 數字,
          "suggestSellPrice": 數字,
          "recommendation": "BUY" | "SELL" | "HOLD",
          "analysis": "熱門原因分析",
          "projectedAnnualYield": "預估殖利率",
          "exampleScenario": "操作建議"
        }
      ]
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    return extractJson(response.text || "[]");

  } catch (error) {
    console.error("Error analyzing trends:", error);
    throw error;
  }
};

export const getRetirementAdvice = async (plan: RetirementPlan, result: RetirementResult): Promise<string> => {
  const model = "gemini-2.5-flash";
  
  try {
    const ai = getAIClient();
    const prompt = `
      使用者正在進行退休規劃。
      現況：
      - 目前年齡: ${plan.currentAge}
      - 預計退休年齡: ${plan.retirementAge}
      - 目前資產: ${plan.currentSavings}
      - 每月儲蓄: ${plan.monthlySavings}
      - 目標預期年化報酬: ${plan.expectedAnnualReturn}%
      - 目標退休後月領: ${plan.targetMonthlyPension}
      
      試算結果：
      - 距離退休還有: ${plan.retirementAge - plan.currentAge} 年
      - 退休時預計累積資產: ${result.totalAccumulated.toFixed(0)}
      - 依據 4% 法則，每月可提領: ${result.monthlyPensionPossible.toFixed(0)}
      - 是否達成目標: ${result.isGoalReachable ? "是" : "否"}
      
      請給予一段約 150 字的專業理財建議。針對是否達成目標提出具體改善策略（如調整儲蓄率、投資組合風險配置等）或肯定其計畫。語氣溫暖但專業。
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text || "無法產生建議，請稍後再試。";
  } catch (error) {
    console.error("Error getting advice:", error);
    throw error;
  }
};