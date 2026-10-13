import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CondicionesPago } from '../entities/proveedor.entity.js';

export class CrearProveedorDto {
  @ApiProperty({ description: 'Nombre comercial del proveedor', example: 'Distribuidora Andina' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  nombre: string;

  @ApiProperty({ description: 'RIF / NIT del proveedor', example: '1023456028' })
  @IsString({ message: 'El rif debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El rif no puede exceder 50 caracteres' })
  rif: string;

  @ApiPropertyOptional({ description: 'Persona de contacto', example: 'María López' })
  @IsOptional()
  @IsString({ message: 'El contacto debe ser una cadena de texto' })
  @MaxLength(255, { message: 'El contacto no puede exceder 255 caracteres' })
  contacto?: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto', example: '+591 4 4250000' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El teléfono no puede exceder 50 caracteres' })
  telefono?: string;

  @ApiPropertyOptional({ description: 'Email de contacto', example: 'ventas@andina.bo' })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe ser válido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  email?: string;

  @ApiPropertyOptional({ description: 'Dirección del proveedor' })
  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  direccion?: string;

  @ApiPropertyOptional({
    description: 'Condiciones de pago habituales (informativo)',
    enum: CondicionesPago,
    default: CondicionesPago.CONTADO,
  })
  @IsOptional()
  @IsEnum(CondicionesPago, { message: 'Las condiciones deben ser CONTADO, CREDITO_30, CREDITO_60 o CREDITO_90' })
  condicionesPago?: CondicionesPago;

  @ApiPropertyOptional({ description: 'Notas libres' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notas?: string;

  @ApiPropertyOptional({ description: 'Si el proveedor está activo', default: true })
  @IsOptional()
  @IsBoolean({ message: 'activo debe ser un booleano' })
  activo?: boolean;
}

export class ActualizarProveedorDto extends PartialType(CrearProveedorDto) {}
