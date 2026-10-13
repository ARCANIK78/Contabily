import { Global, Module } from '@nestjs/common';

import { EmpresaActivaGuard } from './guards/empresa-activa.guard.js';

/**
 * Módulo mínimo que publica el guard de tenant (empresa activa).
 *
 * Existe separado de `EmpresaModule` a propósito: EmpresaModule importa
 * ContabilidadModule (para sembrar el plan de cuentas al crear un negocio),
 * y ContabilidadModule necesita este guard. Si estuviera todo en un módulo
 * habría una dependencia circular.
 *
 * El guard solo inyecta `DataSource` (provider global), por lo que este
 * módulo no tiene que exportar repositorios.
 */
@Global()
@Module({
  providers: [EmpresaActivaGuard],
  exports: [EmpresaActivaGuard],
})
export class EmpresaContextModule {}
