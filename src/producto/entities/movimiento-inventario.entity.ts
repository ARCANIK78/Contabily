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
import { Producto } from './producto.entity.js';
import { ProductoVariante } from './producto-variante.entity.js';

export enum TipoMovimiento {
  ENTRADA = 'entrada',
  SALIDA = 'salida',
  AJUSTE = 'ajuste',
  TRANSFERENCIA = 'transferencia',
  DEVOLUCION = 'devolucion',
  MERMA = 'merma',
  INVENTARIO_INICIAL = 'inventario_inicial',
}

export enum OrigenMovimiento {
  MANUAL = 'manual',
  VENTA = 'venta',
  COMPRA = 'compra',
  DEVOLUCION_CLIENTE = 'devolucion_cliente',
  DEVOLUCION_PROVEEDOR = 'devolucion_proveedor',
  TRANSFERENCIA_INTERNA = 'transferencia_interna',
  AJUSTE_INVENTARIO = 'ajuste_inventario',
  SISTEMA = 'sistema',
}

@Entity('movimientos_inventario')
@Index(['empresaId', 'creadoEn'])
@Index(['empresaId', 'productoId'])
@Index(['empresaId', 'varianteId'])
@Index(['empresaId', 'tipo'])
export class MovimientoInventario {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Número de referencia/documento', example: 'MOV-2024-001' })
  @Column({ type: 'varchar', length: 100 })
  numeroReferencia: string;

  @ApiProperty({ description: 'Tipo de movimiento', enum: TipoMovimiento })
  @Column({
    type: 'enum',
    enum: TipoMovimiento,
  })
  tipo: TipoMovimiento;

  @ApiProperty({ description: 'Origen del movimiento', enum: OrigenMovimiento })
  @Column({
    type: 'enum',
    enum: OrigenMovimiento,
    default: OrigenMovimiento.MANUAL,
  })
  origen: OrigenMovimiento;

  @ApiPropertyOptional({ description: 'ID de documento origen (orden, compra, etc.)' })
  @Column({ type: 'uuid', nullable: true })
  documentoOrigenId: string | null;

  @ApiPropertyOptional({ description: 'Tipo de documento origen' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  tipoDocumentoOrigen: string | null;

  // Relaciones
  @ApiProperty({ description: 'ID de la empresa' })
  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @ApiProperty({ description: 'ID del producto' })
  @Column({ type: 'uuid' })
  productoId: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoId' })
  producto: Producto;

  @ApiPropertyOptional({ description: 'ID de la variante (si aplica)' })
  @Column({ type: 'uuid', nullable: true })
  varianteId: string | null;

  @ManyToOne(() => ProductoVariante, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'varianteId' })
  variante: ProductoVariante | null;

  // Cantidades
  @ApiProperty({ description: 'Cantidad del movimiento (positiva para entrada, negativa para salida)' })
  @Column({ type: 'int' })
  cantidad: number;

  @ApiProperty({ description: 'Stock anterior al movimiento' })
  @Column({ type: 'int' })
  stockAnterior: number;

  @ApiProperty({ description: 'Stock posterior al movimiento' })
  @Column({ type: 'int' })
  stockPosterior: number;

  // Costos
  @ApiPropertyOptional({ description: 'Costo unitario al momento del movimiento', example: 15.00 })
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  costoUnitario: number | null;

  @ApiPropertyOptional({ description: 'Costo total del movimiento', example: 150.00 })
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  costoTotal: number | null;

  // Ubicación (para multi-almacén)
  @ApiPropertyOptional({ description: 'Almacén/ubicación origen' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  ubicacionOrigen: string | null;

  @ApiPropertyOptional({ description: 'Almacén/ubicación destino' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  ubicacionDestino: string | null;

  // Auditoría
  @ApiPropertyOptional({ description: 'Usuario que realizó el movimiento' })
  @Column({ type: 'uuid', nullable: true })
  usuarioId: string | null;

  @ApiPropertyOptional({ description: 'Notas/observaciones' })
  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @ApiPropertyOptional({ description: 'Metadatos adicionales (JSON)' })
  @Column({ type: 'jsonb', nullable: true })
  metadatos: Record<string, any> | null;

  @ApiProperty({ description: 'Fecha del movimiento' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}