import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correlativo, estado y autoría de los asientos contables (libro diario).
 *
 *  - numero            : correlativo secuencial POR NEGOCIO (global, no se resetea)
 *  - estado            : CONFIRMADO | ANULADO. La anulación es lógica: un libro
 *                        diario no se edita ni se borra, se anula y listo. Todos
 *                        los reportes de saldos excluyen los ANULADOS.
 *  - usuario_id        : quién generó el asiento (auditoría)
 *  - secuencia_asientos: contador en `empresas` que alimenta el correlativo.
 *                        Se incrementa con UPDATE ... RETURNING dentro de la
 *                        transacción del asiento, lo que bloquea la fila del
 *                        tenant y evita correlativos duplicados por concurrencia.
 *
 * `numero` nace nullable y se rellena correlativamente sobre los asientos
 * existentes, ordenados por fecha/creación, para no perder el histórico.
 */
export class AgregarCorrelativoYEstadoAAsientos1791800000000 implements MigrationInterface {
  name = 'AgregarCorrelativoYEstadoAAsientos1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE public.asientos_estado_enum AS ENUM (
        'CONFIRMADO',
        'ANULADO'
      );
    `);

    await queryRunner.query(`
      ALTER TABLE public.asientos_contables
        ADD COLUMN numero integer,
        ADD COLUMN estado public.asientos_estado_enum DEFAULT 'CONFIRMADO'::public.asientos_estado_enum NOT NULL,
        ADD COLUMN usuario_id uuid;
    `);

    // Rellena el correlativo del histórico respetando el orden en que se
    // registraron los asientos, particionando por negocio.
    await queryRunner.query(`
      UPDATE public.asientos_contables a
      SET numero = sub.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY empresa_id
          ORDER BY fecha ASC, creado_en ASC, id ASC
        )::integer AS rn
        FROM public.asientos_contables
      ) sub
      WHERE a.id = sub.id;
    `);

    await queryRunner.query(`
      ALTER TABLE public.empresas
        ADD COLUMN secuencia_asientos integer DEFAULT 0 NOT NULL;
    `);

    // Deja el contador al día con los números asignados en el paso anterior,
    // para que el siguiente asiento no arranque en 1 y pise el histórico.
    await queryRunner.query(`
      UPDATE public.empresas e
      SET secuencia_asientos = COALESCE(sub.total, 0)
      FROM (
        SELECT empresa_id, MAX(numero)::integer AS total
        FROM public.asientos_contables
        GROUP BY empresa_id
      ) sub
      WHERE e.id = sub.empresa_id;
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_asientos_contables_empresa_estado" ON public.asientos_contables ("empresa_id", "estado")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_asientos_contables_empresa_numero" ON public.asientos_contables ("empresa_id", "numero")`,
    );

    await queryRunner.query(
      `ALTER TABLE public.asientos_contables ADD CONSTRAINT "FK_asientos_contables_usuario" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.asientos_contables DROP CONSTRAINT "FK_asientos_contables_usuario"`,
    );

    await queryRunner.query(`DROP INDEX "public"."UQ_asientos_contables_empresa_numero"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_asientos_contables_empresa_estado"`);

    await queryRunner.query(`ALTER TABLE public.empresas DROP COLUMN secuencia_asientos`);

    await queryRunner.query(`
      ALTER TABLE public.asientos_contables
        DROP COLUMN usuario_id,
        DROP COLUMN estado,
        DROP COLUMN numero;
    `);

    await queryRunner.query(`DROP TYPE public.asientos_estado_enum`);
  }
}
