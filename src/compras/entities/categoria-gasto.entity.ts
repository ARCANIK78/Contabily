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
import { ApiProperty } from '@nestjs/swagger';

import { Empresa } from '../../empresa/entities/empresa.entity.js';
import { PlanDeCuenta } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import type { Gasto } from './gasto.entity.js';
import { Gasto as GastoClass } from './gasto.entity.js';

@Entity('categorias_gasto')
@Unique(['empresaId', 'nombre'])
@Index(['empresaId'])
export class CategoriaGasto {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Negocio/empresa dueño de la categoría (aislamiento multi-tenant)' })
  @Column({ type: 'uuid', name: 'empresa_id' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @ApiProperty({ description: 'Nombre de la categoría', example: 'Alquileres' })
  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @ApiProperty({
    description:
      'Cuenta contable que recibe el gasto (clase 5); se usa en el asiento automático al pagar',
  })
  @Column({ type: 'uuid', name: 'cuenta_contable_id' })
  cuentaContableId: string;

  @ManyToOne(() => PlanDeCuenta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_contable_id' })
  cuentaContable: PlanDeCuenta;

  @ApiProperty({ description: 'Si la categoría se puede usar en nuevos gastos', default: true })
  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @OneToMany(() => GastoClass, (gasto) => gasto.categoria)
  gastos: Gasto[];

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;
}
