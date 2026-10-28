/**
 * Kalit repoda saqlanmaydi. Serverdagi GROQ_API_KEY dan o‘qiladi.
 */
export const GROQ_MODEL = 'openai/gpt-oss-120b';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export function groqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() ?? '';
}

export function hasGroqConfig(): boolean {
  const key = groqApiKey();
  return key.startsWith('gsk_') && key.length > 20;
}
