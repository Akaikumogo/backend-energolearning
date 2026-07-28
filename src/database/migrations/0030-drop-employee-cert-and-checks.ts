import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropEmployeeCertAndChecks1747600000000
  implements MigrationInterface
{
  name = 'DropEmployeeCertAndChecks1747600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_certificates" CASCADE;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_checks" CASCADE;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_checks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" character varying(64) NOT NULL,
        "check_date" date NOT NULL,
        "reason" text NULL,
        "grade" character varying(64) NULL,
        "next_check_date" date NULL,
        "commission_leader_signature" text NULL,
        "qualification_group" character varying(128) NULL,
        "rule_name" character varying(256) NULL,
        "conclusion" text NULL,
        "doctor_conclusion" text NULL,
        "responsible_signature" text NULL,
        "created_by_user_id" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_checks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_certificates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "position_title" character varying(256) NOT NULL,
        "certificate_number" character varying(128) NOT NULL,
        "presented_by_full_name" character varying(256) NOT NULL,
        "created_by_user_id" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_certificates" PRIMARY KEY ("id"),
        CONSTRAINT "uq_employee_certificate_user" UNIQUE ("user_id")
      )
    `);
  }
}
