import { MigrationInterface, QueryRunner } from 'typeorm';

/** Eski DIRECTOR → APPROVER (tasdiqlovchi shaxs). */
export class RenameDirectorToApprover1748400000000
  implements MigrationInterface
{
  name = 'RenameDirectorToApprover1748400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "role" = 'APPROVER'
      WHERE "role" = 'DIRECTOR'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "role" = 'DIRECTOR'
      WHERE "role" = 'APPROVER'
    `);
  }
}
