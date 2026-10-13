import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de Compras y Gastos (multi-tenant).
 *
 * Crea las tablas del módulo:
 *  - proveedores          : CRUD de proveedores por negocio
 *  - compras              : cabecera de factura de compra (contado o crédito)
 *  - compras_detalles     : líneas de la factura (con producto/variante opcionales)
 *  - compras_pagos        : pagos parciales o totales a proveedores
 *  - categorias_gasto     : categorías que mapean a una cuenta contable (clase 5)
 *  - gastos               : gastos operativos pagados desde una caja/banco
 */
export class CrearModuloComprasYGastos1791700000000 implements MigrationInterface {
  name = 'CrearModuloComprasYGastos1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- Tipos enum ----------
    await queryRunner.query(`
      CREATE TYPE public.proveedores_condiciones_pago_enum AS ENUM (
        'CONTADO',
        'CREDITO_30',
        'CREDITO_60',
        'CREDITO_90'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE public.compras_tipo_pago_enum AS ENUM (
        'CONTADO',
        'CREDITO'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE public.compras_estado_enum AS ENUM (
        'RECIBIDA',
        'PAGADA',
        'ANULADA'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE public.gastos_estado_enum AS ENUM (
        'PAGADO',
        'ANULADO'
      );
    `);

    // ---------- Tablas ----------
    await queryRunner.query(`
      CREATE TABLE public.proveedores (
        id uuid DEFAULT uuid_generate_v4() NOT NULL,
        empresa_id uuid NOT NULL,
        nombre character varying(255) NOT NULL,
        rif character varying(50) NOT NULL,
        contacto character varying(255),
        telefono character varying(50),
        email character varying(255),
        direccion text,
        condiciones_pago public.proveedores_condiciones_pago_enum DEFAULT 'CONTADO'::public.proveedores_condiciones_pago_enum NOT NULL,
        activo boolean DEFAULT true NOT NULL,
        notas text,
        creado_en timestamp with time zone DEFAULT now() NOT NULL,
        actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_proveedores" PRIMARY KEY (id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.compras (
        id uuid DEFAULT uuid_generate_v4() NOT NULL,
        empresa_id uuid NOT NULL,
        proveedor_id uuid NOT NULL,
        numero_factura character varying(50) NOT NULL,
        fecha date NOT NULL,
        fecha_vencimiento date,
        tipo_pago public.compras_tipo_pago_enum DEFAULT 'CONTADO'::public.compras_tipo_pago_enum NOT NULL,
        estado public.compras_estado_enum DEFAULT 'RECIBIDA'::public.compras_estado_enum NOT NULL,
        moneda character varying(3) DEFAULT 'BOB'::character varying NOT NULL,
        tasa_aplicada numeric(10,4) DEFAULT 1 NOT NULL,
        tipo_cambio_id uuid,
        subtotal numeric(15,2) NOT NULL,
        iva numeric(15,2) DEFAULT 0 NOT NULL,
        total numeric(15,2) NOT NULL,
        monto_en_moneda_base numeric(15,2) NOT NULL,
        saldo_pendiente numeric(15,2) DEFAULT 0 NOT NULL,
        cuenta_financiera_id uuid,
        asiento_id uuid,
        notas text,
        creado_en timestamp with time zone DEFAULT now() NOT NULL,
        actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_compras" PRIMARY KEY (id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.compras_detalles (
        id uuid DEFAULT uuid_generate_v4() NOT NULL,
        compra_id uuid NOT NULL,
        producto_id uuid,
        variante_id uuid,
        descripcion character varying(255) NOT NULL,
        cantidad integer NOT NULL,
        costo_unitario numeric(12,2) NOT NULL,
        subtotal numeric(15,2) NOT NULL,
        CONSTRAINT "PK_compras_detalles" PRIMARY KEY (id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.compras_pagos (
        id uuid DEFAULT uuid_generate_v4() NOT NULL,
        empresa_id uuid NOT NULL,
        compra_id uuid NOT NULL,
        cuenta_financiera_id uuid NOT NULL,
        monto numeric(15,2) NOT NULL,
        monto_en_moneda_base numeric(15,2) NOT NULL,
        tasa_aplicada numeric(10,4) DEFAULT 1 NOT NULL,
        tipo_cambio_id uuid,
        asiento_id uuid,
        referencia character varying(100),
        notas text,
        fecha timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_compras_pagos" PRIMARY KEY (id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.categorias_gasto (
        id uuid DEFAULT uuid_generate_v4() NOT NULL,
        empresa_id uuid NOT NULL,
        nombre character varying(100) NOT NULL,
        cuenta_contable_id uuid NOT NULL,
        activa boolean DEFAULT true NOT NULL,
        creado_en timestamp with time zone DEFAULT now() NOT NULL,
        actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_categorias_gasto" PRIMARY KEY (id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.gastos (
        id uuid DEFAULT uuid_generate_v4() NOT NULL,
        empresa_id uuid NOT NULL,
        categoria_id uuid NOT NULL,
        cuenta_financiera_id uuid NOT NULL,
        fecha timestamp with time zone DEFAULT now() NOT NULL,
        descripcion text NOT NULL,
        numero_comprobante character varying(100),
        moneda character varying(3) DEFAULT 'BOB'::character varying NOT NULL,
        monto numeric(15,2) NOT NULL,
        iva numeric(15,2) DEFAULT 0 NOT NULL,
        tasa_aplicada numeric(10,4) DEFAULT 1 NOT NULL,
        tipo_cambio_id uuid,
        monto_en_moneda_base numeric(15,2) NOT NULL,
        estado public.gastos_estado_enum DEFAULT 'PAGADO'::public.gastos_estado_enum NOT NULL,
        asiento_id uuid,
        usuario_id uuid,
        creado_en timestamp with time zone DEFAULT now() NOT NULL,
        actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_gastos" PRIMARY KEY (id)
      );
    `);

