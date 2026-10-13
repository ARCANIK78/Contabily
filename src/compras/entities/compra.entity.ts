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
import type { Proveedor } from './proveedor.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { TipoCambio } from '../../tipo-cambio/entities/tipo-cambio.entity.js';
import { AsientoContable } from '../../contabilidad/entities/asiento-contable.entity.js';
import type { CompraDetalle } from './compra-detalle.entity.js';
import { CompraDetalle as CompraDetalleClass } from './compra-detalle.entity.js';
import type { CompraPago } from './compra-pago.entity.js';
import { CompraPago as CompraPagoClass } from './compra-pago.entity.js';

export enum TipoPagoCompra {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}

export enum EstadoCompra {
  RECIBIDA = 'RECIBIDA',
  PAGADA = 'PAGADA',
  ANULADA = 'ANULADA',
}

@Entity('compras')
// Mismo número de factura no se repite dentro del mismo proveedor.
@Unique(['empresaId', 'proveedorId', 'numeroFactura'])
@Index(['empresaId', 'fecha'])
@Index(['empresaId', 'estado'])
export class Compra {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Negocio/empresa dueño de la compra (aislamiento multi-tenant)' })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Proveedor al que se le compró' })
  @Column({ type: 'uuid', name: 'proveedor_id' })
  proveedorId: string;

  @ManyToOne('Proveedor', 'compras', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Proveedor;

  @ApiProperty({ description: 'Número de factura del proveedor', example: 'FA-001234' })
  @Column({ type: 'varchar', length: 50, name: 'numero_factura' })
  numeroFactura: string;

  @ApiProperty({ description: 'Fecha de la factura (YYYY-MM-DD)', example: '2026-10-11' })
  @Column({ type: 'date' })
  fecha: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento del crédito (YYYY-MM-DD)' })
  @Column({ type: 'date', nullable: true, name: 'fecha_vencimiento' })
  fechaVencimiento: string | null;

  @ApiProperty({ description: 'Cómo se paga la compra', enum: TipoPagoCompra, default: TipoPagoCompra.CONTADO })
  @Column({ type: 'enum', enum: TipoPagoCompra, default: TipoPagoCompra.CONTADO, name: 'tipo_pago' })
  tipoPago: TipoPagoCompra;

  @ApiProperty({ description: 'Estado de la compra', enum: EstadoCompra })
  @Column({ type: 'enum', enum: EstadoCompra, default: EstadoCompra.RECIBIDA })
  estado: EstadoCompra;

  @ApiProperty({ description: 'Moneda de la factura (BOB o USD)', example: 'BOB', default: 'BOB' })
  @Column({ type: 'varchar', length: 3, default: 'BOB' })
  moneda: string;

  @ApiProperty({
    description: 'Tasa usada para convertir a moneda base (BOB) al momento de la compra',
    example: 11.85,
  })
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1, name: 'tasa_aplicada' })
  tasaAplicada: string;

  @ApiPropertyOptional({ description: 'Registro de tipos_cambio usado (null si la factura es en BOB)' })
  @Column({ type: 'uuid', nullable: true, name: 'tipo_cambio_id' })
  tipoCambioId: string | null;

  @ManyToOne(() => TipoCambio, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tipo_cambio_id' })
  tipoCambio: TipoCambio | null;

  @ApiProperty({ description: 'Suma de las líneas (sin IVA), en la moneda de la factura', example: 1500.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal: string;

  @ApiProperty({ description: 'IVA de la factura (0 si no aplica), en la moneda de la factura', example: 195.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  iva: string;

  @ApiProperty({ description: 'Total de la factura (subtotal + IVA)', example: 1695.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  total: string;

  @ApiProperty({
    description: 'Total convertido a moneda base (BOB) — el que usan los asientos',
    example: 20085.75,
  })
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'monto_en_moneda_base' })
  montoEnMonedaBase: string;

  @ApiProperty({
    description: 'Saldo aún no pagado al proveedor (en la moneda de la factura); 0 cuando está pagada',
    example: 1695.0,
  })
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'saldo_pendiente' })
  saldoPendiente: string;

  @ApiPropertyOptional({ description: 'Caja/banco con la que se pagó (solo compras de contado)' })
  @Column({ type: 'uuid', nullable: true, name: 'cuenta_financiera_id' })
  cuentaFinancieraId: string | null;

  @ManyToOne(() => CuentaFinanciera, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cuenta_financiera_id' })
  cuentaFinanciera: CuentaFinanciera | null;

  @ApiPropertyOptional({ description: 'Asiento contable generado por la compra' })
  @Column({ type: 'uuid', nullable: true, name: 'asiento_id' })
  asientoId: string | null;

  @ManyToOne(() => AsientoContable, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asiento_id' })
  asiento: AsientoContable | null;

  @ApiPropertyOptional({ description: 'Notas libres' })
  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @OneToMany(() => CompraDetalleClass, (detalle) => detalle.compra, { cascade: true })
  detalles: CompraDetalle[];

  @OneToMany(() => CompraPagoClass, (pago) => pago.compra, { cascade: true })
  pagos: CompraPago[];

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}
