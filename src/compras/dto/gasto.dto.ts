import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrearGastoDto {
  @ApiProperty({ description: 'Categoría del gasto (define la cuenta contable del asiento)' })
  @IsUUID(4, { message: 'categoriaId debe ser un UUID válido' })
  categoriaId: string;

  @ApiProperty({ description: 'Caja/banco desde el que se paga el gasto' })
  @IsUUID(4, { message: 'cuentaFinancieraId debe ser un UUID válido' })
  cuentaFinancieraId: string;

  @ApiProperty({ description: 'Descripción del gasto', example: 'Pago de luz de octubre' })
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(1000, { message: 'La descripción no puede exceder 1000 caracteres' })
  descripcion: string;

  @ApiProperty({ description: 'Monto sin IVA en la moneda del gasto', example: 800.0 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser un número con máximo 2 decimales' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @ApiPropertyOptional({ description: 'IVA del gasto (0 si no aplica)', example: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El IVA debe ser un número con máximo 2 decimales' })
  @Min(0, { message: 'El IVA no puede ser negativo' })
  iva?: number;

  @ApiPropertyOptional({
    description: 'Moneda del gasto (BOB o USD; se normaliza a mayúsculas)',
    example: 'BOB',
    default: 'BOB',
    enum: ['BOB', 'USD'],
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['BOB', 'USD'], { message: 'La moneda debe ser BOB o USD' })
  moneda?: string;

  @ApiPropertyOptional({ description: 'Número de comprobante/recibo', example: 'REC-8891' })
  @IsOptional()
  @IsString({ message: 'El número de comprobante debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El número de comprobante no puede exceder 100 caracteres' })
  numeroComprobante?: string;

  @ApiPropertyOptional({ description: 'Fecha del gasto (ISO 8601); por defecto ahora' })
  @IsOptional()
  @IsString({ message: 'La fecha debe ser una cadena de texto ISO 8601' })
  fecha?: string;
}

export class CrearCategoriaGastoDto {
  @ApiProperty({ description: 'Nombre de la categoría', example: 'Alquileres' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  nombre: string;

  @ApiProperty({
    description:
      'Cuenta contable que recibe el gasto (debe ser transaccional y no ser una caja/banco; obtener de GET /api/v1/contabilidad/plan-cuentas)',
  })
  @IsUUID(4, { message: 'cuentaContableId debe ser un UUID válido' })
  cuentaContableId: string;
}

export class ActualizarCategoriaGastoDto extends PartialType(CrearCategoriaGastoDto) {
  @ApiPropertyOptional({ description: 'Si la categoría se puede usar en nuevos gastos' })
  @IsOptional()
  @IsBoolean({ message: 'activa debe ser un booleano' })
  activa?: boolean;
}
