import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { EmpresaActivaGuard } from './empresa-activa.guard.js';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const OTRO_USUARIO = '22222222-2222-4222-8222-222222222222';
const MI_EMPRESA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMPRESA_AJENA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_INVALIDO = 'no-es-un-uuid';

type EmpresaFila = { id: string; usuarioId: string; activo: boolean; creadoEn: Date };

function contexto(headers: Record<string, string> = {}, user?: { id: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        user,
        empresaId: undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('EmpresaActivaGuard', () => {
  let guard: EmpresaActivaGuard;
  let repo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let empresas: EmpresaFila[];

  const empresa = (
    id: string,
    usuarioId: string,
    activo = true,
    minutos = 0,
  ): EmpresaFila => ({
    id,
    usuarioId,
    activo,
    creadoEn: new Date(2026, 0, 1, 0, minutos),
  });

  beforeEach(() => {
    empresas = [empresa(MI_EMPRESA, USUARIO, true, 0)];

    repo = {
      find: vi.fn(async (opciones) => {
        const { usuarioId, activo } = opciones.where;
        const filtradas = empresas.filter(
          (e) => e.usuarioId === usuarioId && e.activo === activo,
        );
        const ordenadas = [...filtradas].sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
        return opciones.take ? ordenadas.slice(0, opciones.take) : ordenadas;
      }),
      findOne: vi.fn(async (opciones) => {
        const { id, usuarioId, activo } = opciones.where;
        return (
          empresas.find(
            (e) =>
              e.id === id &&
              e.usuarioId === usuarioId &&
              (activo === undefined || e.activo === activo),
          ) ?? null
        );
      }),
    };

    // El guard usa dataSource.getRepository(Empresa)
    guard = new EmpresaActivaGuard({
      getRepository: () => repo,
    } as never);
  });

  describe('con header X-Empresa-Id', () => {
    it('acepta la empresa propia del usuario', async () => {
      const ctx = contexto({ 'x-empresa-id': MI_EMPRESA }, { id: USUARIO });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: MI_EMPRESA, usuarioId: USUARIO, activo: true },
      });
    });

    it('RECHAZA una empresa de OTRO usuario (IDOR)', async () => {
      empresas.push(empresa(EMPRESA_AJENA, OTRO_USUARIO));
      const ctx = contexto({ 'x-empresa-id': EMPRESA_AJENA }, { id: USUARIO });

      // 404 y no 403: no revelamos que ese negocio existe.
      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    });

    it('RECHAZA una empresa desactivada del propio usuario', async () => {
      empresas = [empresa(MI_EMPRESA, USUARIO, false)];
      const ctx = contexto({ 'x-empresa-id': MI_EMPRESA }, { id: USUARIO });

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    });

    it('RECHAZA una empresa inexistente', async () => {
      const ctx = contexto({ 'x-empresa-id': EMPRESA_AJENA }, { id: USUARIO });

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    });

    it('rechaza un header que no es UUID', async () => {
      const ctx = contexto({ 'x-empresa-id': UUID_INVALIDO }, { id: USUARIO });

      await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('deja el id en req.empresaId para @EmpresaActual()', async () => {
      const request = {
        headers: { 'x-empresa-id': MI_EMPRESA },
        user: { id: USUARIO },
        empresaId: undefined as string | undefined,
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);

      expect(request.empresaId).toBe(MI_EMPRESA);
    });
  });

  describe('sin header', () => {
    it('usa la única empresa activa del usuario', async () => {
      const request = {
        headers: {},
        user: { id: USUARIO },
        empresaId: undefined as string | undefined,
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.empresaId).toBe(MI_EMPRESA);
    });

    it('devuelve 409 si el usuario no tiene ninguna empresa', async () => {
      empresas = [];
      const ctx = contexto({}, { id: USUARIO });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ConflictException);
    });

    it('devuelve 409 pidiendo elegir si tiene varias empresas', async () => {
      empresas = [
        empresa(MI_EMPRESA, USUARIO, true, 0),
        empresa(EMPRESA_AJENA, USUARIO, true, 1),
      ];
      const ctx = contexto({}, { id: USUARIO });

      await expect(guard.canActivate(ctx)).rejects.toThrow(/X-Empresa-Id/i);
    });

    it('no cuenta las empresas desactivadas como candidatas', async () => {
      empresas = [
        empresa(MI_EMPRESA, USUARIO, true, 0),
        empresa(EMPRESA_AJENA, USUARIO, false, 1), // desactivada
      ];
      const request = {
        headers: {},
        user: { id: USUARIO },
        empresaId: undefined as string | undefined,
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.empresaId).toBe(MI_EMPRESA);
    });
  });

  describe('sin autenticar', () => {
    it('lanza 401 si no hay usuario en la request', async () => {
      const ctx = contexto({}, undefined);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});
