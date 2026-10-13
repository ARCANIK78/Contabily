import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Empresa } from '../../empresa/entities/empresa.entity.js';
import { Usuario } from '../../auth/entities/user.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { TipoCambio } from '../../tipo-cambio/entities/tipo-cambio.entity.js';
import { AsientoContable } from '../../contabilidad/entities/asiento-contable.entity.js';
import type { CategoriaGasto } from './categoria-gasto.entity.js';

export enum EstadoGasto {
  PAGADO = 'PAGADO',
  ANULADO = 'ANULADO',
}

@Entity('gastos')
@Index(['empresaId', 'fecha'])
@Index(['empresaId', 'categoriaId'])
@Index(['empresaId', 'estado'])
export class Gasto {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Negocio/empresa dueño del gasto (aislamiento multi-tenant)' })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Categoría del gasto (define la cuenta contable)' })
  @Column({ type: 'uuid', name: 'categoria_id' })
  categoriaId: string;

  @ManyToOne('CategoriaGasto', 'gastos', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  categoria: CategoriaGasto;

  @ApiProperty({ description: 'Caja/banco desde el que se pagó' })
  @Column({ type: 'uuid', name: 'cuenta_financiera_id' })
  cuentaFinancieraId: string;

  @ManyToOne(() => CuentaFinanciera, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_financiera_id' })
  cuentaFinanciera: CuentaFinanciera;

  @ApiProperty({ description: 'Fecha del gasto' })
  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha: Date;

  @ApiProperty({ description: 'Descripción del gasto', example: 'Pago de luz de octubre' })
  @Column({ type: 'text' })
  descripcion: string;

  @ApiPropertyOptional({ description: 'Número de comprobante/recibo', example: 'REC-8891' })
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'numero_comprobante' })
  numeroComprobante: string | null;

  @ApiProperty({ description: 'Moneda del gasto (BOB o USD)', example: 'BOB', default: 'BOB' })
  @Column({ type: 'varchar', length: 3, default: 'BOB' })
  moneda: string;

  @ApiProperty({ description: 'Monto del gasto sin IVA (en la moneda del gasto)', example: 800.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  monto: string;

  @ApiProperty({ description: 'IVA del gasto (0 si no aplica)', example: 0 })
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  iva: string;

  @ApiProperty({ description: 'Tasa usada para convertir a moneda base (BOB)', example: 11.85 })
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1, name: 'tasa_aplicada' })
  tasaAplicada: string;

  @ApiPropertyOptional({ description: 'Registro de tipos_cambio usado (null si se pagó en BOB)' })
  @Column({ type: 'uuid', nullable: true, name: 'tipo_cambio_id' })
  tipoCambioId: string | null;

  @ManyToOne(() => TipoCambio, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tipo_cambio_id' })
  tipoCambio: TipoCambio | null;

  @ApiProperty({ description: 'Total (monto + IVA) convertido a moneda base (BOB)', example: 9480.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'monto_en_moneda_base' })
  montoEnMonedaBase: string;

  @ApiProperty({ description: 'Estado del gasto', enum: EstadoGasto })
  @Column({ type: 'enum', enum: EstadoGasto, default: EstadoGasto.PAGADO })
  estado: EstadoGasto;

  @ApiPropertyOptional({ description: 'Asiento contable generado por el gasto' })
  @Column({ type: 'uuid', nullable: true, name: 'asiento_id' })
  asientoId: string | null;

  @ManyToOne(() => AsientoContable, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asiento_id' })
  asiento: AsientoContable | null;

  @ApiPropertyOptional({ description: 'Usuario que registró el gasto' })
  @Column({ type: 'uuid', nullable: true, name: 'usuario_id' })
  usuarioId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}
