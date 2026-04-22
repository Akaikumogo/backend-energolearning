import { Injectable, Logger } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';

export type AiChatScope = 'mobile' | 'admin';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  normalizeScope(role: Role | undefined, requestedScope?: string): AiChatScope {
    if (role === Role.USER) return 'mobile';
    return requestedScope === 'admin' ? 'admin' : 'mobile';
  }

  /**
   * Simple messenger mode:
   * - no DB context
   * - no chat history sent to model
   * - only user's message is forwarded to Ollama
   */
  async streamReply(args: { message: string; onChunk: (chunk: string) => void }) {
    const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5-coder:7b';
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434';
    const requestUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;

    const controller = new AbortController();
    const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            {
              role: 'system',
              content:
                "Sen foydalanuvchiga yordam beradigan AI yordamchisan. Javoblarni o'zbek tilida, qisqa va aniq yoz.",
            },
            { role: 'user', content: args.message },
          ],
        }),
      });
    } catch (error) {
      const details = this.formatFetchError(error);
      this.logger.error(
        `Ollama request failed. url=${requestUrl} model=${model} details=${details}`,
      );
      throw new Error(`Ollama ulanish xatosi: ${details}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status}: ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = JSON.parse(trimmed) as { message?: { content?: string } };
        const chunk = parsed.message?.content ?? '';
        if (chunk) args.onChunk(chunk);
      }
    }

    if (buffer.trim()) {
      const parsed = JSON.parse(buffer.trim()) as { message?: { content?: string } };
      const chunk = parsed.message?.content ?? '';
      if (chunk) args.onChunk(chunk);
    }
  }

  private formatFetchError(error: unknown) {
    if (!error) return 'unknown';
    if (error instanceof Error) {
      const cause = error.cause as
        | {
            code?: string;
            errno?: number | string;
            syscall?: string;
            address?: string;
            port?: number;
          }
        | undefined;
      if (cause) {
        return [
          error.name,
          error.message,
          cause.code,
          cause.errno ? `errno=${cause.errno}` : '',
          cause.syscall ? `syscall=${cause.syscall}` : '',
          cause.address ? `address=${cause.address}` : '',
          typeof cause.port === 'number' ? `port=${cause.port}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
      }
      return `${error.name}: ${error.message}`;
    }
    return String(error);
  }
}
