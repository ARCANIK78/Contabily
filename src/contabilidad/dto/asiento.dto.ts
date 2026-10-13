import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { EstadoAsiento } from '../entities/asiento-contable.entity.js';

// tolerancia de centavos que ya usa AsientosService.crearAsiento
export const TOLERANCIA_CUADRE = 0.005;

export class DetalleAsientoDto {
  @ApiProperty({ description: 'Cuenta contable afectada (debe ser transaccional)', example: 'uuid-v4' })
  @IsUUID(4, { message: 'El ID de la cuenta debe ser un UUID válido' })
  cuentaId: string;

  @ApiProperty({ description: 'Monto del debe', example: 1500.0 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El debe debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El debe no puede ser negativo' })
  debe: number;

  @ApiProperty({ description: 'Monto del haber', example: 1500.0 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El haber debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El haber no puede ser negativo' })
  haber: number;
}

export class CrearAsientoManualDto {
  @ApiPropertyOptional({ description: 'Fecha contable. Hoy si se omite.' })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha?: string;

  @ApiProperty({ description: 'Concepto del asiento', example: 'Ajuste por depreciación de mobiliario' })
  @IsString({ message: 'La glosa debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La glosa no puede exceder 500 caracteres' })
  glosa: string;

  @ApiPropertyOptional({ description: 'Referencia externa (recibo, voucher, factura)' })
  @IsOptional()
  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  @MaxLength(100, { message: 'La referencia no puede exceder 100 caracteres' })
  referencia?: string;

  @ApiProperty({ description: 'Líneas del asiento (partida doble)', type: [DetalleAsientoDto] })
  @IsArray({ message: 'Los detalles deben ser un arreglo' })
  @ArrayMinSize(2, { message: 'Un asiento manual requiere al menos 2 líneas' })
  @ValidateNested({ each: true })
  @Type(() => DetalleAsientoDto)
  detalles: DetalleAsientoDto[];
}

/** Filtro de fechas que comparten el libro diario, el libro mayor y los balances. */
export class FiltroPeriodoDto {
  @ApiPropertyOptional({ description: 'Primer día del período (inclusive)' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaDesde debe ser una fecha válida (YYYY-MM-DD)' })
  fechaDesde?: string;

  @ApiPropertyOptional({ description: 'Último día del período (inclusive)' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaHasta debe ser una fecha válida (YYYY-MM-DD)' })
  fechaHasta?: string;
}

export class FiltroLibroDiarioDto extends FiltroPeriodoDto {
  @ApiPropertyOptional({ description: 'Estado de los asientos a incluir', enum: EstadoAsiento })
  @IsOptional()
  @IsEnum(EstadoAsiento, { message: `estado debe ser ${Object.values(EstadoAsiento).join(' o ')}` })
  estado?: EstadoAsiento;

  @ApiPropertyOptional({ description: 'Texto libre buscado en glosa o referencia' })
  @IsOptional()
  @IsString({ message: 'buscar debe ser una cadena de texto' })
  @MaxLength(100, { message: 'buscar no puede exceder 100 caracteres' })
  buscar?: string;

  @ApiPropertyOptional({ description: 'Página', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero' })
  @Min(1, { message: 'pagina debe ser al menos 1' })
  pagina?: number = 1;

  @ApiPropertyOptional({ description: 'Elementos por página', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite debe ser un número entero' })
  @Min(1, { message: 'limite debe ser al menos 1' })
  @Max(100, { message: 'limite no puede exceder 100' })
  limite?: number = 20;
}

export class FiltroLibroMayorDto extends FiltroPeriodoDto {
  @ApiProperty({ description: 'Cuenta contable cuyo mayor se consulta', example: 'uuid-v4' })
  @IsUUID(4, { message: 'cuentaId debe ser un UUID válido' })
  cuentaId: string;

  @ApiPropertyOptional({
    description: 'Suma también el movimiento de las subcuentas de la cuenta pedida',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'incluirSubcuentas debe ser true o false' })
  incluirSubcuentas?: boolean;

  @ApiPropertyOptional({ description: 'Página', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero' })
  @Min(1, { message: 'pagina debe ser al menos 1' })
  pagina?: number = 1;

  @ApiPropertyOptional({ description: 'Elementos por página', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite debe ser un número entero' })
  @Min(1, { message: 'limite debe ser al menos 1' })
  @Max(100, { message: 'limite no puede exceder 100' })
  limite?: number = 20;
}
