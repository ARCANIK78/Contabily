import {
  ArrayMinSize,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TipoPagoCompra } from '../entities/compra.entity.js';

export class LineaCompraDto {
  @ApiPropertyOptional({
    description: 'Producto comprado (opcional en líneas que no afectan inventario, ej: flete)',
  })
  @IsOptional()
  @IsUUID(4, { message: 'productoId debe ser un UUID válido' })
  productoId?: string;

  @ApiPropertyOptional({
    description: 'Variante del producto (obligatorio si el producto usa variantes)',
  })
  @IsOptional()
  @IsUUID(4, { message: 'varianteId debe ser un UUID válido' })
  varianteId?: string;

  @ApiProperty({ description: 'Descripción de la línea', example: 'Zapatillas running talla 42' })
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La descripción no puede exceder 255 caracteres' })
  descripcion: string;

  @ApiProperty({ description: 'Cantidad comprada', example: 10 })
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad: number;

  @ApiProperty({ description: 'Costo unitario en la moneda de la factura', example: 150.0 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El costo unitario debe ser un número con máximo 2 decimales' })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  costoUnitario: number;
}

export class CrearCompraDto {
  @ApiProperty({ description: 'Proveedor al que se le compra' })
  @IsUUID(4, { message: 'proveedorId debe ser un UUID válido' })
  proveedorId: string;

  @ApiProperty({ description: 'Número de factura del proveedor', example: 'FA-001234' })
  @IsString({ message: 'El número de factura debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El número de factura no puede exceder 50 caracteres' })
  numeroFactura: string;

  @ApiPropertyOptional({ description: 'Fecha de la factura (YYYY-MM-DD); por defecto hoy', example: '2026-10-11' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  fecha?: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento del crédito (YYYY-MM-DD)', example: '2026-11-11' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de vencimiento debe tener formato YYYY-MM-DD' })
  fechaVencimiento?: string;

  @ApiPropertyOptional({
    description: 'CONTADO descuenta la caja al crear; CREDITO genera cuenta por pagar',
    enum: TipoPagoCompra,
    default: TipoPagoCompra.CONTADO,
  })
  @IsOptional()
  @IsEnum(TipoPagoCompra, { message: 'El tipo de pago debe ser CONTADO o CREDITO' })
  tipoPago?: TipoPagoCompra;

  @ApiPropertyOptional({
    description: 'Caja/banco con el que se paga — obligatorio si tipoPago es CONTADO',
  })
  @IsOptional()
  @IsUUID(4, { message: 'cuentaFinancieraId debe ser un UUID válido' })
  cuentaFinancieraId?: string;

  @ApiPropertyOptional({
    description: 'Moneda de la factura (BOB o USD; se normaliza a mayúsculas)',
    example: 'BOB',
    default: 'BOB',
    enum: ['BOB', 'USD'],
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['BOB', 'USD'], { message: 'La moneda debe ser BOB o USD' })
  moneda?: string;

  @ApiPropertyOptional({ description: 'IVA de la factura en la moneda de la factura (0 si no aplica)', example: 195.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El IVA debe ser un número con máximo 2 decimales' })
  @Min(0, { message: 'El IVA no puede ser negativo' })
  iva?: number;

  @ApiPropertyOptional({ description: 'Notas libres' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notas?: string;

  @ApiProperty({ description: 'Líneas de la factura', type: [LineaCompraDto] })
  @ArrayMinSize(1, { message: 'La compra debe tener al menos una línea' })
  @ValidateNested({ each: true, message: 'Cada línea debe ser válida' })
  @Type(() => LineaCompraDto)
  detalles: LineaCompraDto[];
}

export class PagoCompraDto {
  @ApiProperty({ description: 'Caja/banco desde el que se paga' })
  @IsUUID(4, { message: 'cuentaFinancieraId debe ser un UUID válido' })
  cuentaFinancieraId: string;

  @ApiProperty({
    description: 'Monto del pago EN LA MONEDA DE LA FACTURA (no en la moneda de la caja)',
    example: 500.0,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser un número con máximo 2 decimales' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @ApiPropertyOptional({ description: 'Número de transferencia/recibo', example: 'TRF-001' })
  @IsOptional()
  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  @MaxLength(100, { message: 'La referencia no puede exceder 100 caracteres' })
  referencia?: string;

  @ApiPropertyOptional({ description: 'Notas libres' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notas?: string;
}
