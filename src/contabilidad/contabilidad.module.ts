import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ContabilidadController } from './contabilidad.controller.js';
import { PlanCuentasService } from './services/plan-cuentas.service.js';
import { AsientosService } from './services/asientos.service.js';
import { SaldosService } from './services/saldos.service.js';
import { BalancesService } from './services/balances.service.js';
import { PlanDeCuenta } from './entities/plan-de-cuenta.entity.js';
import { AsientoContable } from './entities/asiento-contable.entity.js';
import { DetalleAsiento } from './entities/detalle-asiento.entity.js';
import { Empresa } from '../empresa/entities/empresa.entity.js';
import { EmpresaContextModule } from '../empresa/empresa-context.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanDeCuenta, AsientoContable, DetalleAsiento]),
    EmpresaContextModule,
  ],
  controllers: [ContabilidadController],
  providers: [PlanCuentasService, AsientosService, SaldosService, BalancesService],
  exports: [PlanCuentasService, AsientosService, SaldosService, BalancesService],
})
export class ContabilidadModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContabilidadModule.name);

  constructor(
    private readonly planCuentasService: PlanCuentasService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Red de seguridad: si un negocio quedó sin plan de cuentas (por ejemplo,
   * los negocios creados antes de existir la semilla), se le siembra al arrancar.
   * Idempotente — a los que ya tienen plan no se les toca nada.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const empresas = await this.dataSource.getRepository(Empresa).find({
        where: { activo: true },
        select: { id: true, nombre: true },
      });

      let sembradas = 0;
      for (const empresa of empresas) {
        const creadas = await this.planCuentasService.sembrarPlanBase(empresa.id);
        if (creadas.length > 0) {
          sembradas += 1;
          this.logger.log(
            `Plan de cuentas sembrado para "${empresa.nombre}" (${creadas.length} cuentas)`,
          );
        }
      }

      if (sembradas === 0) {
        this.logger.log('Todos los negocios ya tienen plan de cuentas');
      }
    } catch (error) {
      this.logger.error(`No se pudo verificar/sembrar planes de cuentas: ${(error as Error).message}`);
    }
  }
}
