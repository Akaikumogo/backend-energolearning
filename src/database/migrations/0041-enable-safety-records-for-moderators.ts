import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Barcha mavjud moderatorlarga safetyRecords (view/create/update) ruxsatini ochadi.
 * Faqat o‘z filiali xodimlariga yozish — service qatlamida assertOrgAccess orqali.
 */
export class EnableSafetyRecordsForModerators1748700000000
  implements MigrationInterface
{
  name = 'EnableSafetyRecordsForModerators1748700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "moderator_permissions"
      SET
        "permissions" = jsonb_set(
          COALESCE("permissions", '{}'::jsonb),
          '{safetyRecords}',
          '{"view": true, "create": true, "update": true, "delete": false}'::jsonb,
          true
        ),
        "updated_at" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "moderator_permissions"
      SET
        "permissions" = jsonb_set(
          COALESCE("permissions", '{}'::jsonb),
          '{safetyRecords}',
          '{"view": false, "create": false, "update": false, "delete": false}'::jsonb,
          true
        ),
        "updated_at" = now()
    `);
  }
}
