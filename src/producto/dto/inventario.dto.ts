import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, IsArray, ValidateNested, IsUUID, Min, Max, MinLength, MaxLength, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TipoMovimiento, OrigenMovimiento } from '../entities/movimiento-inventario.entity.js';

export class CrearMovimientoInventarioDto {
  @ApiProperty({ description: 'Número de referencia', example: 'MOV-2024-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  numeroReferencia: string;

  @ApiProperty({ description: 'Tipo de movimiento', enum: TipoMovimiento })
  @IsEnum(TipoMovimiento)
  tipo: TipoMovimiento;

  @IsOptional()
  @IsEnum(OrigenMovimiento)
  origen?: OrigenMovimiento;

  @IsOptional()
  @IsUUID()
  documentoOrigenId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipoDocumentoOrigen?: string;

  @ApiProperty({ description: 'ID del producto' })
  @IsUUID()
  productoId: string;

  @IsOptional()
  @IsUUID()
  varianteId?: string;

  @ApiProperty({ description: 'Cantidad (positiva entrada, negativa salida)', example: 10 })
  @Type(() => Number)
  @IsNumber()
  cantidad: number;

  @ApiProperty({ description: 'Stock anterior al movimiento' })
  @Type(() => Number)
  @IsNumber()
  stockAnterior: number;

  @ApiProperty({ description: 'Stock posterior al movimiento' })
  @Type(() => Number)
  @IsNumber()
  stockPosterior: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costoUnitario?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costoTotal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ubicacionOrigen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ubicacionDestino?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  metadatos?: Record<string, any>;
}

export class FiltroMovimientoInventarioDto {
  @IsOptional()
  @IsUUID()
  productoId?: string;

  @IsOptional()
  @IsUUID()
  varianteId?: string;

  @IsOptional()
  @IsEnum(TipoMovimiento)
  tipo?: TipoMovimiento;

  @IsOptional()
  @IsEnum(OrigenMovimiento)
  origen?: OrigenMovimiento;

  @IsOptional()
  @IsUUID()
  documentoOrigenId?: string;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limite?: number = 20;

  @IsOptional()
  @IsString()
  ordenarPor?: string = 'creadoEn';

  @IsOptional()
  @IsString()
  orden?: 'ASC' | 'DESC' = 'DESC';
}

export class ResumenInventarioDto {
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  soloStockBajo?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  soloSinStock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limite?: number = 20;
}

export class MovimientoMasivoDto {
  @ApiProperty({ description: 'Lista de movimientos', type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrearMovimientoInventarioDto)
  movimientos: CrearMovimientoInventarioDto[];
}