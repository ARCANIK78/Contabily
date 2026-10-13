import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Las 8 tablas de empresa e inventario que `synchronize: true` creó durante el
 * desarrollo y que ninguna migración anterior llegó a capturar. Sin ellas la
 * cadena no puede ejecutarse en una base limpia:
 *
 *   - 1791604000000 añade `empresa_id` con FK a `empresas`.
 *   - 1791700000000 referencia `empresas`, `productos` y `producto_variantes`.
 *
 * De ahí el timestamp anterior a ambas: el orden de ejecución las exige por
 * delante. (Local ya las tenía, por eso allí esta migración solo las registra.)
 *
 * `uuid_generate_v4()` va sin calificar a propósito: en Supabase la extensión
 * uuid-ossp vive en el schema "extensions", no en "public", y el prefijo no
 * resolvería. El search_path la encuentra en ambos entornos.
 */
export class FaltantesSincronizacionInicial1791590000000 implements MigrationInterface {
  name = 'FaltantesSincronizacionInicial1791590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TYPE "public"."empresas_tipo_enum" AS ENUM ('fisico', 'digital', 'servicios', 'hibrido');
CREATE TYPE "public"."empresas_moneda_enum" AS ENUM ('USD', 'EUR', 'MXN', 'COP', 'ARS', 'PEN', 'CLP', 'BOB', 'UYU', 'PYG', 'VES');
CREATE TYPE "public"."colecciones_tipo_enum" AS ENUM ('manual', 'automatica');
CREATE TYPE "public"."productos_tipo_enum" AS ENUM ('fisico', 'digital', 'servicio', 'suscripcion');
CREATE TYPE "public"."productos_estado_enum" AS ENUM ('activo', 'borrador', 'archivado', 'descontinuado');
CREATE TYPE "public"."movimientos_inventario_tipo_enum" AS ENUM ('entrada', 'salida', 'ajuste', 'transferencia', 'devolucion', 'merma', 'inventario_inicial');
CREATE TYPE "public"."movimientos_inventario_origen_enum" AS ENUM ('manual', 'venta', 'compra', 'devolucion_cliente', 'devolucion_proveedor', 'transferencia_interna', 'ajuste_inventario', 'sistema');
    `);
    await queryRunner.query(`
CREATE TABLE public.categorias (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    slug character varying(255) NOT NULL,
    imagen text,
    icono character varying(100),
    color character varying(7),
    orden integer DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "visibleEnMenu" boolean DEFAULT true NOT NULL,
    "tituloSeo" character varying(255),
    "descripcionSeo" character varying(500),
    configuracion jsonb,
    "empresaId" uuid NOT NULL,
    "padreId" uuid,
    path character varying(255),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.coleccion_productos (
    "coleccionId" uuid NOT NULL,
    "productoId" uuid NOT NULL
);
CREATE TABLE public.colecciones (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    slug character varying(255) NOT NULL,
    tipo public.colecciones_tipo_enum DEFAULT 'manual'::public.colecciones_tipo_enum NOT NULL,
    imagen text,
    condiciones jsonb,
    orden integer DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "visibleEnTienda" boolean DEFAULT true NOT NULL,
    "tituloSeo" character varying(255),
    "descripcionSeo" character varying(500),
    configuracion jsonb,
    "empresaId" uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
-- empresas NO incluye secuencia_asientos a propósito: esa columna la añade
-- más adelante 1791800000000 (AgregarCorrelativoYEstadoAAsientos). Meterla
-- aquí provocaría "column already exists" al llegar esa migración.
CREATE TABLE public.empresas (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    nombre character varying(255) NOT NULL,
    "razonSocial" character varying(255),
    rif character varying(50) NOT NULL,
    "direccionFiscal" text,
    telefono character varying(50),
    email character varying(255),
    "sitioWeb" character varying(255),
    "logoUrl" text,
    tipo public.empresas_tipo_enum DEFAULT 'fisico'::public.empresas_tipo_enum NOT NULL,
    moneda public.empresas_moneda_enum DEFAULT 'USD'::public.empresas_moneda_enum NOT NULL,
    "zonaHoraria" character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    locale character varying(10) DEFAULT 'es'::character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    configuracion jsonb,
    "usuarioId" uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.movimientos_inventario (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    "numeroReferencia" character varying(100) NOT NULL,
    tipo public.movimientos_inventario_tipo_enum NOT NULL,
    origen public.movimientos_inventario_origen_enum DEFAULT 'manual'::public.movimientos_inventario_origen_enum NOT NULL,
    "documentoOrigenId" uuid,
    "tipoDocumentoOrigen" character varying(50),
    "empresaId" uuid NOT NULL,
    "productoId" uuid NOT NULL,
    "varianteId" uuid,
    cantidad integer NOT NULL,
    "stockAnterior" integer NOT NULL,
    "stockPosterior" integer NOT NULL,
    "costoUnitario" numeric(12,2),
    "costoTotal" numeric(12,2),
    "ubicacionOrigen" character varying(100),
    "ubicacionDestino" character varying(100),
    "usuarioId" uuid,
    notas text,
    metadatos jsonb,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.producto_colecciones (
    "productoId" uuid NOT NULL,
    "coleccionId" uuid NOT NULL
);
CREATE TABLE public.producto_variantes (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    sku character varying(100) NOT NULL,
    "codigoBarras" character varying(100),
    nombre character varying(255),
    opciones jsonb NOT NULL,
    precio numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    costo numeric(12,2),
    "precioComparacion" numeric(12,2),
    "rastrearInventario" boolean DEFAULT true NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    "stockMinimo" integer,
    "stockMaximo" integer,
    "permitirBackorder" boolean DEFAULT false NOT NULL,
    peso integer,
    largo numeric(8,2),
    ancho numeric(8,2),
    alto numeric(8,2),
    imagen text,
    mpn character varying(100),
    gtin character varying(100),
    configuracion jsonb,
    activo boolean DEFAULT true NOT NULL,
    "productoId" uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.productos (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    sku character varying(100) NOT NULL,
    "codigoBarras" character varying(100),
    nombre character varying(255) NOT NULL,
    descripcion text,
    "descripcionCorta" character varying(500),
    tipo public.productos_tipo_enum DEFAULT 'fisico'::public.productos_tipo_enum NOT NULL,
    estado public.productos_estado_enum DEFAULT 'borrador'::public.productos_estado_enum NOT NULL,
    precio numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    costo numeric(12,2),
    "precioComparacion" numeric(12,2),
    "precioMayor" numeric(12,2),
    "cantidadMinimaMayor" integer,
    "rastrearInventario" boolean DEFAULT true NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    "stockMinimo" integer,
    "stockMaximo" integer,
    "permitirBackorder" boolean DEFAULT false NOT NULL,
    peso integer,
    largo numeric(8,2),
    ancho numeric(8,2),
    alto numeric(8,2),
    "requiereEnvio" boolean DEFAULT true NOT NULL,
    "exentoImpuestos" boolean DEFAULT false NOT NULL,
    "codigoImpuesto" character varying(50),
    "tituloSeo" character varying(255),
    "descripcionSeo" character varying(500),
    slug character varying(255),
    "imagenPrincipal" text,
    imagenes jsonb,
    proveedor character varying(255),
    marca character varying(100),
    mpn character varying(100),
    gtin character varying(100),
    "requiereVariantes" boolean DEFAULT false NOT NULL,
    configuracion jsonb,
    "empresaId" uuid NOT NULL,
    "categoriaId" uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT "PK_04f604609a0949a7f3b43400766" PRIMARY KEY (id);
ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT "PK_20ae34aa8e270776414325962d2" PRIMARY KEY (id);
ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT "PK_3886a26251605c571c6b4f861fe" PRIMARY KEY (id);
ALTER TABLE ONLY public.coleccion_productos
    ADD CONSTRAINT "PK_5452cdc3fc64ed655dc6045b765" PRIMARY KEY ("coleccionId", "productoId");
ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "PK_812f6e4f95b017981363c4b9ff9" PRIMARY KEY (id);
ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT "PK_ce7b122b37c6499bfd6520873e1" PRIMARY KEY (id);
ALTER TABLE ONLY public.colecciones
    ADD CONSTRAINT "PK_e551277bebe59ba8ce24e25e818" PRIMARY KEY (id);
ALTER TABLE ONLY public.producto_colecciones
    ADD CONSTRAINT "PK_f85e80e4babd06f1f153e25350b" PRIMARY KEY ("productoId", "coleccionId");
ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT "UQ_4ceddd030ae654fbd8aa38e39b0" UNIQUE ("productoId", sku);
ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT "UQ_be571d6fbb549b51c55abb57812" UNIQUE ("empresaId", slug);
ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT "UQ_be9f29614c372b582299e5d6322" UNIQUE ("usuarioId", rif);
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT "UQ_bfcc9c7323228091d8c3b7b9c35" UNIQUE ("empresaId", sku);
ALTER TABLE ONLY public.colecciones
    ADD CONSTRAINT "UQ_d5416775faceb1cc3a435403c43" UNIQUE ("empresaId", slug);
CREATE INDEX "IDX_0427d3ca57345bf85408bfb44b" ON public.movimientos_inventario USING btree ("empresaId", "productoId");
CREATE INDEX "IDX_0aea0e84a2d1c140bb048942d4" ON public.coleccion_productos USING btree ("productoId");
CREATE INDEX "IDX_446c24633a81e1b0c9623dcce1" ON public.movimientos_inventario USING btree ("empresaId", creado_en);
CREATE INDEX "IDX_5352ff1fa9e13241ec8409b1fd" ON public.producto_colecciones USING btree ("coleccionId");
CREATE INDEX "IDX_5f013aba39a6cb7b6d67705102" ON public.productos USING btree ("empresaId", "categoriaId");
CREATE INDEX "IDX_68ec3ed287a9c7aee93cb44b80" ON public.colecciones USING btree ("empresaId", tipo);
CREATE INDEX "IDX_782a3789926c886aeecde73069" ON public.categorias USING btree ("empresaId", "padreId");
CREATE INDEX "IDX_7a68dd1700e845894ceabe4a02" ON public.movimientos_inventario USING btree ("empresaId", "varianteId");
CREATE INDEX "IDX_8db4ac5d7e6ebfbf4ff1d673c8" ON public.coleccion_productos USING btree ("coleccionId");
CREATE INDEX "IDX_9a9d18135616ec295fd8bdb0b2" ON public.movimientos_inventario USING btree ("empresaId", tipo);
CREATE INDEX "IDX_c3ce50909351595c695bf0b850" ON public.producto_colecciones USING btree ("productoId");
CREATE INDEX "IDX_ce30afa75c4fbd4697af6ea062" ON public.empresas USING btree ("usuarioId");
CREATE INDEX "IDX_fac23957230c5a32354b3993ed" ON public.productos USING btree ("empresaId", estado);
CREATE INDEX "IDX_ffc86eff7615749b06202c731a" ON public.producto_variantes USING btree ("productoId");
ALTER TABLE ONLY public.coleccion_productos
    ADD CONSTRAINT "FK_0aea0e84a2d1c140bb048942d40" FOREIGN KEY ("productoId") REFERENCES public.productos(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "FK_36a689b5824051c8a5308fcf08c" FOREIGN KEY ("productoId") REFERENCES public.productos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT "FK_4574b49467ba13d90afb555487e" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.producto_colecciones
    ADD CONSTRAINT "FK_5352ff1fa9e13241ec8409b1fd7" FOREIGN KEY ("coleccionId") REFERENCES public.colecciones(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.colecciones
    ADD CONSTRAINT "FK_5d231dcf56c011c921b22d63cea" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "FK_6770b8b7426b26886a096b374bd" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coleccion_productos
    ADD CONSTRAINT "FK_8db4ac5d7e6ebfbf4ff1d673c80" FOREIGN KEY ("coleccionId") REFERENCES public.colecciones(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT "FK_96333318425c7fdb8f2a210976c" FOREIGN KEY ("padreId") REFERENCES public.categorias(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT "FK_aee00189e42dd8880cdfe1bb1e7" FOREIGN KEY ("categoriaId") REFERENCES public.categorias(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.producto_colecciones
    ADD CONSTRAINT "FK_c3ce50909351595c695bf0b8504" FOREIGN KEY ("productoId") REFERENCES public.productos(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT "FK_ce30afa75c4fbd4697af6ea0621" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "FK_df3d388e3dae2ee638da225410f" FOREIGN KEY ("varianteId") REFERENCES public.producto_variantes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT "FK_e9aaed3575be9ea3d86edc22d4d" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT "FK_ffc86eff7615749b06202c731ad" FOREIGN KEY ("productoId") REFERENCES public.productos(id) ON DELETE CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DROP TABLE IF EXISTS public.producto_colecciones, public.coleccion_productos,
                     public.producto_variantes, public.movimientos_inventario,
                     public.productos, public.colecciones,
                     public.categorias, public.empresas CASCADE;
    `);
    await queryRunner.query(`
DROP TYPE IF EXISTS "public"."empresas_tipo_enum", "public"."empresas_moneda_enum",
                "public"."colecciones_tipo_enum", "public"."productos_tipo_enum",
                "public"."productos_estado_enum", "public"."movimientos_inventario_tipo_enum",
                "public"."movimientos_inventario_origen_enum";
    `);
  }
}
