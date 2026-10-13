import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { ProveedoresService } from './proveedores.service.js';
import { CondicionesPago } from '../entities/proveedor.entity.js';

const EMPRESA = 'empresa-1';

describe('ProveedoresService', () => {
  let service: ProveedoresService;
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((datos) => datos),
      save: vi.fn(async (datos) => ({ id: 'prov-1', ...datos })),
    };

    service = new ProveedoresService(repo as never);
  });

  it('crea un proveedor dentro del negocio activo', async () => {
    const proveedor = await service.crear(EMPRESA, {
      nombre: 'Distribuidora Andina',
      rif: '1023456028',
      condicionesPago: CondicionesPago.CREDITO_30,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Distribuidora Andina', empresaId: EMPRESA }),
    );
    expect(proveedor.id).toBe('prov-1');
  });

  it('rechaza un RIF duplicado dentro del mismo negocio (409)', async () => {
    repo.findOne.mockResolvedValue({ id: 'existente' });

    await expect(
      service.crear(EMPRESA, { nombre: 'Otra', rif: '1023456028' }),
    ).rejects.toThrow(ConflictException);
  });

  it('devuelve 404 si el proveedor no pertenece al negocio', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.obtenerPorId(EMPRESA, 'no-existe')).rejects.toThrow(NotFoundException);
  });

  it('desactiva (baja lógica) sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ id: 'prov-1', activo: true, nombre: 'Andina' });
    repo.save.mockImplementation(async (datos) => datos);

    const resultado = await service.desactivar(EMPRESA, 'prov-1');

    expect(resultado.activo).toBe(false);
    expect(repo.save).toHaveBeenCalled();
  });
});
