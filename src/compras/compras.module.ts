import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ProveedoresController } from './proveedores.controller.js';
import { ComprasController } from './compras.controller.js';
import { GastosController } from './gastos.controller.js';
import { CategoriasGastoController } from './categorias-gasto.controller.js';
import { ProveedoresService } from './services/proveedores.service.js';
import { ComprasService } from './services/compras.service.js';
import { GastosService } from './services/gastos.service.js';
import {
  Proveedor,
  Compra,
  CompraDetalle,
  CompraPago,
  CategoriaGasto,
  Gasto,
} from './entities/index.js';
import { Empresa } from '../empresa/entities/empresa.entity.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { CajasModule } from '../cajas/cajas.module.js';
import { TipoCambioModule } from '../tipo-cambio/tipo-cambio.module.js';
import { ProductoModule } from '../producto/producto.module.js';
import { EmpresaContextModule } from '../empresa/empresa-context.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Proveedor,
      Compra,
      CompraDetalle,
      CompraPago,
      CategoriaGasto,
      Gasto,
    ]),
    ContabilidadModule,
    CajasModule,
    TipoCambioModule,
    ProductoModule,
    EmpresaContextModule,
  ],
  controllers: [
    ProveedoresController,
    ComprasController,
    GastosController,
    CategoriasGastoController,
  ],
  providers: [ProveedoresService, ComprasService, GastosService],
  exports: [ProveedoresService, GastosService],
})
export class ComprasModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ComprasModule.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly gastosService: GastosService,
  ) {}

  /**
   * Red de seguridad: los negocios creados antes de existir este módulo
   * reciben sus categorías de gasto al arrancar. Idempotente.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const empresas = await this.dataSource.getRepository(Empresa).find({
        where: { activo: true },
        select: { id: true, nombre: true },
      });

      let sembradas = 0;
      for (const empresa of empresas) {
        const creadas = await this.gastosService.sembrarCategoriasBase(empresa.id);
        if (creadas.length > 0) {
          sembradas += 1;
          this.logger.log(
            `Negocio "${empresa.nombre}": ${creadas.length} categorías de gasto sembradas`,
          );
        }
      }

      if (sembradas === 0) {
        this.logger.log('Todos los negocios ya tienen sus categorías de gasto');
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron sembrar las categorías de gasto: ${(error as Error).message}`,
      );
    }
  }
}
