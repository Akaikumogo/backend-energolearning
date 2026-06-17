/**
 * AI sozlamalari — .env talab qilinmaydi, barcha defaultlar shu yerda.
 * Kerak bo‘lsa faqat shu fayldagi qiymatlarni yangilang.
 */
export const OPENROUTER_API_KEY =
  '***REMOVED***';

export const OPENROUTER_MODEL = 'google/gemini-2.0-flash-exp:free';

/** auto | openrouter | ollama */
export const AI_PROVIDER: 'auto' | 'openrouter' | 'ollama' = 'auto';

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = 'qwen2.5-coder:7b';
export const OLLAMA_TIMEOUT_MS = 120_000;

export function hasOpenRouterConfig(): boolean {
  return OPENROUTER_API_KEY.length > 0;
}

export function hasOllamaConfig(): boolean {
  return OLLAMA_BASE_URL.length > 0;
}
