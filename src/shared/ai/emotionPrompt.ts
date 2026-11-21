/**
 * 感情分析の指示。デスクトップ (`clients/emotions.ts`) とブラウザ (`emotionsWeb.ts`) が同じ 1 つを読む。
 */
export const ANALYZE_SYSTEM = `You analyze the emotional content of user-provided text.
Return ONLY valid JSON in this exact shape, with no surrounding prose or markdown:
{
  "scores": {
    "joy": 0.0,
    "sadness": 0.0,
    "anger": 0.0,
    "fear": 0.0,
    "surprise": 0.0,
    "disgust": 0.0
  },
  "sentiment": "positive" | "neutral" | "negative",
  "dominant": "joy" | "sadness" | "anger" | "fear" | "surprise" | "disgust" | "mixed"
}
Each score is between 0.0 and 1.0. They do not need to sum to 1.`;
