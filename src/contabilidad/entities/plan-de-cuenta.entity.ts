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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { CuentaFinanciera as CuentaFinancieraClass } from '../../cajas/entities/cuenta-financiera.entity.js';
import type { DetalleAsiento } from './detalle-asiento.entity.js';
import { DetalleAsiento as DetalleAsientoClass } from './detalle-asiento.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';

@Entity('plan_de_cuentas')
// El código solo es único dentro de un mismo negocio: cada empresa tiene su plan.
@Index(['empresaId', 'codigo'], { unique: true })
@Index(['empresaId'])
export class PlanDeCuenta {
  @ApiProperty({ description: 'Identificador único de la cuenta contable', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Negocio/empresa a la que pertenece esta cuenta (aislamiento multi-tenant)',
    example: 'uuid-v4',
  })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Nomenclatura contable única', example: '1.1.1.01' })
  @Column({ type: 'varchar', length: 20, name: 'codigo' })
  codigo: string;

  @ApiProperty({ description: 'Título de la cuenta', example: 'Caja General' })
  @Column({ type: 'varchar', length: 255, name: 'nombre' })
  nombre: string;

  @ApiPropertyOptional({ description: 'Cuenta padre (autorreferencia para subcuentas)' })
  @Column({ type: 'uuid', nullable: true, name: 'cuenta_padre_id' })
  cuentaPadreId: string | null;

  @ManyToOne(() => PlanDeCuenta, (cuenta) => cuenta.subCuentas, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cuenta_padre_id' })
  cuentaPadre: PlanDeCuenta | null;

  @OneToMany(() => PlanDeCuenta, (cuenta) => cuenta.cuentaPadre)
  subCuentas: PlanDeCuenta[];

  @ApiProperty({
    description: 'true = acepta movimientos directos; false = categoría agrupadora',
    default: false,
  })
  @Column({ type: 'boolean', default: false, name: 'es_transaccional' })
  esTransaccional: boolean;

  @OneToMany(() => CuentaFinancieraClass, (cuentaFinanciera) => cuentaFinanciera.cuentaContable)
  cuentasFinancieras: CuentaFinanciera[];

  @OneToMany(() => DetalleAsientoClass, (detalle) => detalle.cuenta)
  detallesAsiento: DetalleAsiento[];

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}