    // ---------- Índices ----------
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_proveedores_empresa_rif" ON public.proveedores ("empresa_id", "rif")`);
    await queryRunner.query(`CREATE INDEX "IDX_proveedores_empresa_id" ON public.proveedores ("empresa_id")`);

    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_compras_empresa_proveedor_factura" ON public.compras ("empresa_id", "proveedor_id", "numero_factura")`);
    await queryRunner.query(`CREATE INDEX "IDX_compras_empresa_fecha" ON public.compras ("empresa_id", "fecha")`);
    await queryRunner.query(`CREATE INDEX "IDX_compras_empresa_estado" ON public.compras ("empresa_id", "estado")`);

    await queryRunner.query(`CREATE INDEX "IDX_compras_detalles_compra_id" ON public.compras_detalles ("compra_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_compras_detalles_producto_id" ON public.compras_detalles ("producto_id")`);

    await queryRunner.query(`CREATE INDEX "IDX_compras_pagos_compra_id" ON public.compras_pagos ("compra_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_compras_pagos_empresa_fecha" ON public.compras_pagos ("empresa_id", "fecha")`);

    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_categorias_gasto_empresa_nombre" ON public.categorias_gasto ("empresa_id", "nombre")`);
    await queryRunner.query(`CREATE INDEX "IDX_categorias_gasto_empresa_id" ON public.categorias_gasto ("empresa_id")`);

    await queryRunner.query(`CREATE INDEX "IDX_gastos_empresa_fecha" ON public.gastos ("empresa_id", "fecha")`);
    await queryRunner.query(`CREATE INDEX "IDX_gastos_empresa_categoria" ON public.gastos ("empresa_id", "categoria_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_gastos_empresa_estado" ON public.gastos ("empresa_id", "estado")`);

    // ---------- Foráneas ----------
    await queryRunner.query(
      `ALTER TABLE public.proveedores ADD CONSTRAINT "FK_proveedores_empresa" FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras ADD CONSTRAINT "FK_compras_empresa" FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras ADD CONSTRAINT "FK_compras_proveedor" FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras ADD CONSTRAINT "FK_compras_cuenta_financiera" FOREIGN KEY (cuenta_financiera_id) REFERENCES public.cuentas_financieras(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras ADD CONSTRAINT "FK_compras_tipo_cambio" FOREIGN KEY (tipo_cambio_id) REFERENCES public.tipos_cambio(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras ADD CONSTRAINT "FK_compras_asiento" FOREIGN KEY (asiento_id) REFERENCES public.asientos_contables(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_detalles ADD CONSTRAINT "FK_compras_detalles_compra" FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_detalles ADD CONSTRAINT "FK_compras_detalles_producto" FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_detalles ADD CONSTRAINT "FK_compras_detalles_variante" FOREIGN KEY (variante_id) REFERENCES public.producto_variantes(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_pagos ADD CONSTRAINT "FK_compras_pagos_empresa" FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_pagos ADD CONSTRAINT "FK_compras_pagos_compra" FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_pagos ADD CONSTRAINT "FK_compras_pagos_cuenta_financiera" FOREIGN KEY (cuenta_financiera_id) REFERENCES public.cuentas_financieras(id) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_pagos ADD CONSTRAINT "FK_compras_pagos_tipo_cambio" FOREIGN KEY (tipo_cambio_id) REFERENCES public.tipos_cambio(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.compras_pagos ADD CONSTRAINT "FK_compras_pagos_asiento" FOREIGN KEY (asiento_id) REFERENCES public.asientos_contables(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.categorias_gasto ADD CONSTRAINT "FK_categorias_gasto_empresa" FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.categorias_gasto ADD CONSTRAINT "FK_categorias_gasto_cuenta_contable" FOREIGN KEY (cuenta_contable_id) REFERENCES public.plan_de_cuentas(id) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.gastos ADD CONSTRAINT "FK_gastos_empresa" FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.gastos ADD CONSTRAINT "FK_gastos_categoria" FOREIGN KEY (categoria_id) REFERENCES public.categorias_gasto(id) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.gastos ADD CONSTRAINT "FK_gastos_cuenta_financiera" FOREIGN KEY (cuenta_financiera_id) REFERENCES public.cuentas_financieras(id) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.gastos ADD CONSTRAINT "FK_gastos_tipo_cambio" FOREIGN KEY (tipo_cambio_id) REFERENCES public.tipos_cambio(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.gastos ADD CONSTRAINT "FK_gastos_asiento" FOREIGN KEY (asiento_id) REFERENCES public.asientos_contables(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE public.gastos ADD CONSTRAINT "FK_gastos_usuario" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.gastos DROP CONSTRAINT "FK_gastos_usuario"`);
    await queryRunner.query(`ALTER TABLE public.gastos DROP CONSTRAINT "FK_gastos_asiento"`);
    await queryRunner.query(`ALTER TABLE public.gastos DROP CONSTRAINT "FK_gastos_tipo_cambio"`);
    await queryRunner.query(`ALTER TABLE public.gastos DROP CONSTRAINT "FK_gastos_cuenta_financiera"`);
    await queryRunner.query(`ALTER TABLE public.gastos DROP CONSTRAINT "FK_gastos_categoria"`);
    await queryRunner.query(`ALTER TABLE public.gastos DROP CONSTRAINT "FK_gastos_empresa"`);

