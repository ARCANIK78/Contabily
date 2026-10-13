import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

import { PlanCuentasService } from './plan-cuentas.service.js';

const EMPRESA = 'empresa-uuid-1';
const OTRA_EMPRESA = 'empresa-uuid-2';

describe('PlanCuentasService', () => {
  let service: PlanCuentasService;
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let dataSource: { getRepository: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      find: vi.fn(),
      count: vi.fn(),
      create: vi.fn((...args) => (args.length === 2 ? args[1] : args[0])),
      save: vi.fn((entidad) =>
        Promise.resolve(
          Array.isArray(entidad)
            ? entidad.map((e, i) => ({ id: `uuid-${i}`, ...e }))
            : { id: 'uuid-nuevo', ...entidad },
        ),
      ),
      remove: vi.fn(),
    };
    dataSource = {
      getRepository: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
    };
    service = new PlanCuentasService(repo as never, dataSource as never);
  });

  describe('crearCuenta', () => {
    it('rechaza un código duplicado dentro del mismo negocio', async () => {
      repo.findOne.mockResolvedValue({ id: 'x', codigo: '1.1.1.01', empresaId: EMPRESA });

      await expect(
        service.crearCuenta(EMPRESA, { codigo: '1.1.1.01', nombre: 'Caja General' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { codigo: '1.1.1.01', empresaId: EMPRESA },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('permite el mismo código en otro negocio (unicidad por empresa)', async () => {
      // El primer findOne es la comprobación de duplicado: libre en esta empresa.
      repo.findOne.mockImplementation((opciones) => {
        if (opciones?.where?.codigo === '1.1.1.01') return Promise.resolve(null);
        if (opciones?.where?.codigo === '1') return Promise.resolve({ id: 'clase-1', codigo: '1' });
        return Promise.resolve(null);
      });

      const cuenta = await service.crearCuenta(EMPRESA, {
        codigo: '1.1.1.01',
        nombre: 'Caja General',
      });

      expect(cuenta).toMatchObject({ codigo: '1.1.1.01', empresaId: EMPRESA });
      expect(repo.save).toHaveBeenCalled();
      // La comprobación de duplicado siempre incluye la empresa
      const donde = repo.findOne.mock.calls[0][0];
      expect(donde.where.empresaId).toBe(EMPRESA);
    });

    it('crea una cuenta válida con valores por defecto', async () => {
      repo.findOne.mockImplementation((opciones) =>
        Promise.resolve(opciones?.where?.codigo === '1' ? { id: 'clase-1', codigo: '1' } : null),
      );

      const cuenta = await service.crearCuenta(EMPRESA, {
        codigo: '1.1.1.01',
        nombre: 'Caja General',
      });

      expect(cuenta).toMatchObject({
        codigo: '1.1.1.01',
        nombre: 'Caja General',
        cuentaPadreId: null,
        esTransaccional: false,
        empresaId: EMPRESA,
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('valida que la cuenta padre exista en la misma empresa', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // código libre
        .mockResolvedValueOnce({ id: 'clase-1', codigo: '1' }) // clase raíz OK
        .mockResolvedValueOnce(null); // padre no existe

      await expect(
        service.crearCuenta(EMPRESA, {
          codigo: '1.1.1.01',
          nombre: 'Hija',
          cuentaPadreId: 'no-existe',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un código con punto si la clase raíz no existe', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // código libre
        .mockResolvedValueOnce(null); // clase raíz "9" no existe

      await expect(
        service.crearCuenta(EMPRESA, { codigo: '9.1.01', nombre: 'Huérfana' }),
      ).rejects.toThrow('Primero debe existir la clase "9"');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('crea un código con punto cuando la clase raíz existe', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // código libre
        .mockResolvedValueOnce({ id: 'clase-4', codigo: '4', nombre: 'Ingresos' }); // clase raíz OK

      const cuenta = await service.crearCuenta(EMPRESA, { codigo: '4.1.01', nombre: 'Ventas' });

      expect(cuenta).toMatchObject({ codigo: '4.1.01', nombre: 'Ventas' });
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('obtenerCuentas / obtenerArbolCuentas', () => {
    it('acota las consultas a la empresa activa', async () => {
      repo.find.mockResolvedValue([]);

      await service.obtenerCuentas(EMPRESA);
      expect(repo.find).toHaveBeenCalledWith({
        where: { empresaId: EMPRESA },
        order: { codigo: 'ASC' },
      });

      await service.obtenerArbolCuentas(EMPRESA);
      expect(repo.find).toHaveBeenLastCalledWith({
        where: { empresaId: EMPRESA },
        order: { codigo: 'ASC' },
      });
    });

    it('construye la jerarquía de padres e hijos', async () => {
      repo.find.mockResolvedValue([
        { id: 'a', codigo: '1', nombre: 'Activo', cuentaPadreId: null, esTransaccional: false },
        { id: 'b', codigo: '1.1', nombre: 'Disponible', cuentaPadreId: 'a', esTransaccional: false },
        { id: 'c', codigo: '1.1.1', nombre: 'Caja', cuentaPadreId: 'b', esTransaccional: true },
        { id: 'd', codigo: '2', nombre: 'Pasivo', cuentaPadreId: null, esTransaccional: false },
      ]);

      const arbol = await service.obtenerArbolCuentas(EMPRESA);

      expect(arbol).toHaveLength(2);
      expect(arbol[0].codigo).toBe('1');
      expect(arbol[0].subCuentas).toHaveLength(1);
      expect(arbol[0].subCuentas[0].codigo).toBe('1.1');
      expect(arbol[0].subCuentas[0].subCuentas[0].codigo).toBe('1.1.1');
      expect(arbol[1].codigo).toBe('2');
    });
  });

  describe('eliminarCuenta', () => {
    it('rechaza eliminar una cuenta con subcuentas', async () => {
      repo.findOne.mockResolvedValue({ id: 'a', codigo: '1', nombre: 'Activo' });
      repo.count.mockResolvedValue(2);

      await expect(service.eliminarCuenta(EMPRESA, 'a')).rejects.toThrow(BadRequestException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('rechaza eliminar una cuenta con cajas o bancos asociados', async () => {
      repo.findOne.mockResolvedValue({ id: 'a', codigo: '1.1.1', nombre: 'Caja' });
      repo.count.mockResolvedValue(0); // sin subcuentas
      dataSource.getRepository.mockReturnValue({ count: vi.fn().mockResolvedValue(1) }); // con caja asociada

      await expect(service.eliminarCuenta(EMPRESA, 'a')).rejects.toThrow(BadRequestException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('elimina una cuenta sin dependencias', async () => {
      repo.findOne.mockResolvedValue({ id: 'a', codigo: '9', nombre: 'Libre' });
      repo.count.mockResolvedValue(0);
      dataSource.getRepository.mockReturnValue({ count: vi.fn().mockResolvedValue(0) });
      repo.remove.mockResolvedValue(undefined);

      const resultado = await service.eliminarCuenta(EMPRESA, 'a');

      expect(resultado).toEqual({ eliminada: true });
      expect(repo.remove).toHaveBeenCalledWith({ id: 'a', codigo: '9', nombre: 'Libre' });
    });
  });

  describe('obtenerCuentaPorId', () => {
    it('lanza NotFound si la cuenta no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.obtenerCuentaPorId(EMPRESA, 'no-existe')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFound si la cuenta es de OTRO negocio (no revela existencia)', async () => {
      // El repo solo devuelve filas que coincidan con id + empresaId.
      repo.findOne.mockImplementation((opciones) =>
        Promise.resolve(
          opciones?.where?.empresaId === EMPRESA
            ? null // en mi empresa no está…
            : { id: 'cuenta-ajena', codigo: '1.1.1.01', empresaId: OTRA_EMPRESA },
        ),
      );

      await expect(service.obtenerCuentaPorId(EMPRESA, 'cuenta-ajena')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'cuenta-ajena', empresaId: EMPRESA },
      });
    });
  });

  describe('actualizarCuenta', () => {
    it('rechaza asignar como padre a un descendiente (ciclo)', async () => {
      // 'a' es la raíz y 'b' es su hijo: poner 'a' bajo 'b' crearía un ciclo
      repo.findOne.mockImplementation((opciones) => {
        const id = opciones?.where?.id;
        if (id === 'a') return Promise.resolve({ id: 'a', codigo: '1.1', cuentaPadreId: null });
        if (id === 'b') return Promise.resolve({ id: 'b', codigo: '1.1.01', cuentaPadreId: 'a' });
        return Promise.resolve(null);
      });

      await expect(
        service.actualizarCuenta(EMPRESA, 'a', { cuentaPadreId: 'b' }),
      ).rejects.toThrow('ciclo');
      expect(repo.save).not.toHaveBeenCalled();
    });
    it('rechaza cambiar el código a otro huérfano', async () => {
      repo.findOne
        .mockResolvedValueOnce({ id: 'a', codigo: '5.1.01', nombre: 'Gastos' }) // obtenerCuentaPorId
        .mockResolvedValueOnce(null) // código nuevo sin duplicar
        .mockResolvedValueOnce(null); // clase raíz "9" no existe

      await expect(
        service.actualizarCuenta(EMPRESA, 'a', { codigo: '9.2' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sembrarPlanBase', () => {
    it('siembra el catálogo completo la primera vez', async () => {
      // count() → 0 (vacío); save() devuelve el id que pide el padre
      repo.count.mockResolvedValue(0);
      repo.save.mockImplementation((entidad) => Promise.resolve({ id: `id-${entidad.codigo}`, ...entidad }));

      const cuentas = await service.sembrarPlanBase(EMPRESA);

      expect(cuentas.length).toBeGreaterThan(30);
      expect(cuentas.map((c) => c.codigo)).toEqual(
        expect.arrayContaining(['1', '2', '3', '4', '5', '6', '1.1.1.01', '3.1.01', '4.1.01']),
      );
      expect(cuentas.every((c) => c.empresaId === EMPRESA)).toBe(true);
      // Todo el catálogo pertenece a esta empresa
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ empresaId: EMPRESA }));
    });

    it('cuelga cada subcuenta de su padre correcto', async () => {
      repo.count.mockResolvedValue(0);
      repo.save.mockImplementation((entidad) => Promise.resolve({ id: `id-${entidad.codigo}`, ...entidad }));

      const cuentas = await service.sembrarPlanBase(EMPRESA);
      const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));

      expect(porCodigo.get('1')?.cuentaPadreId).toBeNull();
      expect(porCodigo.get('1.1')?.cuentaPadreId).toBe('id-1');
      expect(porCodigo.get('1.1.1.01')?.cuentaPadreId).toBe('id-1.1.1');
      expect(porCodigo.get('3.1.01')?.cuentaPadreId).toBe('id-3.1');
      expect(porCodigo.get('6.1.01')?.cuentaPadreId).toBe('id-6.1');
    });

    it('marca como transaccional las cuentas de movimiento', async () => {
      repo.count.mockResolvedValue(0);
      repo.save.mockImplementation((entidad) => Promise.resolve({ id: `id-${entidad.codigo}`, ...entidad }));

      const cuentas = await service.sembrarPlanBase(EMPRESA);
      const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));

      expect(porCodigo.get('3.1.01')?.esTransaccional).toBe(true); // capital (apertura)
      expect(porCodigo.get('1.1.1.01')?.esTransaccional).toBe(true); // caja
      expect(porCodigo.get('4.1.01')?.esTransaccional).toBe(true); // ventas
      expect(porCodigo.get('1')?.esTransaccional).toBe(false); // clase agrupadora
      expect(porCodigo.get('5')?.esTransaccional).toBe(false);
    });

    it('no toca nada si el negocio ya tiene cuentas', async () => {
      repo.count.mockResolvedValue(5);

      const resultado = await service.sembrarPlanBase(EMPRESA);

      expect(resultado).toEqual([]);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.count).toHaveBeenCalledWith({ where: { empresaId: EMPRESA } });
    });
  });
});
