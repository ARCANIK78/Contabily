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
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import type { PlanDeCuenta } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import { PlanDeCuenta as PlanDeCuentaClass } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import type { Transaccion } from './transaccion.entity.js';
import { Transaccion as TransaccionClass } from './transaccion.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';

export enum TipoCuentaFinanciera {
  EFECTIVO = 'EFECTIVO',
  BANCO = 'BANCO',
}

@Entity('cuentas_financieras')
@Index(['empresaId'])
export class CuentaFinanciera {
  @ApiProperty({ description: 'Identificador único de la caja/banco', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Negocio/empresa dueño de esta caja o banco (aislamiento multi-tenant)',
    example: 'uuid-v4',
  })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Nombre de la cuenta financiera', example: 'Caja Chica' })
  @Column({ type: 'varchar', length: 255, name: 'nombre' })
  nombre: string;

  @ApiProperty({ description: 'Tipo de cuenta', enum: TipoCuentaFinanciera })
  @Column({ type: 'enum', enum: TipoCuentaFinanciera, name: 'tipo' })
  tipo: TipoCuentaFinanciera;

  @ApiProperty({ description: 'Moneda (código ISO 4217)', example: 'BOB', default: 'BOB' })
  @Column({ type: 'varchar', length: 3, default: 'BOB', name: 'moneda' })
  moneda: string;

  @ApiProperty({ description: 'Si la cuenta está activa', default: true })
  @Column({ type: 'boolean', default: true, name: 'activo' })
  activo: boolean;

  @ApiProperty({ description: 'Balance actual de la cuenta', example: 1500.0 })
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'saldo' })
  saldo: string;

  @ApiProperty({ description: 'Cuenta contable oficial vinculada (FK al plan de cuentas)' })
  @Column({ type: 'uuid', name: 'cuenta_contable_id' })
  cuentaContableId: string;

  @ManyToOne(() => PlanDeCuentaClass, (cuenta) => cuenta.cuentasFinancieras, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_contable_id' })
  cuentaContable: PlanDeCuenta;

  @OneToMany(() => TransaccionClass, (transaccion) => transaccion.cuentaFinanciera)
  transacciones: Transaccion[];

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}