    await queryRunner.query(`ALTER TABLE public.categorias_gasto DROP CONSTRAINT "FK_categorias_gasto_cuenta_contable"`);
    await queryRunner.query(`ALTER TABLE public.categorias_gasto DROP CONSTRAINT "FK_categorias_gasto_empresa"`);

    await queryRunner.query(`ALTER TABLE public.compras_pagos DROP CONSTRAINT "FK_compras_pagos_asiento"`);
    await queryRunner.query(`ALTER TABLE public.compras_pagos DROP CONSTRAINT "FK_compras_pagos_tipo_cambio"`);
    await queryRunner.query(`ALTER TABLE public.compras_pagos DROP CONSTRAINT "FK_compras_pagos_cuenta_financiera"`);
    await queryRunner.query(`ALTER TABLE public.compras_pagos DROP CONSTRAINT "FK_compras_pagos_compra"`);
    await queryRunner.query(`ALTER TABLE public.compras_pagos DROP CONSTRAINT "FK_compras_pagos_empresa"`);

    await queryRunner.query(`ALTER TABLE public.compras_detalles DROP CONSTRAINT "FK_compras_detalles_variante"`);
    await queryRunner.query(`ALTER TABLE public.compras_detalles DROP CONSTRAINT "FK_compras_detalles_producto"`);
    await queryRunner.query(`ALTER TABLE public.compras_detalles DROP CONSTRAINT "FK_compras_detalles_compra"`);

    await queryRunner.query(`ALTER TABLE public.compras DROP CONSTRAINT "FK_compras_asiento"`);
    await queryRunner.query(`ALTER TABLE public.compras DROP CONSTRAINT "FK_compras_tipo_cambio"`);
    await queryRunner.query(`ALTER TABLE public.compras DROP CONSTRAINT "FK_compras_cuenta_financiera"`);
    await queryRunner.query(`ALTER TABLE public.compras DROP CONSTRAINT "FK_compras_proveedor"`);
    await queryRunner.query(`ALTER TABLE public.compras DROP CONSTRAINT "FK_compras_empresa"`);

    await queryRunner.query(`ALTER TABLE public.proveedores DROP CONSTRAINT "FK_proveedores_empresa"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_gastos_empresa_estado"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_gastos_empresa_categoria"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_gastos_empresa_fecha"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_categorias_gasto_empresa_id"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_categorias_gasto_empresa_nombre"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_compras_pagos_empresa_fecha"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_compras_pagos_compra_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_compras_detalles_producto_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_compras_detalles_compra_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_compras_empresa_estado"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_compras_empresa_fecha"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_compras_empresa_proveedor_factura"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_proveedores_empresa_id"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_proveedores_empresa_rif"`);

    await queryRunner.query(`DROP TABLE public.gastos`);
    await queryRunner.query(`DROP TABLE public.categorias_gasto`);
    await queryRunner.query(`DROP TABLE public.compras_pagos`);
    await queryRunner.query(`DROP TABLE public.compras_detalles`);
    await queryRunner.query(`DROP TABLE public.compras`);
    await queryRunner.query(`DROP TABLE public.proveedores`);

    await queryRunner.query(`DROP TYPE public.gastos_estado_enum`);
    await queryRunner.query(`DROP TYPE public.compras_estado_enum`);
    await queryRunner.query(`DROP TYPE public.compras_tipo_pago_enum`);
    await queryRunner.query(`DROP TYPE public.proveedores_condiciones_pago_enum`);
  }
}
