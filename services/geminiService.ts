import { GoogleGenAI } from "@google/genai";
import { RainState } from "../types";

// Check if API key is present
const hasApiKey = !!process.env.API_KEY;
let ai: GoogleGenAI | null = null;

if (hasApiKey) {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

export const generateMagicCommentary = async (state: RainState): Promise<string> => {
  if (!ai) {
    // Fallback if no API key is provided
    const fallbacks: Record<RainState, string> = {
      [RainState.FALLING]: "让重力完成它的使命...",
      [RainState.PAUSED]: "时间凝固在空气中，万物静止。",
      [RainState.RISING]: "覆水亦可收，时光倒流。"
    };
    return fallbacks[state];
  }

  const prompt = `
    用户正在通过手势控制一个神奇的雨滴特效。当前的雨滴状态是 "${state}"。
    
    上下文:
    - FALLING: 正常的雨落下。
    - PAUSED: 雨滴悬浮在空中，如同《黑客帝国》或《惊天魔盗团》的静止时刻。
    - RISING: 雨滴倒流，时光倒转。

    请生成一句简短、神秘、具有电影感的中文旁白，就像一位魔术师或赛博朋克世界的旁白在解说。
    限制在 20 个字以内。
    氛围要充满意境和魔力。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        maxOutputTokens: 60,
        temperature: 0.9,
      }
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "魔力正在波动...";
  }
};