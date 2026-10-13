import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1791533603941 implements MigrationInterface {
  name = 'InitSchema1791533603941';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- uuid_generate_v4() NO ir calificado con "public.": la extensión no siempre
-- vive en public. Supabase la preinstala en el schema "extensions", así que
-- este CREATE EXTENSION resulta en un no-op (IF NOT EXISTS) y la referencia
-- pública no resolvería: la migración moriría con "function does not exist".
-- Sin calificar, el search_path la encuentra en ambos entornos
-- (local "$user", public / Supabase "$user", public, extensions).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TYPE public.cuentas_financieras_tipo_enum AS ENUM (
    'EFECTIVO',
    'BANCO'
);
CREATE TYPE public.transacciones_tipo_enum AS ENUM (
    'INGRESO',
    'EGRESO',
    'TRANSFERENCIA'
);
CREATE TYPE public.usuarios_proveedor_enum AS ENUM (
    'local',
    'google',
    'supabase'
);
CREATE TYPE public.usuarios_roles_enum AS ENUM (
    'usuario',
    'admin',
    'contador'
);
CREATE TABLE public.asientos_contables (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    fecha timestamp with time zone NOT NULL,
    glosa text NOT NULL,
    referencia character varying(100),
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cuentas_financieras (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    nombre character varying(255) NOT NULL,
    tipo public.cuentas_financieras_tipo_enum NOT NULL,
    moneda character varying(3) DEFAULT 'BOB'::character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    saldo numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    cuenta_contable_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.detalles_asiento (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    asiento_id uuid NOT NULL,
    cuenta_id uuid NOT NULL,
    debe numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    haber numeric(15,2) DEFAULT '0'::numeric NOT NULL
);
CREATE TABLE public.plan_de_cuentas (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    codigo character varying(20) NOT NULL,
    nombre character varying(255) NOT NULL,
    cuenta_padre_id uuid,
    es_transaccional boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.transacciones (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    cuenta_financiera_id uuid NOT NULL,
    tipo public.transacciones_tipo_enum NOT NULL,
    monto numeric(15,2) NOT NULL,
    descripcion text,
    referencia character varying(100),
    cuenta_destino_id uuid,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.usuarios (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    correo character varying(255) NOT NULL,
    nombre_completo character varying(255),
    url_avatar text,
    proveedor public.usuarios_proveedor_enum DEFAULT 'local'::public.usuarios_proveedor_enum NOT NULL,
    proveedor_id character varying(255),
    hash_contrasena character varying(255),
    hash_refresh_token text,
    roles public.usuarios_roles_enum[] DEFAULT '{usuario}'::public.usuarios_roles_enum[] NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    correo_verificado boolean DEFAULT false NOT NULL,
    ultimo_login timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    eliminado_en timestamp with time zone
);
ALTER TABLE ONLY public.transacciones
    ADD CONSTRAINT "PK_0a2c5d8bfe49d3bbccff3f17e8c" PRIMARY KEY (id);
ALTER TABLE ONLY public.cuentas_financieras
    ADD CONSTRAINT "PK_8eea1c8109a4caafcb5a5a35e5f" PRIMARY KEY (id);
ALTER TABLE ONLY public.detalles_asiento
    ADD CONSTRAINT "PK_a698f62475ef4e9ae39bf392fd7" PRIMARY KEY (id);
ALTER TABLE ONLY public.plan_de_cuentas
    ADD CONSTRAINT "PK_bbf6d3f1cd92402eda3143fb961" PRIMARY KEY (id);
ALTER TABLE ONLY public.asientos_contables
    ADD CONSTRAINT "PK_d65d3bfd43da26ef441362c0a35" PRIMARY KEY (id);
ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY (id);
ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT "UQ_63665765c1a778a770c9bd585d3" UNIQUE (correo);
CREATE INDEX "IDX_41eba9eaeae9d09aeea1ce71ae" ON public.usuarios USING btree (proveedor, proveedor_id);
CREATE INDEX "IDX_b3800b815503472d9c873f4ac0" ON public.detalles_asiento USING btree (asiento_id, cuenta_id);
CREATE UNIQUE INDEX "IDX_ca132ecff5a79a800ab06c7e17" ON public.plan_de_cuentas USING btree (codigo);
CREATE INDEX "IDX_fbc1475fee80c9e52f0d1afb24" ON public.transacciones USING btree (cuenta_financiera_id, fecha_creacion);
ALTER TABLE ONLY public.plan_de_cuentas
    ADD CONSTRAINT "FK_3d524a68e697800be1ad409bd97" FOREIGN KEY (cuenta_padre_id) REFERENCES public.plan_de_cuentas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cuentas_financieras
    ADD CONSTRAINT "FK_40a9ec87cfd76f211eb80708b24" FOREIGN KEY (cuenta_contable_id) REFERENCES public.plan_de_cuentas(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.detalles_asiento
    ADD CONSTRAINT "FK_61228ffd75406da73ed9b1d7b00" FOREIGN KEY (asiento_id) REFERENCES public.asientos_contables(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.detalles_asiento
    ADD CONSTRAINT "FK_6d23b324916b721574dcb8b1817" FOREIGN KEY (cuenta_id) REFERENCES public.plan_de_cuentas(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.transacciones
    ADD CONSTRAINT "FK_aee3aad5cb305cec8e4fd080d26" FOREIGN KEY (cuenta_destino_id) REFERENCES public.cuentas_financieras(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.transacciones
    ADD CONSTRAINT "FK_f8d09b8de20de6c726eee53632e" FOREIGN KEY (cuenta_financiera_id) REFERENCES public.cuentas_financieras(id) ON DELETE RESTRICT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS public.transacciones;
  DROP TABLE IF EXISTS public.cuentas_financieras;
  DROP TABLE IF EXISTS public.detalles_asiento;
  DROP TABLE IF EXISTS public.asientos_contables;
  DROP TABLE IF EXISTS public.plan_de_cuentas;
  DROP TABLE IF EXISTS public.usuarios;
  DROP TYPE IF EXISTS public.transacciones_tipo_enum;
  DROP TYPE IF EXISTS public.cuentas_financieras_tipo_enum;
  DROP TYPE IF EXISTS public.usuarios_roles_enum;
  DROP TYPE IF EXISTS public.usuarios_proveedor_enum;
    `);
  }
}
