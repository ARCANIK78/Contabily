import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { GastosService } from './gastos.service.js';
import { EstadoGasto } from '../entities/gasto.entity.js';
import { MovimientosFinancierosService } from '../../cajas/services/movimientos-financieros.service.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { PlanDeCuenta } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import type { CrearGastoDto } from '../dto/gasto.dto.js';

const EMPRESA = 'empresa-1';

describe('GastosService', () => {
  let service: GastosService;
  let manager: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn>; getRepository: ReturnType<typeof vi.fn> };
  let asientosService: { crearAsiento: ReturnType<typeof vi.fn> };
  let gastosRepo: { find: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  let categoriasRepo: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let asientosCreados: Array<{ detalles: Array<{ cuentaId: string; debe: number; haber: number }> }>;
  let categoria: Record<string, any>;
  let caja: Record<string, any>;

  const cuentasContables: Record<string, { id: string; codigo: string }> = {
    '5.1.01': { id: 'cc-gasto', codigo: '5.1.01' },
    '5.1.02': { id: 'cc-servicios', codigo: '5.1.02' },
    '2.1.2.01': { id: 'cc-iva', codigo: '2.1.2.01' },
  };

  const dtoGasto: CrearGastoDto = {
    categoriaId: 'cat-1',
    cuentaFinancieraId: 'caja-1',
    descripcion: 'Alquiler de octubre',
    monto: 800,
  };

  beforeEach(() => {
    asientosCreados = [];
    categoria = {
      id: 'cat-1',
      empresaId: EMPRESA,
      nombre: 'Alquileres',
      activa: true,
      cuentaContableId: 'cc-gasto',
    };
    caja = {
      id: 'caja-1',
      nombre: 'Caja Chica',
      activo: true,
      moneda: 'BOB',
      saldo: '5000.00',
      cuentaContableId: 'cc-caja',
    };

    const reposPorClase = new Map<any, any>();
    reposPorClase.set(PlanDeCuenta, {
      findOne: vi.fn(async ({ where }: { where: { codigo?: string } }) =>
        where.codigo ? (cuentasContables[where.codigo] ?? null) : null,
      ),
    });
    reposPorClase.set(CuentaFinanciera, { count: vi.fn(async () => 0) });

    manager = {
      findOne: vi.fn(async (clase) => (clase === CuentaFinanciera ? { ...caja } : null)),
      create: vi.fn((_clase, datos) => datos),
      save: vi.fn(async (entidad) => ({ id: 'gasto-1', ...entidad })),
      update: vi.fn(async (clase, _id, datos) => {
        if (clase === CuentaFinanciera) {
          Object.assign(caja, datos);
        }
      }),
      getRepository: vi.fn((clase) => reposPorClase.get(clase)),
    };

    dataSource = {
      transaction: vi.fn(async (callback) => callback(manager)),
      getRepository: vi.fn((clase) => reposPorClase.get(clase)),
    };

    asientosService = {
      crearAsiento: vi.fn(async (_manager, input) => {
        asientosCreados.push(input);
        return { id: `asiento-${asientosCreados.length}` };
      }),
    };

    gastosRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    };

    categoriasRepo = {
      findOne: vi.fn(async () => ({ ...categoria })),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((datos) => datos),
      save: vi.fn(async (datos) => ({ id: 'cat-n', ...datos })),
    };

    const movimientosFinancieros = new MovimientosFinancierosService({} as never, {
      obtenerTasaDelDia: vi.fn().mockResolvedValue({ id: 'tc-1', tasa: '11.8500' }),
    } as never);

    service = new GastosService(
      gastosRepo as never,
      categoriasRepo as never,
      dataSource as never,
      asientosService as never,
      movimientosFinancieros as never,
    );
  });

  describe('crear', () => {
    it('paga el gasto al instante: asiento con la cuenta de la categoría y descuento de caja', async () => {
      const gasto = await service.crear(EMPRESA, 'usuario-1', dtoGasto);

      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-gasto', debe: 800, haber: 0 },
        { cuentaId: 'cc-caja', debe: 0, haber: 800 },
      ]);
      expect(caja.saldo).toBe('4200.00');
      expect(gasto.estado).toBe(EstadoGasto.PAGADO);
      expect(gasto.montoEnMonedaBase).toBe('800.00');
      expect(gasto.usuarioId).toBe('usuario-1');
    });

    it('con IVA desglosa la cuenta de IVA por pagar en el asiento', async () => {
      await service.crear(EMPRESA, 'usuario-1', { ...dtoGasto, iva: 104 });

      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-gasto', debe: 800, haber: 0 },
        { cuentaId: 'cc-iva', debe: 104, haber: 0 },
        { cuentaId: 'cc-caja', debe: 0, haber: 904 },
      ]);
      expect(caja.saldo).toBe('4096.00'); // 5000 − 904
    });

    it('en USD usa la tasa del día para el asiento y el débito de caja', async () => {
      caja.saldo = '100000.00';

      const gasto = await service.crear(EMPRESA, 'usuario-1', { ...dtoGasto, moneda: 'USD' });

      expect(gasto.montoEnMonedaBase).toBe('9480.00'); // 800 × 11.85
      expect(asientosCreados[0].detalles[1]).toEqual({ cuentaId: 'cc-caja', debe: 0, haber: 9480 });
      expect(caja.saldo).toBe('90520.00');
    });

    it('rechaza el gasto si la caja no tiene saldo suficiente', async () => {
      caja.saldo = '100.00';

      await expect(service.crear(EMPRESA, 'usuario-1', dtoGasto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza una categoría inactiva o ajena al negocio (404)', async () => {
      categoriasRepo.findOne.mockResolvedValue(null);

      await expect(service.crear(EMPRESA, 'usuario-1', dtoGasto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('anular', () => {
    const gastoPagado = (extra: Record<string, any> = {}) => ({
      id: 'gasto-1',
      empresaId: EMPRESA,
      estado: EstadoGasto.PAGADO,
      descripcion: 'Alquiler de octubre',
      monto: '800.00',
      iva: '0.00',
      moneda: 'BOB',
      numeroComprobante: null,
      cuentaFinancieraId: 'caja-1',
      asiento: {
        detalles: [
          { cuentaId: 'cc-gasto', debe: '800.00', haber: '0.00' },
          { cuentaId: 'cc-caja', debe: '0.00', haber: '800.00' },
        ],
      },
      ...extra,
    });

    it('genera el asiento inverso, devuelve el dinero a la caja y marca ANULADO', async () => {
      caja.saldo = '4200.00';
      gastosRepo.findOne.mockResolvedValue(gastoPagado());

      const gasto = await service.anular(EMPRESA, 'gasto-1');

      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-gasto', debe: 0, haber: 800 },
        { cuentaId: 'cc-caja', debe: 800, haber: 0 },
      ]);
      expect(caja.saldo).toBe('5000.00'); // 4200 + 800 devueltos
      expect(gasto.estado).toBe(EstadoGasto.ANULADO);
    });

    it('no anula dos veces', async () => {
      gastosRepo.findOne.mockResolvedValue(gastoPagado({ estado: EstadoGasto.ANULADO }));

      await expect(service.anular(EMPRESA, 'gasto-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('sembrarCategoriasBase', () => {
    it('crea solo las categorías cuya cuenta existe en el plan del negocio', async () => {
      categoriasRepo.findOne.mockResolvedValue(null);

      const creadas = await service.sembrarCategoriasBase(EMPRESA);

      // De CATEGORIAS_BASE solo 5.1.01 y 5.1.02 existen en el plan simulado.
      expect(creadas).toHaveLength(2);
      expect(categoriasRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Alquileres', cuentaContableId: 'cc-gasto' }),
      );
      expect(categoriasRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Servicios Básicos', cuentaContableId: 'cc-servicios' }),
      );
    });

    it('es idempotente: no duplica categorías existentes', async () => {
      categoriasRepo.findOne.mockResolvedValue({ id: 'cat-existente' });

      const creadas = await service.sembrarCategoriasBase(EMPRESA);

      expect(creadas).toHaveLength(0);
      expect(categoriasRepo.save).not.toHaveBeenCalled();
    });
  });
});
