import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request } from 'express';

import { Empresa } from '../entities/empresa.entity.js';

/** Cabecera estándar con la que el frontend indica el negocio activo. */
export const HEADER_EMPRESA = 'x-empresa-id';

/** UUID v4 — el mismo criterio que usan los DTOs (@IsUUID(4)). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestConEmpresa = Request & { user?: unknown; empresaId?: string };

/**
 * Resuelve el negocio/empresa sobre el que opera la petición y lo deja en
 * `req.empresaId` para que lo consuma el decorador `@EmpresaActual()`.
 *
 * Reglas:
 *  - Header `X-Empresa-Id`: se valida que exista, pertenezca al usuario y esté activa.
 *  - Sin header: si el usuario tiene exactamente 1 empresa activa, se usa sola.
 *  - Sin header y 0 empresas  → 409 (aún no creó ningún negocio).
 *  - Sin header y >1 empresas → 409 (debe elegir).
 *
 * Debe correr DESPUÉS de JwtAuthGuard: necesita `req.user`.
 */
@Injectable()
export class EmpresaActivaGuard implements CanActivate {
  /**
   * Se usa `DataSource` (provider global que publica TypeOrmModule.forRoot)
   * en lugar de `@InjectRepository(Empresa)`: así el guard no depende de que
   * cada módulo declare su propio `forFeature([Empresa])`.
   */
  constructor(private readonly dataSource: DataSource) {}

  private get empresasRepo() {
    return this.dataSource.getRepository(Empresa);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestConEmpresa>();
    const usuario = request.user as { id?: string } | undefined;

    if (!usuario?.id) {
      // El JwtAuthGuard no corrió en este endpoint: es un error de configuración.
      throw new UnauthorizedException('Autenticación requerida');
    }

    const header = this.leerHeaderEmpresa(request);
    const empresaId = header
      ? await this.validarPertenencia(header, usuario.id)
      : await this.resolverEmpresaUnica(usuario.id);

    request.empresaId = empresaId;
    return true;
  }

  private leerHeaderEmpresa(request: RequestConEmpresa): string | undefined {
    const crudo = request.headers[HEADER_EMPRESA];
    const valor = Array.isArray(crudo) ? crudo[0] : crudo;

    if (valor === undefined || valor === null || String(valor).trim() === '') {
      return undefined;
    }

    const id = String(valor).trim();
    if (!UUID_V4.test(id)) {
      throw new BadRequestException(
        `El header ${HEADER_EMPRESA} debe ser un UUID válido (recibido: "${id}")`,
      );
    }
    return id;
  }

  private async resolverEmpresaUnica(usuarioId: string): Promise<string> {
    const empresas = await this.empresasRepo.find({
      where: { usuarioId, activo: true },
      order: { creadoEn: 'ASC' },
      take: 2, // con 2 basta para decidir; no traemos el resto
    });

    if (empresas.length === 0) {
      throw new ConflictException(
        'Este usuario no tiene ningún negocio activo. Crea uno en POST /api/v1/empresas antes de operar.',
      );
    }

    if (empresas.length > 1) {
      throw new ConflictException(
        `Tiene varios negocios activos. Envía el header ${HEADER_EMPRESA} con el id del negocio a usar (disponibles en GET /api/v1/empresas).`,
      );
    }

    return empresas[0].id;
  }

  /**
   * Valida que la empresa del header exista, pertenezca al usuario autenticado
   * y esté activa. Sin esto, cualquier usuario podría mandar el UUID de una
   * empresa ajena y leer sus datos (IDOR).
   *
   * Devolvemos 404 en lugar de 403 para no confirmar la existencia de un
   * negocio que no nos pertenece.
   */
  private async validarPertenencia(empresaId: string, usuarioId: string): Promise<string> {
    const empresa = await this.empresasRepo.findOne({
      where: { id: empresaId, usuarioId, activo: true },
    });

    if (!empresa) {
      // 404 idéntico tanto si no existe como si es de otro usuario o está
      // desactivada: no confirmamos la existencia de negocios ajenos.
      throw new NotFoundException('Empresa no encontrada');
    }

    return empresa.id;
  }
}
