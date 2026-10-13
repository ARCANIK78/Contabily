import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Compra } from './compra.entity.js';
import { Producto } from '../../producto/entities/producto.entity.js';
import { ProductoVariante } from '../../producto/entities/producto-variante.entity.js';

@Entity('compras_detalles')
@Index(['compraId'])
@Index(['productoId'])
export class CompraDetalle {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Cabecera de la compra a la que pertenece' })
  @Column({ type: 'uuid', name: 'compra_id' })
  compraId: string;

  @ManyToOne('Compra', 'detalles', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compra_id' })
  compra: Compra;

  @ApiPropertyOptional({
    description: 'Producto comprado (null en líneas que no afectan inventario, ej: flete)',
  })
  @Column({ type: 'uuid', nullable: true, name: 'producto_id' })
  productoId: string | null;

  @ManyToOne(() => Producto, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto | null;

  @ApiPropertyOptional({ description: 'Variante comprada si el producto usa variantes' })
  @Column({ type: 'uuid', nullable: true, name: 'variante_id' })
  varianteId: string | null;

  @ManyToOne(() => ProductoVariante, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variante_id' })
  variante: ProductoVariante | null;

  @ApiProperty({ description: 'Descripción de la línea', example: 'Zapatillas running talla 42' })
  @Column({ type: 'varchar', length: 255 })
  descripcion: string;

  @ApiProperty({ description: 'Cantidad comprada', example: 10 })
  @Column({ type: 'int' })
  cantidad: number;

  @ApiProperty({ description: 'Costo unitario (en la moneda de la factura)', example: 150.0 })
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'costo_unitario' })
  costoUnitario: string;

  @ApiProperty({ description: 'Subtotal de la línea (cantidad × costo unitario)', example: 1500.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal: string;
}
