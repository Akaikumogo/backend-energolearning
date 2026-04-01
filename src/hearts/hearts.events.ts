import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type HeartsState = {
  heartsCount: number;
  maxHearts: number;
  nextRegenAt: string | null;
  lastHeartRegenAt: string | null;
};

@Injectable()
export class HeartsEvents {
  private readonly subjects = new Map<string, Subject<HeartsState>>();

  emit(userId: string, state: HeartsState) {
    this.getSubject(userId).next(state);
  }

  stream(userId: string): Observable<HeartsState> {
    return this.getSubject(userId).asObservable();
  }

  private getSubject(userId: string) {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<HeartsState>();
      this.subjects.set(userId, subject);
    }
    return subject;
  }
}

