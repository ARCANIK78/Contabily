import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aislamiento multi-tenant de contabilidad y cajas.
 *
 * 1. Limpia los datos de prueba (plan de cuentas, asientos, cajas y
 *    transacciones), que no pertenecían a ningún negocio y por tanto no
 *    tienen a quién asignarse.
 * 2. Agrega `empresa_id` a esas 4 tablas con FK a `empresas`.
 * 3. Cambia el índice único de `plan_de_cuentas.codigo` (global) por
 *    `UNIQUE (empresa_id, codigo)`: cada negocio tiene su propio código.
 */
export class AgregarEmpresaIdAModulosContables1791604000000 implements MigrationInterface {
  name = 'AgregarEmpresaIdAModulosContables1791604000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- 1. Limpieza de datos previos al multi-tenant ----------
    // Orden por dependencias FK: detalles → asientos → transacciones →
    // cuentas financieras → plan de cuentas.
    await queryRunner.query(`DELETE FROM "detalles_asiento"`);
    await queryRunner.query(`DELETE FROM "asientos_contables"`);
    await queryRunner.query(`DELETE FROM "transacciones"`);
    await queryRunner.query(`DELETE FROM "cuentas_financieras"`);
    await queryRunner.query(`DELETE FROM "plan_de_cuentas"`);

    // ---------- 2. Columna empresa_id en cada tabla ----------
    await queryRunner.query(`ALTER TABLE "plan_de_cuentas" ADD "empresa_id" uuid`);
    await queryRunner.query(`ALTER TABLE "asientos_contables" ADD "empresa_id" uuid`);
    await queryRunner.query(`ALTER TABLE "cuentas_financieras" ADD "empresa_id" uuid`);
    await queryRunner.query(`ALTER TABLE "transacciones" ADD "empresa_id" uuid`);

    // Las tablas quedaron vacías, así que NOT NULL es seguro.
    await queryRunner.query(`ALTER TABLE "plan_de_cuentas" ALTER COLUMN "empresa_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "asientos_contables" ALTER COLUMN "empresa_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "cuentas_financieras" ALTER COLUMN "empresa_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "transacciones" ALTER COLUMN "empresa_id" SET NOT NULL`);

    // ---------- 3. El código pasa a ser único por negocio ----------
    await queryRunner.query(`DROP INDEX "public"."IDX_ca132ecff5a79a800ab06c7e17"`);

    // ---------- 4. Índices ----------
    await queryRunner.query(`CREATE INDEX "IDX_plan_de_cuentas_empresa_id" ON "plan_de_cuentas" ("empresa_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_plan_de_cuentas_empresa_codigo" ON "plan_de_cuentas" ("empresa_id", "codigo")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_asientos_contables_empresa_id" ON "asientos_contables" ("empresa_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_asientos_contables_empresa_fecha" ON "asientos_contables" ("empresa_id", "fecha")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_cuentas_financieras_empresa_id" ON "cuentas_financieras" ("empresa_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_transacciones_empresa_id" ON "transacciones" ("empresa_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_transacciones_empresa_fecha" ON "transacciones" ("empresa_id", "fecha_creacion")`,
    );

    // ---------- 5. Foráneas ----------
    await queryRunner.query(
      `ALTER TABLE "plan_de_cuentas" ADD CONSTRAINT "FK_plan_de_cuentas_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asientos_contables" ADD CONSTRAINT "FK_asientos_contables_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "FK_cuentas_financieras_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transacciones" ADD CONSTRAINT "FK_transacciones_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Nota: la limpieza de datos no es reversible.
    await queryRunner.query(`ALTER TABLE "transacciones" DROP CONSTRAINT "FK_transacciones_empresa"`);
    await queryRunner.query(`ALTER TABLE "cuentas_financieras" DROP CONSTRAINT "FK_cuentas_financieras_empresa"`);
    await queryRunner.query(`ALTER TABLE "asientos_contables" DROP CONSTRAINT "FK_asientos_contables_empresa"`);
    await queryRunner.query(`ALTER TABLE "plan_de_cuentas" DROP CONSTRAINT "FK_plan_de_cuentas_empresa"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_transacciones_empresa_fecha"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transacciones_empresa_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cuentas_financieras_empresa_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_asientos_contables_empresa_fecha"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_asientos_contables_empresa_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_de_cuentas_empresa_codigo"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_de_cuentas_empresa_id"`);

    // Restaura el índice único global sobre el código.
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ca132ecff5a79a800ab06c7e17" ON "plan_de_cuentas" ("codigo")`);

    await queryRunner.query(`ALTER TABLE "transacciones" DROP COLUMN "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "cuentas_financieras" DROP COLUMN "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "asientos_contables" DROP COLUMN "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "plan_de_cuentas" DROP COLUMN "empresa_id"`);
  }
}
