import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresaController } from './empresa.controller.js';
import { EmpresaService } from './empresa.service.js';
import { Empresa } from './entities/empresa.entity.js';
import { Usuario } from '../auth/entities/user.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmpresaContextModule } from './empresa-context.module.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { ComprasModule } from '../compras/compras.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa, Usuario]),
    AuthModule,
    EmpresaContextModule,
    // Para sembrar el plan de cuentas base cuando se crea un negocio nuevo.
    ContabilidadModule,
    // Para sembrar las categorías de gasto base cuando se crea un negocio nuevo.
    ComprasModule,
  ],
  controllers: [EmpresaController],
  providers: [EmpresaService],
  exports: [EmpresaService, TypeOrmModule],
})
export class EmpresaModule {}
