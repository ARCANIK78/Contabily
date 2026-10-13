import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { ComprasService } from './compras.service.js';
import { EstadoCompra, TipoPagoCompra } from '../entities/compra.entity.js';
import { MovimientosFinancierosService } from '../../cajas/services/movimientos-financieros.service.js';
import { Proveedor } from '../entities/proveedor.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { PlanDeCuenta } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import type { CrearCompraDto } from '../dto/compra.dto.js';

const EMPRESA = 'empresa-1';

describe('ComprasService', () => {
  let service: ComprasService;
  let manager: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn>; getRepository: ReturnType<typeof vi.fn> };
  let asientosService: { crearAsiento: ReturnType<typeof vi.fn> };
  let productoService: {
    aplicarEntradaCompra: ReturnType<typeof vi.fn>;
    reversarEntradaCompra: ReturnType<typeof vi.fn>;
  };
  let comprasRepo: { find: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  let asientosCreados: Array<{ detalles: Array<{ cuentaId: string; debe: number; haber: number }> }>;
  let compraGuardada: Record<string, any> | null;
  let caja: Record<string, any>;

  const proveedor = { id: 'prov-1', nombre: 'Distribuidora Andina', activo: true };
  const cuentasContables: Record<string, { id: string; codigo: string }> = {
    '1.1.3.01': { id: 'cc-merc', codigo: '1.1.3.01' },
    '2.1.2.01': { id: 'cc-iva', codigo: '2.1.2.01' },
    '2.1.1.01': { id: 'cc-prov', codigo: '2.1.1.01' },
  };

  const dtoContado: CrearCompraDto = {
    proveedorId: 'prov-1',
    numeroFactura: 'FA-001',
    tipoPago: TipoPagoCompra.CONTADO,
    cuentaFinancieraId: 'caja-1',
    detalles: [{ productoId: 'p1', descripcion: 'Zapatos', cantidad: 2, costoUnitario: 100 }],
  };

  beforeEach(() => {
    asientosCreados = [];
    compraGuardada = null;
    caja = {
      id: 'caja-1',
      nombre: 'Caja Chica',
      activo: true,
      moneda: 'BOB',
      saldo: '1000.00',
      cuentaContableId: 'cc-caja',
    };

    const reposPorClase = new Map<any, any>();
    reposPorClase.set(PlanDeCuenta, {
      findOne: vi.fn(async ({ where }: { where: { codigo?: string } }) =>
        where.codigo ? (cuentasContables[where.codigo] ?? null) : null,
      ),
    });
    reposPorClase.set(Proveedor, { findOne: vi.fn(async () => ({ ...proveedor })) });

    manager = {
      findOne: vi.fn(async (clase) =>
        clase === CuentaFinanciera ? { ...caja } : null,
      ),
      create: vi.fn((_clase, datos) => datos),
      save: vi.fn(async (entidad) => {
        if (entidad && 'numeroFactura' in entidad) {
          compraGuardada = { proveedor, pagos: [], ...entidad };
          return compraGuardada;
        }
        return { id: 'gen-1', ...entidad };
      }),
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

    productoService = {
      aplicarEntradaCompra: vi.fn(),
      reversarEntradaCompra: vi.fn(),
    };

    comprasRepo = {
      find: vi.fn(async () => (compraGuardada ? [compraGuardada] : [])),
      findOne: vi.fn(async () => compraGuardada),
    };

    const movimientosFinancieros = new MovimientosFinancierosService({} as never, {
      obtenerTasaDelDia: vi.fn().mockResolvedValue({ id: 'tc-1', tasa: '11.8500' }),
    } as never);

    service = new ComprasService(
      comprasRepo as never,
      dataSource as never,
      asientosService as never,
      movimientosFinancieros as never,
      productoService as never,
    );
  });

  describe('crear', () => {
    it('de contado: genera el asiento, descuenta la caja y recibe la mercadería', async () => {
      const compra = await service.crear(EMPRESA, dtoContado);

      expect(compra.estado).toBe(EstadoCompra.PAGADA);
      expect(compra.saldoPendiente).toBe('0.00');
      expect(compra.total).toBe('200.00');

      // Debe mercaderías / Haber caja
      expect(asientosCreados).toHaveLength(1);
      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-merc', debe: 200, haber: 0 },
        { cuentaId: 'cc-caja', debe: 0, haber: 200 },
      ]);

      // La caja baja de 1000 a 800
      expect(caja.saldo).toBe('800.00');

      // Inventario recibido dentro de la misma transacción
      expect(productoService.aplicarEntradaCompra).toHaveBeenCalledTimes(1);
      expect(productoService.aplicarEntradaCompra.mock.calls[0][3]).toEqual([
        expect.objectContaining({ productoId: 'p1', cantidad: 2, costoUnitario: 100 }),
      ]);
    });

    it('de crédito: genera cuenta por pagar sin tocar la caja', async () => {
      const compra = await service.crear(EMPRESA, {
        ...dtoContado,
        tipoPago: TipoPagoCompra.CREDITO,
        cuentaFinancieraId: undefined,
      });

      expect(compra.estado).toBe(EstadoCompra.RECIBIDA);
      expect(compra.saldoPendiente).toBe('200.00');
      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-merc', debe: 200, haber: 0 },
        { cuentaId: 'cc-prov', debe: 0, haber: 200 },
      ]);
      expect(caja.saldo).toBe('1000.00');
      // La mercadería se recibe igual de contado o a crédito
      expect(productoService.aplicarEntradaCompra).toHaveBeenCalledTimes(1);
    });

    it('con IVA: el asiento desglosa la cuenta de IVA por pagar', async () => {
      const compra = await service.crear(EMPRESA, { ...dtoContado, iva: 26 });

      expect(compra.total).toBe('226.00');
      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-merc', debe: 200, haber: 0 },
        { cuentaId: 'cc-iva', debe: 26, haber: 0 },
        { cuentaId: 'cc-caja', debe: 0, haber: 226 },
      ]);
    });

    it('en USD: convierte el asiento a moneda base con la tasa del día', async () => {
      caja.saldo = '100000.00';

      const compra = await service.crear(EMPRESA, { ...dtoContado, moneda: 'USD' });

      expect(compra.montoEnMonedaBase).toBe('2370.00'); // 200 × 11.85
      expect(asientosCreados[0].detalles[1]).toEqual({ cuentaId: 'cc-caja', debe: 0, haber: 2370 });
      expect(caja.saldo).toBe('97630.00'); // 100000 − 2370
    });

    it('rechaza una compra de contado sin cuenta financiera', async () => {
      await expect(
        service.crear(EMPRESA, { ...dtoContado, cuentaFinancieraId: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una compra de contado sin saldo suficiente', async () => {
      caja.saldo = '50.00';

      await expect(service.crear(EMPRESA, dtoContado)).rejects.toThrow(BadRequestException);
    });
  });

  describe('registrarPago', () => {
    const compraPendiente = () => ({
      id: 'compra-1',
      empresaId: EMPRESA,
      estado: EstadoCompra.RECIBIDA,
      saldoPendiente: '200.00',
      total: '200.00',
      moneda: 'BOB',
      numeroFactura: 'FA-001',
      pagos: [],
    });

    it('un pago parcial amortiza la deuda y mantiene la compra en RECIBIDA', async () => {
      compraGuardada = compraPendiente();

      await service.registrarPago(EMPRESA, 'compra-1', {
        cuentaFinancieraId: 'caja-1',
        monto: 50,
      });

      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-prov', debe: 50, haber: 0 },
        { cuentaId: 'cc-caja', debe: 0, haber: 50 },
      ]);
      expect(caja.saldo).toBe('950.00');
      expect(compraGuardada?.saldoPendiente).toBe('150.00');
      expect(compraGuardada?.estado).toBe(EstadoCompra.RECIBIDA);
    });

    it('un pago que cubre el saldo pone la compra en PAGADA', async () => {
      compraGuardada = compraPendiente();

      await service.registrarPago(EMPRESA, 'compra-1', {
        cuentaFinancieraId: 'caja-1',
        monto: 200,
      });

      expect(compraGuardada?.saldoPendiente).toBe('0.00');
      expect(compraGuardada?.estado).toBe(EstadoCompra.PAGADA);
    });

    it('rechaza un pago que excede el saldo pendiente', async () => {
      compraGuardada = compraPendiente();

      await expect(
        service.registrarPago(EMPRESA, 'compra-1', { cuentaFinancieraId: 'caja-1', monto: 300 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza pagar una compra anulada', async () => {
      compraGuardada = { ...compraPendiente(), estado: EstadoCompra.ANULADA };

      await expect(
        service.registrarPago(EMPRESA, 'compra-1', { cuentaFinancieraId: 'caja-1', monto: 50 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('anular', () => {
    const compraAAnular = (extra: Record<string, any> = {}) => ({
      id: 'compra-1',
      empresaId: EMPRESA,
      estado: EstadoCompra.RECIBIDA,
      tipoPago: TipoPagoCompra.CREDITO,
      cuentaFinancieraId: null,
      moneda: 'BOB',
      total: '200.00',
      numeroFactura: 'FA-001',
      proveedor: { nombre: 'Distribuidora Andina' },
      pagos: [],
      detalles: [
        {
          productoId: 'p1',
          varianteId: null,
          cantidad: 2,
          costoUnitario: '100.00',
          descripcion: 'Zapatos',
        },
      ],
      asiento: {
        detalles: [
          { cuentaId: 'cc-merc', debe: '200.00', haber: '0.00' },
          { cuentaId: 'cc-prov', debe: '0.00', haber: '200.00' },
        ],
      },
      ...extra,
    });

    it('revierte el inventario y genera el asiento inverso', async () => {
      compraGuardada = compraAAnular();

      const compra = await service.anular(EMPRESA, 'compra-1');

      expect(productoService.reversarEntradaCompra).toHaveBeenCalledTimes(1);
      expect(asientosCreados[0].detalles).toEqual([
        { cuentaId: 'cc-merc', debe: 0, haber: 200 },
        { cuentaId: 'cc-prov', debe: 200, haber: 0 },
      ]);
      expect(compra.estado).toBe(EstadoCompra.ANULADA);
    });

    it('si fue de contado devuelve el dinero a la caja', async () => {
      compraGuardada = compraAAnular({
        tipoPago: TipoPagoCompra.CONTADO,
        cuentaFinancieraId: 'caja-1',
      });

      await service.anular(EMPRESA, 'compra-1');

      expect(caja.saldo).toBe('1200.00'); // 1000 + 200 devueltos
    });

    it('no anula una compra que ya tiene pagos', async () => {
      compraGuardada = compraAAnular({ pagos: [{ id: 'pago-1' }] });

      await expect(service.anular(EMPRESA, 'compra-1')).rejects.toThrow(BadRequestException);
    });
  });
});
