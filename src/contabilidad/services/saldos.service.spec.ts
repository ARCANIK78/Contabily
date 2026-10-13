import { describe, it, expect, beforeEach, vi } from 'vitest';

import { SaldosService } from './saldos.service.js';
import { EstadoAsiento } from '../entities/asiento-contable.entity.js';
import type { PlanDeCuenta } from '../entities/plan-de-cuenta.entity.js';

const EMPRESA = 'empresa-1';
const OTRA_EMPRESA = 'empresa-2';

type FixtureDetalle = {
  cuentaId: string;
  debe: number;
  haber: number;
  empresaId: string;
  estado: EstadoAsiento;
  /** Día del movimiento, YYYY-MM-DD. */
  fecha: string;
};

/**
 * Plan del negocio con un truco deliberado: `2.5.01` tiene el código de la
 * clase Pasivo pero está colgada de una cuenta del Activo. Si el roll-up se
 * hiciera por prefijo de código, esta cuenta entraría en el grupo equivocado.
 */
const PLAN: PlanDeCuenta[] = [
  { id: 'c1', codigo: '1', nombre: 'Activo', cuentaPadreId: null, esTransaccional: false },
  { id: 'c11', codigo: '1.1', nombre: 'Disponible', cuentaPadreId: 'c1', esTransaccional: false },
  { id: 'caja', codigo: '1.1.1.01', nombre: 'Caja General', cuentaPadreId: 'c11', esTransaccional: true },
  { id: 'banco', codigo: '1.1.1.02', nombre: 'Bancos', cuentaPadreId: 'c11', esTransaccional: true },

  { id: 'c2', codigo: '2', nombre: 'Pasivo', cuentaPadreId: null, esTransaccional: false },
  { id: 'c21', codigo: '2.1', nombre: 'Pasivo Corriente', cuentaPadreId: 'c2', esTransaccional: false },
  { id: 'prov', codigo: '2.1.1.01', nombre: 'Proveedores', cuentaPadreId: 'c21', esTransaccional: true },
  // Mal colgada a propósito: código de Pasivo, padre del Activo.
  { id: 'rara', codigo: '2.5.01', nombre: 'Cuenta mal colgada', cuentaPadreId: 'c11', esTransaccional: true },

  { id: 'c4', codigo: '4', nombre: 'Ingresos', cuentaPadreId: null, esTransaccional: false },
  { id: 'ventas', codigo: '4.1.01', nombre: 'Ingresos por Ventas', cuentaPadreId: 'c4', esTransaccional: true },

  { id: 'c5', codigo: '5', nombre: 'Gastos', cuentaPadreId: null, esTransaccional: false },
  { id: 'alquiler', codigo: '5.1.01', nombre: 'Alquileres', cuentaPadreId: 'c5', esTransaccional: true },
] as PlanDeCuenta[];

