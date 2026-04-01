import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';

export type LeaderboardRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  xp: number;
  rank: number;
};

export type LeaderboardResponse = {
  scope: 'global' | 'organization';
  orgId: string | null;
  me: LeaderboardRow | null;
  top: LeaderboardRow[];
};

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(UserQuestionAttempt)
    private readonly uqaRepo: Repository<UserQuestionAttempt>,
  ) {}

  async getGlobalLeaderboard(userId: string, limit = 50): Promise<LeaderboardResponse> {
    return this.getLeaderboard({ scope: 'global', userId, limit });
  }

  async getOrganizationLeaderboard(
    userId: string,
    organizationId: string,
    limit = 50,
  ): Promise<LeaderboardResponse> {
    return this.getLeaderboard({ scope: 'organization', userId, organizationId, limit });
  }

  private async getLeaderboard(args: {
    scope: 'global' | 'organization';
    userId: string;
    organizationId?: string;
    limit: number;
  }): Promise<LeaderboardResponse> {
    const limit = Math.min(Math.max(args.limit, 1), 200);
    const isOrg = args.scope === 'organization';

    const whereOrg = isOrg ? `AND uqa.organization_id = $1` : '';

    // 1) Top list (window rank by XP)
    const topSql = `
      WITH scores AS (
        SELECT
          u.id AS "userId",
          u.first_name AS "firstName",
          u.last_name AS "lastName",
          u.email AS "email",
          u.avatar_url AS "avatarUrl",
          (COUNT(*) FILTER (WHERE uqa.is_correct = true) * 10)::int AS "xp"
        FROM user_question_attempts uqa
        JOIN users u ON u.id = uqa.user_id
        WHERE 1=1
          ${whereOrg}
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
      ),
      ranked AS (
        SELECT
          *,
          DENSE_RANK() OVER (ORDER BY "xp" DESC, "userId" ASC)::int AS "rank"
        FROM scores
      )
      SELECT * FROM ranked
      ORDER BY "rank" ASC
      LIMIT ${isOrg ? '$2' : '$1'};
      `;
    const topParams = isOrg ? [args.organizationId, limit] : [limit];
    const top = await this.uqaRepo.query(topSql, topParams);

    // 2) Me rank (separate query to avoid scanning all on app side)
    const meSql = `
      WITH scores AS (
        SELECT
          u.id AS "userId",
          u.first_name AS "firstName",
          u.last_name AS "lastName",
          u.email AS "email",
          u.avatar_url AS "avatarUrl",
          (COUNT(*) FILTER (WHERE uqa.is_correct = true) * 10)::int AS "xp"
        FROM user_question_attempts uqa
        JOIN users u ON u.id = uqa.user_id
        WHERE 1=1
          ${whereOrg}
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
      ),
      ranked AS (
        SELECT
          *,
          DENSE_RANK() OVER (ORDER BY "xp" DESC, "userId" ASC)::int AS "rank"
        FROM scores
      )
      SELECT * FROM ranked
      WHERE "userId" = ${isOrg ? '$2' : '$1'}
      LIMIT 1;
      `;
    const meParams = isOrg ? [args.organizationId, args.userId] : [args.userId];
    const meRows = await this.uqaRepo.query(meSql, meParams);

    const normalize = (r: any): LeaderboardRow => ({
      userId: r.userId,
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      email: r.email ?? '',
      avatarUrl: r.avatarUrl ?? null,
      xp: Number(r.xp) || 0,
      rank: Number(r.rank) || 0,
    });

    return {
      scope: args.scope,
      orgId: isOrg ? (args.organizationId ?? null) : null,
      me: meRows?.[0] ? normalize(meRows[0]) : null,
      top: Array.isArray(top) ? top.map(normalize) : [],
    };
  }
}

