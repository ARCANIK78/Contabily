import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CajasController } from './cajas.controller.js';
import { CuentasFinancierasService } from './services/cuentas-financieras.service.js';
import { MovimientosFinancierosService } from './services/movimientos-financieros.service.js';
import { TransaccionesService } from './services/transacciones.service.js';
import { CuentaFinanciera } from './entities/cuenta-financiera.entity.js';
import { Transaccion } from './entities/transaccion.entity.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { TipoCambioModule } from '../tipo-cambio/tipo-cambio.module.js';
import { EmpresaContextModule } from '../empresa/empresa-context.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CuentaFinanciera, Transaccion]),
    ContabilidadModule,
    TipoCambioModule,
    EmpresaContextModule,
  ],
  controllers: [CajasController],
  providers: [CuentasFinancierasService, MovimientosFinancierosService, TransaccionesService],
  exports: [CuentasFinancierasService, MovimientosFinancierosService, TransaccionesService, TypeOrmModule],
})
export class CajasModule {}
