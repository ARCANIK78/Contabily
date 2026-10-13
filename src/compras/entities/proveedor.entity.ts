import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Empresa } from '../../empresa/entities/empresa.entity.js';
import type { Compra } from './compra.entity.js';
import { Compra as CompraClass } from './compra.entity.js';

export enum CondicionesPago {
  CONTADO = 'CONTADO',
  CREDITO_30 = 'CREDITO_30',
  CREDITO_60 = 'CREDITO_60',
  CREDITO_90 = 'CREDITO_90',
}

@Entity('proveedores')
@Unique(['empresaId', 'rif'])
@Index(['empresaId'])
export class Proveedor {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Negocio/empresa dueño del proveedor (aislamiento multi-tenant)' })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Nombre comercial del proveedor', example: 'Distribuidora Andina' })
  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @ApiProperty({ description: 'RIF / NIT del proveedor', example: '1023456028' })
  @Column({ type: 'varchar', length: 50 })
  rif: string;

  @ApiPropertyOptional({ description: 'Persona de contacto', example: 'María López' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  contacto: string | null;

  @ApiPropertyOptional({ description: 'Teléfono de contacto', example: '+591 4 4250000' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono: string | null;

  @ApiPropertyOptional({ description: 'Email de contacto' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @ApiPropertyOptional({ description: 'Dirección del proveedor' })
  @Column({ type: 'text', nullable: true })
  direccion: string | null;

  @ApiProperty({
    description: 'Condiciones de pago habituales (solo informativo; la compra define la suya)',
    enum: CondicionesPago,
    default: CondicionesPago.CONTADO,
  })
  @Column({
    type: 'enum',
    enum: CondicionesPago,
    default: CondicionesPago.CONTADO,
    name: 'condiciones_pago',
  })
  condicionesPago: CondicionesPago;

  @ApiProperty({ description: 'Si el proveedor sigue activo', default: true })
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ApiPropertyOptional({ description: 'Notas libres' })
  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @OneToMany(() => CompraClass, (compra) => compra.proveedor)
  compras: Compra[];

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}
