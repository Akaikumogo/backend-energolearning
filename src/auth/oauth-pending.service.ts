import { BadRequestException, Injectable } from '@nestjs/common';

type PendingOAuth = {
  redirectUri: string;
  client: 'mobile' | 'web';
  codeVerifier?: string;
  expiresAt: number;
};

@Injectable()
export class OAuthPendingService {
  private readonly entries = new Map<string, PendingOAuth>();
  private readonly ttlMs = 10 * 60 * 1000;

  register(data: {
    state: string;
    redirectUri: string;
    client: 'mobile' | 'web';
    codeVerifier?: string;
  }) {
    this.purge();
    this.entries.set(data.state, {
      redirectUri: data.redirectUri,
      client: data.client,
      codeVerifier: data.codeVerifier,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  consume(state: string, redirectUri: string, client: 'mobile' | 'web') {
    this.purge();
    const entry = this.entries.get(state);
    if (!entry) {
      throw new BadRequestException('OAuth state yaroqsiz yoki muddati tugagan');
    }
    if (entry.redirectUri !== redirectUri) {
      throw new BadRequestException('OAuth redirect URI mos kelmadi');
    }
    if (entry.client !== client) {
      throw new BadRequestException('OAuth client turi mos kelmadi');
    }
    this.entries.delete(state);
    return entry;
  }

  private purge() {
    const now = Date.now();
    for (const [key, value] of this.entries.entries()) {
      if (value.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
