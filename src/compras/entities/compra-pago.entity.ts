import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Compra } from './compra.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { TipoCambio } from '../../tipo-cambio/entities/tipo-cambio.entity.js';
import { AsientoContable } from '../../contabilidad/entities/asiento-contable.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';

@Entity('compras_pagos')
@Index(['compraId'])
@Index(['empresaId', 'fecha'])
export class CompraPago {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Negocio/empresa dueño del pago (aislamiento multi-tenant)' })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Compra a la que se aplica el pago' })
  @Column({ type: 'uuid', name: 'compra_id' })
  compraId: string;

  @ManyToOne('Compra', 'pagos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compra_id' })
  compra: Compra;

  @ApiProperty({ description: 'Caja/banco desde el que se pagó' })
  @Column({ type: 'uuid', name: 'cuenta_financiera_id' })
  cuentaFinancieraId: string;

  @ManyToOne(() => CuentaFinanciera, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_financiera_id' })
  cuentaFinanciera: CuentaFinanciera;

  @ApiProperty({ description: 'Monto del pago (en la moneda de la factura)', example: 500.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  monto: string;

  @ApiProperty({ description: 'Monto convertido a moneda base (BOB)', example: 5925.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'monto_en_moneda_base' })
  montoEnMonedaBase: string;

  @ApiProperty({ description: 'Tasa usada para convertir a moneda base', example: 11.85 })
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1, name: 'tasa_aplicada' })
  tasaAplicada: string;

  @ApiPropertyOptional({ description: 'Registro de tipos_cambio usado (null si se pagó en BOB)' })
  @Column({ type: 'uuid', nullable: true, name: 'tipo_cambio_id' })
  tipoCambioId: string | null;

  @ManyToOne(() => TipoCambio, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tipo_cambio_id' })
  tipoCambio: TipoCambio | null;

  @ApiPropertyOptional({ description: 'Asiento contable generado por el pago' })
  @Column({ type: 'uuid', nullable: true, name: 'asiento_id' })
  asientoId: string | null;

  @ManyToOne(() => AsientoContable, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asiento_id' })
  asiento: AsientoContable | null;

  @ApiPropertyOptional({ description: 'Número de transferencia/recibo', example: 'TRF-001' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  referencia: string | null;

  @ApiPropertyOptional({ description: 'Notas libres' })
  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @ApiProperty({ description: 'Fecha del pago' })
  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;
}
