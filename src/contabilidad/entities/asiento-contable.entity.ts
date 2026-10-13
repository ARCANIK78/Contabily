import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { DetalleAsiento } from './detalle-asiento.entity.js';
import { DetalleAsiento as DetalleAsientoClass } from './detalle-asiento.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';
import { Usuario } from '../../auth/entities/user.entity.js';

/** Un libro diario no se edita ni se borra: se anula. Los anulados no suman saldo. */
export enum EstadoAsiento {
  CONFIRMADO = 'CONFIRMADO',
  ANULADO = 'ANULADO',
}

@Entity('asientos_contables')
@Index(['empresaId', 'fecha'])
@Index(['empresaId'])
@Index(['empresaId', 'estado'])
export class AsientoContable {
  @ApiProperty({ description: 'Identificador único del asiento', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Negocio/empresa a la que pertenece el asiento (aislamiento multi-tenant)',
    example: 'uuid-v4',
  })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({
    description: 'Correlativo del asiento dentro del negocio (global, no se resetea)',
    example: 42,
  })
  @Column({ type: 'integer', nullable: true })
  numero: number | null;

  @ApiProperty({
    description: 'Estado del asiento en el libro diario',
    enum: EstadoAsiento,
    default: EstadoAsiento.CONFIRMADO,
  })
  @Column({
    type: 'enum',
    enum: EstadoAsiento,
    default: EstadoAsiento.CONFIRMADO,
  })
  estado: EstadoAsiento;

  @ApiPropertyOptional({
    description: 'Usuario que registró el asiento (auditoría). Null en asientos legados.',
  })
  @Column({ type: 'uuid', nullable: true, name: 'usuario_id' })
  usuarioId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @ApiProperty({ description: 'Fecha del asiento contable' })
  @Column({ type: 'timestamptz', name: 'fecha' })
  fecha: Date;

  @ApiProperty({ description: 'Concepto o explicación del asiento', example: 'Ingreso por venta de contado' })
  @Column({ type: 'text', name: 'glosa' })
  glosa: string;

  @ApiPropertyOptional({ description: 'Referencia externa (recibo, voucher, factura)' })
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'referencia' })
  referencia: string | null;

  @OneToMany(() => DetalleAsientoClass, (detalle) => detalle.asiento, { cascade: true })
  detalles: DetalleAsiento[];

  @ApiProperty({ description: 'Fecha de creación del registro' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;
}
