import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, IsArray, IsUUID, Min, Max, IsUrl, MinLength, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoProducto, EstadoProducto } from '../entities/producto.entity.js';

export class CrearProductoDto {
  @ApiProperty({ description: 'SKU único', example: 'CAM-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku: string;

  @ApiPropertyOptional({ description: 'Código de barras (GTIN, UPC, EAN, ISBN)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoBarras?: string;

  @ApiProperty({ description: 'Nombre del producto', example: 'Camiseta Básica' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción detallada' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Descripción corta para listados' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcionCorta?: string;

  @ApiProperty({ description: 'Tipo de producto', enum: TipoProducto })
  @IsEnum(TipoProducto)
  tipo: TipoProducto;

  @ApiPropertyOptional({ description: 'Estado del producto', enum: EstadoProducto })
  @IsOptional()
  @IsEnum(EstadoProducto)
  estado?: EstadoProducto;

  @ApiProperty({ description: 'Precio de venta base', example: 29.99 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @ApiPropertyOptional({ description: 'Precio de costo', example: 15.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costo?: number;

  @ApiPropertyOptional({ description: 'Precio de comparación (tachado)', example: 39.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioComparacion?: number;

  @ApiPropertyOptional({ description: 'Precio por mayor', example: 25.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioMayor?: number;

  @ApiPropertyOptional({ description: 'Cantidad mínima para precio mayor', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  cantidadMinimaMayor?: number;

  @ApiPropertyOptional({ description: 'Rastrear inventario', default: true })
  @IsOptional()
  @IsBoolean()
  rastrearInventario?: boolean;

  @ApiPropertyOptional({ description: 'Stock inicial (solo productos sin variantes)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Stock mínimo para alerta', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockMinimo?: number;

  @ApiPropertyOptional({ description: 'Stock máximo', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockMaximo?: number;

  @ApiPropertyOptional({ description: 'Permitir venta sin stock', default: false })
  @IsOptional()
  @IsBoolean()
  permitirBackorder?: boolean;

  @ApiPropertyOptional({ description: 'Peso en gramos', example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  peso?: number;

  @ApiPropertyOptional({ description: 'Largo en cm', example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  largo?: number;

  @ApiPropertyOptional({ description: 'Ancho en cm', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ancho?: number;

  @ApiPropertyOptional({ description: 'Alto en cm', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alto?: number;

  @ApiPropertyOptional({ description: 'Requiere envío', default: true })
  @IsOptional()
  @IsBoolean()
  requiereEnvio?: boolean;

  @ApiPropertyOptional({ description: 'Exento de impuestos', default: false })
  @IsOptional()
  @IsBoolean()
  exentoImpuestos?: boolean;

  @ApiPropertyOptional({ description: 'Código de impuesto personalizado' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoImpuesto?: string;

  @ApiPropertyOptional({ description: 'Título SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tituloSeo?: string;

  @ApiPropertyOptional({ description: 'Descripción SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcionSeo?: string;

  @ApiPropertyOptional({ description: 'Slug URL', example: 'camiseta-basica' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional({ description: 'URL imagen principal' })
  @IsOptional()
  @IsUrl()
  imagenPrincipal?: string;

  @ApiPropertyOptional({ description: 'Galería de imágenes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imagenes?: string[];

  @ApiPropertyOptional({ description: 'Proveedor / Vendedor' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proveedor?: string;

  @ApiPropertyOptional({ description: 'Marca' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  marca?: string;

  @ApiPropertyOptional({ description: 'Código MPN del fabricante' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mpn?: string;

  @ApiPropertyOptional({ description: 'GTIN global' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gtin?: string;

  @ApiPropertyOptional({ description: 'Requiere variantes para venderse', default: false })
  @IsOptional()
  @IsBoolean()
  requiereVariantes?: boolean;

  @ApiPropertyOptional({ description: 'ID de categoría' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ description: 'IDs de colecciones', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  coleccionIds?: string[];

  @ApiPropertyOptional({ description: 'Configuración adicional (JSON)' })
  @IsOptional()
  configuracion?: Record<string, any>;
}

export class ActualizarProductoDto {
  @ApiPropertyOptional({ description: 'SKU único' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ description: 'Código de barras' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoBarras?: string;

  @ApiPropertyOptional({ description: 'Nombre del producto' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Descripción detallada' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Descripción corta' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcionCorta?: string;

  @ApiPropertyOptional({ description: 'Tipo de producto', enum: TipoProducto })
  @IsOptional()
  @IsEnum(TipoProducto)
  tipo?: TipoProducto;

  @ApiPropertyOptional({ description: 'Estado', enum: EstadoProducto })
  @IsOptional()
  @IsEnum(EstadoProducto)
  estado?: EstadoProducto;

  @ApiPropertyOptional({ description: 'Precio de venta', example: 29.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio?: number;

  @ApiPropertyOptional({ description: 'Precio de costo', example: 15.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costo?: number;

  @ApiPropertyOptional({ description: 'Precio de comparación', example: 39.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioComparacion?: number;

  @ApiPropertyOptional({ description: 'Precio por mayor', example: 25.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioMayor?: number;

  @ApiPropertyOptional({ description: 'Cantidad mínima para precio mayor', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  cantidadMinimaMayor?: number;

  @ApiPropertyOptional({ description: 'Rastrear inventario' })
  @IsOptional()
  @IsBoolean()
  rastrearInventario?: boolean;

  @ApiPropertyOptional({ description: 'Stock (solo sin variantes)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Stock mínimo', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockMinimo?: number;

  @ApiPropertyOptional({ description: 'Stock máximo', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockMaximo?: number;

  @ApiPropertyOptional({ description: 'Permitir backorder' })
  @IsOptional()
  @IsBoolean()
  permitirBackorder?: boolean;

  @ApiPropertyOptional({ description: 'Peso en gramos', example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  peso?: number;

  @ApiPropertyOptional({ description: 'Largo en cm' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  largo?: number;

  @ApiPropertyOptional({ description: 'Ancho en cm' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ancho?: number;

  @ApiPropertyOptional({ description: 'Alto en cm' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alto?: number;

  @ApiPropertyOptional({ description: 'Requiere envío' })
  @IsOptional()
  @IsBoolean()
  requiereEnvio?: boolean;

  @ApiPropertyOptional({ description: 'Exento de impuestos' })
  @IsOptional()
  @IsBoolean()
  exentoImpuestos?: boolean;

  @ApiPropertyOptional({ description: 'Código de impuesto' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoImpuesto?: string;

  @ApiPropertyOptional({ description: 'Título SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tituloSeo?: string;

  @ApiPropertyOptional({ description: 'Descripción SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcionSeo?: string;

  @ApiPropertyOptional({ description: 'Slug URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional({ description: 'URL imagen principal' })
  @IsOptional()
  @IsUrl()
  imagenPrincipal?: string;

  @ApiPropertyOptional({ description: 'Galería de imágenes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imagenes?: string[];

  @ApiPropertyOptional({ description: 'Proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proveedor?: string;

  @ApiPropertyOptional({ description: 'Marca' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  marca?: string;

  @ApiPropertyOptional({ description: 'MPN' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mpn?: string;

  @ApiPropertyOptional({ description: 'GTIN' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gtin?: string;

  @ApiPropertyOptional({ description: 'Requiere variantes' })
  @IsOptional()
  @IsBoolean()
  requiereVariantes?: boolean;

  @ApiPropertyOptional({ description: 'ID de categoría' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string | null;

  @ApiPropertyOptional({ description: 'IDs de colecciones', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  coleccionIds?: string[];

  @ApiPropertyOptional({ description: 'Configuración adicional' })
  @IsOptional()
  configuracion?: Record<string, any>;
}

export class FiltroProductoDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre, SKU, código de barras' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado', enum: EstadoProducto })
  @IsOptional()
  @IsEnum(EstadoProducto)
  estado?: EstadoProducto;

  @ApiPropertyOptional({ description: 'Filtrar por tipo', enum: TipoProducto })
  @IsOptional()
  @IsEnum(TipoProducto)
  tipo?: TipoProducto;

  @ApiPropertyOptional({ description: 'ID de categoría' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ description: 'ID de colección' })
  @IsOptional()
  @IsUUID()
  coleccionId?: string;

  @ApiPropertyOptional({ description: 'Filtrar con stock bajo' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  stockBajo?: boolean;

  @ApiPropertyOptional({ description: 'Filtrar sin stock' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sinStock?: boolean;

  @ApiPropertyOptional({ description: 'Precio mínimo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioMin?: number;

  @ApiPropertyOptional({ description: 'Precio máximo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioMax?: number;

  @ApiPropertyOptional({ description: 'Proveedor' })
  @IsOptional()
  @IsString()
  proveedor?: string;

  @ApiPropertyOptional({ description: 'Marca' })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional({ description: 'Página', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pagina?: number = 1;

  @ApiPropertyOptional({ description: 'Elementos por página', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limite?: number = 20;

  @ApiPropertyOptional({ description: 'Ordenar por', enum: ['nombre', 'precio', 'stock', 'creadoEn', 'actualizadoEn'] })
  @IsOptional()
  @IsString()
  ordenarPor?: string = 'creadoEn';

  @ApiPropertyOptional({ description: 'Dirección', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  orden?: 'ASC' | 'DESC' = 'DESC';
}

export class AjusteStockDto {
  @ApiProperty({ description: 'Nuevo stock absoluto', example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ description: 'Motivo del ajuste' })
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class MovimientoStockDto {
  @ApiProperty({ description: 'Cantidad (positiva entrada, negativa salida)', example: 10 })
  @Type(() => Number)
  @IsNumber()
  cantidad: number;

  @ApiProperty({ description: 'Tipo de movimiento', enum: ['entrada', 'salida', 'ajuste', 'transferencia', 'devolucion', 'merma'] })
  @IsEnum(['entrada', 'salida', 'ajuste', 'transferencia', 'devolucion', 'merma'])
  tipo: string;

  @ApiPropertyOptional({ description: 'Motivo/observaciones' })
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional({ description: 'ID de documento origen (orden, compra, etc.)' })
  @IsOptional()
  @IsUUID()
  documentoOrigenId?: string;

  @ApiPropertyOptional({ description: 'Tipo de documento origen' })
  @IsOptional()
  @IsString()
  tipoDocumentoOrigen?: string;

  @ApiPropertyOptional({ description: 'Costo unitario' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costoUnitario?: number;

  @ApiPropertyOptional({ description: 'Ubicación origen' })
  @IsOptional()
  @IsString()
  ubicacionOrigen?: string;

  @ApiPropertyOptional({ description: 'Ubicación destino' })
  @IsOptional()
  @IsString()
  ubicacionDestino?: string;

  @ApiPropertyOptional({ description: 'Notas' })
  @IsOptional()
  @IsString()
  notas?: string;
}