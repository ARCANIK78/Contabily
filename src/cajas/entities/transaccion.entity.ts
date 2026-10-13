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

import type { CuentaFinanciera } from './cuenta-financiera.entity.js';
import { CuentaFinanciera as CuentaFinancieraClass } from './cuenta-financiera.entity.js';
import { TipoCambio } from '../../tipo-cambio/entities/tipo-cambio.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';

export enum TipoTransaccion {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
  TRANSFERENCIA = 'TRANSFERENCIA',
}

@Entity('transacciones')
@Index(['cuentaFinancieraId', 'fechaCreacion'])
@Index(['empresaId', 'fechaCreacion'])
@Index(['empresaId'])
export class Transaccion {
  @ApiProperty({ description: 'Identificador único de la transacción', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Negocio/empresa dueño del movimiento (aislamiento multi-tenant)',
    example: 'uuid-v4',
  })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Caja o banco que ejecutó el movimiento' })
  @Column({ type: 'uuid', name: 'cuenta_financiera_id' })
  cuentaFinancieraId: string;

  @ManyToOne(() => CuentaFinancieraClass, (cuenta) => cuenta.transacciones, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_financiera_id' })
  cuentaFinanciera: CuentaFinanciera;

  @ApiProperty({ description: 'Tipo de movimiento', enum: TipoTransaccion })
  @Column({ type: 'enum', enum: TipoTransaccion, name: 'tipo' })
  tipo: TipoTransaccion;

  @ApiProperty({ description: 'Monto del movimiento', example: 1500.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'monto' })
  monto: string;

  @ApiProperty({
    description: 'Monto convertido a la moneda base (BOB) usado en el asiento contable',
    example: 17775.0,
  })
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'monto_en_moneda_base' })
  montoEnMonedaBase: string;

  @ApiProperty({
    description: 'Tasa usada para convertir a moneda base (1.0000 en cuentas BOB)',
    example: 11.85,
  })
  @Column({ type: 'decimal', precision: 10, scale: 4, name: 'tasa_aplicada' })
  tasaAplicada: string;

  @ApiPropertyOptional({
    description: 'Registro de tipos_cambio aplicado (null en movimientos en BOB)',
  })
  @Column({ type: 'uuid', nullable: true, name: 'tipo_cambio_id' })
  tipoCambioId: string | null;

  @ManyToOne(() => TipoCambio, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tipo_cambio_id' })
  tipoCambio: TipoCambio | null;

  @ApiPropertyOptional({ description: 'Descripción del movimiento', example: 'Venta de contado' })
  @Column({ type: 'text', nullable: true, name: 'descripcion' })
  descripcion: string | null;

  @ApiPropertyOptional({ description: 'Número de recibo/voucher', example: 'REC-001' })
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'referencia' })
  referencia: string | null;

  @ApiPropertyOptional({ description: 'Cuenta destino (solo para TRANSFERENCIA)' })
  @Column({ type: 'uuid', nullable: true, name: 'cuenta_destino_id' })
  cuentaDestinoId: string | null;

  @ManyToOne(() => CuentaFinancieraClass, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cuenta_destino_id' })
  cuentaDestino: CuentaFinanciera | null;

  @ApiProperty({ description: 'Fecha automática del movimiento' })
  @CreateDateColumn({ type: 'timestamptz', name: 'fecha_creacion' })
  fechaCreacion: Date;
}
