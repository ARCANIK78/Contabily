import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * Inyecta el id del negocio/empresa activo (`req.empresaId`) que resolvió
 * el EmpresaActivaGuard.
 *
 *   @Post('plan-cuentas')
 *   crear(@EmpresaActual() empresaId: string, @Body() dto: CrearCuentaDto) { ... }
 *
 * Lanza 500 si el guard no corrió: es un error de configuración del endpoint,
 * no algo que el cliente pueda arreglar.
 */
export const EmpresaActual = createParamDecorator(
  (_campo: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const empresaId: string | undefined = request.empresaId;

    if (!empresaId) {
      throw new InternalServerErrorException(
        'Contexto de empresa no resuelto: falta EmpresaActivaGuard en este endpoint',
      );
    }

    return empresaId;
  },
);