describe('SaldosService', () => {
  let service: SaldosService;
  let detalles: FixtureDetalle[];
  let planRepo: { find: ReturnType<typeof vi.fn> };
  let detallesRepo: { createQueryBuilder: ReturnType<typeof vi.fn> };

  /**
   * Mini motor que reproduce el comportamiento del SQL: filtra por el negocio
   * del asiento, descarta los anulados, aplica el rango de fechas y agrupa por
   * cuenta. Es lo que permite asertar de verdad que un asiento anulado no suma.
   */
  function crearQueryBuilder() {
    const filtros: { empresaId?: string; estado?: string; desde?: Date; hasta?: Date } = {};

    const builder: any = {
      innerJoin: () => builder,
      select: () => builder,
      addSelect: () => builder,
      where: (_sql: string, params: { empresaId: string }) => {
        filtros.empresaId = params.empresaId;
        return builder;
      },
      andWhere: (_sql: string, params: Record<string, unknown>) => {
        if (typeof params.estado === 'string') filtros.estado = params.estado;
        if (params.fechaDesde instanceof Date) filtros.desde = params.fechaDesde;
        if (params.fechaHasta instanceof Date) filtros.hasta = params.fechaHasta;
        return builder;
      },
      groupBy: () => builder,
      getRawMany: async () => {
        const acumulado = new Map<string, { debe: number; haber: number }>();
        for (const fila of detalles) {
          if (filtros.empresaId && fila.empresaId !== filtros.empresaId) continue;
          if (filtros.estado && fila.estado !== filtros.estado) continue;
          const dia = new Date(`${fila.fecha}T00:00:00.000Z`);
          if (filtros.desde && dia < filtros.desde) continue;
          if (filtros.hasta && dia >= filtros.hasta) continue;

          const actual = acumulado.get(fila.cuentaId) ?? { debe: 0, haber: 0 };
          acumulado.set(fila.cuentaId, {
            debe: actual.debe + fila.debe,
            haber: actual.haber + fila.haber,
          });
        }
        return [...acumulado.entries()].map(([cuentaId, m]) => ({
          cuentaId,
          debe: String(m.debe),
          haber: String(m.haber),
        }));
      },
    };
    return builder;
  }

  beforeEach(() => {
    detalles = [
      // Caja: 1000 de entrada y 300 de salida → 700 deudor
      { cuentaId: 'caja', debe: 1000, haber: 0, empresaId: EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-01-10' },
      { cuentaId: 'caja', debe: 0, haber: 300, empresaId: EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-02-05' },

      // Un asiento ANULADO que no debe sumar en ningún reporte
      { cuentaId: 'caja', debe: 9999, haber: 0, empresaId: EMPRESA, estado: EstadoAsiento.ANULADO, fecha: '2026-03-01' },

      // Cuenta mal colgada: suma al padre por parentesco, no por código
      { cuentaId: 'rara', debe: 50, haber: 0, empresaId: EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-01-15' },

      // Proveedores: 400 acreedor
      { cuentaId: 'prov', debe: 0, haber: 400, empresaId: EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-01-20' },

      // Ventas (acreedor) y Alquiler (deudor)
      { cuentaId: 'ventas', debe: 0, haber: 2000, empresaId: EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-01-25' },
      { cuentaId: 'alquiler', debe: 600, haber: 0, empresaId: EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-02-10' },

      // Movimiento de OTRA empresa: jamás debe filtrarse por el negocio activo
      { cuentaId: 'caja', debe: 50000, haber: 0, empresaId: OTRA_EMPRESA, estado: EstadoAsiento.CONFIRMADO, fecha: '2026-01-01' },
    ];

    planRepo = { find: vi.fn(async () => PLAN) };
    detallesRepo = { createQueryBuilder: vi.fn(() => crearQueryBuilder()) };

    service = new SaldosService(detallesRepo as never, planRepo as never);
  });

  describe('aislamiento multi-tenant', () => {
    it('NO suma los movimientos de otro negocio', async () => {
      const saldos = await service.calcularSaldos(EMPRESA);

      // 1000 - 300 = 700. Si se colara el asiento ajeno sería 50700.
      expect(saldos.get('caja')?.debe).toBe(1000);
      expect(saldos.get('caja')?.neto).toBe(700);
    });
  });

  describe('exclusión de asientos anulados', () => {
    it('un asiento anulado no mueve el saldo', async () => {
      const saldos = await service.calcularSaldos(EMPRESA);

      // El fixture tiene 9999 anulado: no debe aparecer.
      expect(saldos.get('caja')?.debe).toBe(1000);
    });
  });

  describe('roll-up del árbol', () => {
    it('acumula los hijos en el padre', async () => {
      const saldos = await service.calcularSaldos(EMPRESA);

      // 1.1.1.01 caja (700) + 1.1.1.02 banco (0) + 2.5.01 mal colgada (50)
      expect(saldos.get('c11')?.neto).toBe(750);
      expect(saldos.get('c1')?.neto).toBe(750);
    });

    it('usa el parentesco, no el prefijo del código', async () => {
      const saldos = await service.calcularSaldos(EMPRESA);

      // Si se agregara por LIKE '2.%', la cuenta "2.5.01" terminaría dentro del
      // Pasivo y descuadraría el balance general.
      expect(saldos.get('c2')?.neto).toBe(-400);
      expect(saldos.get('c2')?.debe).toBe(0);
    });

    it('reparte el saldo a deudor o acreedor según el signo', async () => {
      const saldos = await service.calcularSaldos(EMPRESA);

      expect(saldos.get('caja')).toMatchObject({ saldoDeudor: 700, saldoAcreedor: 0 });
      expect(saldos.get('prov')).toMatchObject({ saldoDeudor: 0, saldoAcreedor: 400 });
    });
  });

  describe('período', () => {
    it('solo cuenta los movimientos dentro del rango', async () => {
      const saldos = await service.calcularSaldos(EMPRESA, {
        fechaDesde: '2026-02-01',
        fechaHasta: '2026-02-28',
      });

      // Febrero: caja -300 y alquiler +600.
      expect(saldos.get('caja')?.neto).toBe(-300);
      expect(saldos.get('alquiler')?.neto).toBe(600);
    });

    it('es inclusivo en ambos extremos del rango', async () => {
      const saldos = await service.calcularSaldos(EMPRESA, {
        fechaDesde: '2026-01-10',
        fechaHasta: '2026-01-10',
      });

      // Solo el movimiento del día 10: caja +1000.
      expect(saldos.get('caja')?.neto).toBe(1000);
      expect(saldos.get('ventas')?.neto).toBe(0);
    });
  });

  describe('obtenerPlanConSaldos', () => {
    it('devuelve el plan completo aunque las cuentas no tengan movimiento', async () => {
      const plan = await service.obtenerPlanConSaldos(EMPRESA);

      const banco = plan.find((c) => c.id === 'banco');
      expect(banco).toBeDefined();
      expect(banco?.neto).toBe(0);
    });

    it('etiqueta la clase contable a partir del código', async () => {
      const plan = await service.obtenerPlanConSaldos(EMPRESA);

      expect(plan.find((c) => c.id === 'caja')?.clase).toBe('1');
      expect(plan.find((c) => c.id === 'ventas')?.clase).toBe('4');
    });
  });

  describe('idsConDescendientes', () => {
    it('devuelve la cuenta pedida y toda su rama', async () => {
      const ids = await service.idsConDescendientes(EMPRESA, 'c11');

      expect([...ids].sort()).toEqual(['c11', 'banco', 'caja', 'rara'].sort());
      expect(ids).toHaveLength(4);
    });

    it('una hoja devuelve solo a sí misma', async () => {
      const ids = await service.idsConDescendientes(EMPRESA, 'caja');

      expect(ids).toEqual(['caja']);
    });
  });
});
