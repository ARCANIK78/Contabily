import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { BalancesService } from './balances.service.js';
import type { CuentaConSaldo } from './saldos.service.js';

/**
 * Plan de prueba con los números cuadrados a mano para poder asertar la
 * ecuación contable sin depender de redondeos accidentales.
 */
function cuenta(
  parcial: Partial<CuentaConSaldo> & Pick<CuentaConSaldo, 'id' | 'codigo' | 'nombre'>,
): CuentaConSaldo {
  const debe = parcial.debe ?? 0;
  const haber = parcial.haber ?? 0;
  const neto = parcial.neto ?? debe - haber;
  return {
    cuentaPadreId: null,
    esTransaccional: false,
    clase: parcial.codigo.split('.')[0] ?? parcial.codigo,
    debe,
    haber,
    neto,
    saldoDeudor: neto > 0 ? neto : 0,
    saldoAcreedor: neto < 0 ? -neto : 0,
    ...parcial,
  };
}

describe('BalancesService', () => {
  let service: BalancesService;
  let plan: CuentaConSaldo[];
  let saldosService: {
    obtenerPlanConSaldos: ReturnType<typeof vi.fn>;
    calcularSaldos: ReturnType<typeof vi.fn>;
    idsConDescendientes: ReturnType<typeof vi.fn>;
  };
  let planRepo: { findOne: ReturnType<typeof vi.fn> };
  let asientosRepo: { createQueryBuilder: ReturnType<typeof vi.fn> };
  let movimientosLibro: Array<Record<string, unknown>>;

  beforeEach(() => {
    movimientosLibro = [];
    // Ecuación que cuadra:  Activo 1200 = Pasivo 300 + Patrimonio 500 + Resultado 400
    plan = [
      // Activo
      cuenta({ id: 'c1', codigo: '1', nombre: 'Activo' }),
      cuenta({ id: 'c11', codigo: '1.1', nombre: 'Disponible', cuentaPadreId: 'c1' }),
      cuenta({ id: 'c111', codigo: '1.1.1', nombre: 'Caja y Bancos', cuentaPadreId: 'c11' }),
      cuenta({ id: 'caja', codigo: '1.1.1.01', nombre: 'Caja General', cuentaPadreId: 'c111', esTransaccional: true, debe: 1200 }),
      // Pasivo
      cuenta({ id: 'c2', codigo: '2', nombre: 'Pasivo' }),
      cuenta({ id: 'c21', codigo: '2.1', nombre: 'Pasivo Corriente', cuentaPadreId: 'c2' }),
      cuenta({ id: 'c211', codigo: '2.1.1', nombre: 'Proveedores', cuentaPadreId: 'c21' }),
      cuenta({ id: 'prov', codigo: '2.1.1.01', nombre: 'Proveedores nacionales', cuentaPadreId: 'c211', esTransaccional: true, haber: 300 }),
      // Patrimonio
      cuenta({ id: 'c3', codigo: '3', nombre: 'Patrimonio' }),
      cuenta({ id: 'c31', codigo: '3.1', nombre: 'Capital', cuentaPadreId: 'c3' }),
      cuenta({ id: 'capital', codigo: '3.1.01', nombre: 'Capital', cuentaPadreId: 'c31', esTransaccional: true, haber: 500 }),
      // Ingresos
      cuenta({ id: 'c4', codigo: '4', nombre: 'Ingresos' }),
      cuenta({ id: 'c41', codigo: '4.1', nombre: 'Ingresos Operativos', cuentaPadreId: 'c4' }),
      cuenta({ id: 'ventas', codigo: '4.1.01', nombre: 'Ingresos por Ventas', cuentaPadreId: 'c41', esTransaccional: true, haber: 1000 }),
      // Gastos
      cuenta({ id: 'c5', codigo: '5', nombre: 'Gastos' }),
      cuenta({ id: 'c51', codigo: '5.1', nombre: 'Gastos de Administración', cuentaPadreId: 'c5' }),
      cuenta({ id: 'alquiler', codigo: '5.1.01', nombre: 'Alquileres', cuentaPadreId: 'c51', esTransaccional: true, debe: 400 }),
      cuenta({ id: 'servicios', codigo: '5.1.02', nombre: 'Servicios Básicos', cuentaPadreId: 'c51', esTransaccional: true, debe: 200 }),
      // Costos
      cuenta({ id: 'c6', codigo: '6', nombre: 'Costos' }),
      cuenta({ id: 'c61', codigo: '6.1', nombre: 'Costo de Ventas', cuentaPadreId: 'c6' }),
      cuenta({ id: 'cmv', codigo: '6.1.01', nombre: 'Costo de Mercadería Vendida', cuentaPadreId: 'c61', esTransaccional: true, debe: 0 }),
    ];

    saldosService = {
      obtenerPlanConSaldos: vi.fn(async () => plan),
      calcularSaldos: vi.fn(async () => new Map()),
      idsConDescendientes: vi.fn(async (_empresa: string, id: string) => [id]),
    };
    planRepo = {
      findOne: vi.fn(async ({ where }: any) =>
        plan.find((c) => c.id === where.id) ?? null,
      ),
    };

    // Cadena del QueryBuilder del libro mayor. Devuelve los movimientos que se
    // carguen en `movimientosLibro` para poder asertar el saldo corrido.
    const crearQueryBuilderMovimientos = () => {
      const builder: any = {
        innerJoin: () => builder,
        select: () => builder,
        addSelect: () => builder,
        where: () => builder,
        andWhere: () => builder,
        groupBy: () => builder,
        addGroupBy: () => builder,
        orderBy: () => builder,
        addOrderBy: () => builder,
        getRawMany: async () => movimientosLibro,
      };
      return builder;
    };
    asientosRepo = { createQueryBuilder: vi.fn(() => crearQueryBuilderMovimientos()) };

    service = new BalancesService(
      saldosService as never,
      planRepo as never,
      asientosRepo as never,
    );
  });

  describe('balanceGeneral', () => {
    it('cumple la ecuación contable activo = pasivo + patrimonio + resultados', async () => {
      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      expect(balance.verifica).toBe(true);
      expect(balance.activoTotal).toBe(1200);
      expect(balance.pasivoPatrimonioTotal).toBe(1200);
    });

    it('reparte cada clase en su lado de la ecuación', async () => {
      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      expect(balance.activo.total).toBe(1200);
      expect(balance.pasivo.total).toBe(300);
      expect(balance.patrimonio.total).toBe(500);
      expect(balance.resultadosDelEjercicio).toBe(400);
    });

    it('agrupa las cuentas por su nivel superior para plegar en el frontend', async () => {
      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      const grupo = balance.activo.grupos[0];
      expect(grupo.codigo).toBe('1.1.1');
      expect(grupo.nombre).toBe('Caja y Bancos');
      expect(grupo.cuentas).toHaveLength(1);
    });

    it('mete una sub-cuenta más profunda en el grupo de su ancestro inmediato', async () => {
      plan.push(
        cuenta({
          id: 'serv',
          codigo: '1.1.1.01.99',
          nombre: 'Caja - turno noche',
          cuentaPadreId: 'caja',
          esTransaccional: true,
          debe: 100,
        }),
      );

      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      // 1.1.1.01 se muestra dentro de su subgrupo 1.1.1; la hoja más profunda
      // 1.1.1.01.99 queda en su propio nivel, 1.1.1.01.
      const subgrupo = balance.activo.grupos.find((g) => g.codigo === '1.1.1');
      expect(subgrupo?.cuentas.map((c) => c.codigo)).toEqual(['1.1.1.01']);

      const hojaProfunda = balance.activo.grupos.find((g) => g.codigo === '1.1.1.01');
      expect(hojaProfunda?.cuentas.map((c) => c.codigo)).toEqual(['1.1.1.01.99']);

      expect(balance.activoTotal).toBe(1300);
    });

    it('marca la ecuación como NO verificada si los números no cuadran', async () => {
      plan.push(cuenta({ id: 'robo', codigo: '1.2.1.01', nombre: 'Sobrante', esTransaccional: true, debe: 777 }));

      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      expect(balance.verifica).toBe(false);
    });

    it('devuelve pérdida cuando los gastos superan a los ingresos', async () => {
      // Escenario coherente de pérdida: el activo ya salió reducido.
      //   Activo 300 = Pasivo 300 + Patrimonio 500 + Resultados (-500)
      plan = plan
        .map((c) => (c.id === 'caja' ? { ...c, debe: 300, neto: 300, saldoDeudor: 300 } : c))
        .filter((c) => c.clase !== '4')
        .concat(
          cuenta({
            id: 'ingresoBajo',
            codigo: '4.1.01',
            nombre: 'Ingresos por Ventas',
            cuentaPadreId: 'c41',
            esTransaccional: true,
            haber: 100,
          }),
        );

      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      // 100 de ingresos - 600 de gastos = -500
      expect(balance.resultadosDelEjercicio).toBe(-500);
      expect(balance.activoTotal).toBe(300);
      expect(balance.pasivoPatrimonioTotal).toBe(300);
      expect(balance.verifica).toBe(true);
    });

    it('deja otrasCuentas vacío cuando el plan usa solo las clases estándar', async () => {
      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      expect(balance.otrasCuentas.total).toBe(0);
      expect(balance.otrasCuentas.cuentas).toHaveLength(0);
    });

    it('saca a la luz una cuenta de clase fuera del 1-6 en vez de perderla', async () => {
      // crearCuenta no impide crear una clase nueva; sin esta sección su saldo
      // desaparecería del balance y la ecuación no cuadraría sin saber por qué.
      plan.push(
        cuenta({
          id: 'crypto',
          codigo: '7.1.01',
          nombre: 'Criptoactivos',
          esTransaccional: true,
          debe: 250,
        }),
      );

      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      expect(balance.otrasCuentas.cuentas).toEqual([
        { codigo: '7.1.01', nombre: 'Criptoactivos', saldo: 250 },
      ]);
      expect(balance.otrasCuentas.total).toBe(250);
    });

    it('suma otrasCuentas en la verificación para que la ecuación siga cerrando', async () => {
      // Activo 1450 = Pasivo 300 + Patrimonio 500 + Resultado 400 + Otras 250
      plan.push(
        cuenta({ id: 'crypto', codigo: '7.1.01', nombre: 'Criptoactivos', esTransaccional: true, debe: 250 }),
        cuenta({ id: 'activoExtra', codigo: '1.2.1.01', nombre: 'Mobiliario', esTransaccional: true, debe: 250 }),
      );

      const balance = await service.balanceGeneral('empresa-1', '2026-12-31');

      expect(balance.otrasCuentas.total).toBe(250);
      expect(balance.activoTotal).toBe(1450);
      expect(balance.pasivoPatrimonioTotal).toBe(1450);
      expect(balance.verifica).toBe(true);
    });
  });

  describe('estadoResultados', () => {
    it('calcula ingresos menos costos menos gastos', async () => {
      const resultados = await service.estadoResultados('empresa-1', {});

      expect(resultados.ingresos.total).toBe(1000);
      expect(resultados.gastos.total).toBe(600);
      expect(resultados.costos.total).toBe(0);
      expect(resultados.utilidad).toBe(400);
      expect(resultados.perdida).toBe(0);
    });

    it('desglosa los gastos agrupados por su nivel superior', async () => {
      const resultados = await service.estadoResultados('empresa-1', {});

      // 5.1.01 y 5.1.02 caen ambos en el grupo 5.1.
      const grupo = resultados.gastos.grupos[0];
      expect(grupo.codigo).toBe('5.1');
      expect(grupo.cuentas).toHaveLength(2);
      expect(grupo.saldo).toBe(600);
    });

    it('llama a SaldosService con el mismo período que se pidió', async () => {
      await service.estadoResultados('empresa-1', { fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(saldosService.obtenerPlanConSaldos).toHaveBeenCalledWith('empresa-1', {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
      });
    });

    it('reporta pérdida en lugar de utilidad negativa', async () => {
      plan = plan
        .filter((c) => c.clase !== '4')
        .concat(cuenta({ id: 'ingresoBajo', codigo: '4.1.01', nombre: 'Ventas', esTransaccional: true, haber: 50 }));

      const resultados = await service.estadoResultados('empresa-1', {});

      expect(resultados.utilidad).toBe(0);
      expect(resultados.perdida).toBe(550);
    });
  });

  describe('libroMayor', () => {
    it('RECHAZA una cuenta que no pertenezca al negocio', async () => {
      planRepo.findOne.mockResolvedValue(null);

      await expect(service.libroMayor('empresa-1', 'cuenta-ajena', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devuelve la cuenta pedida con saldo inicial, movimientos y saldo final', async () => {
      const mayor = await service.libroMayor('empresa-1', 'caja', {});

      expect(mayor.cuenta).toEqual({ id: 'caja', codigo: '1.1.1.01', nombre: 'Caja General' });
      expect(mayor.saldoInicial).toBe(0);
      expect(mayor.saldoFinal).toBe(0);
      expect(mayor.totalMovimientos).toBe(0);
    });

    it('corre el saldo a lo largo de los movimientos del período', async () => {
      movimientosLibro = [
        { asientoId: 'a1', numero: 1, fecha: new Date('2026-01-05'), glosa: 'Ingreso', referencia: null, debe: '1000', haber: '0' },
        { asientoId: 'a2', numero: 2, fecha: new Date('2026-01-20'), glosa: 'Salida', referencia: null, debe: '0', haber: '300' },
      ];
      // El saldo anterior al período pedido: 200 ya estaban en caja.
      saldosService.calcularSaldos.mockResolvedValue(
        new Map([['caja', { debe: 200, haber: 0, neto: 200, saldoDeudor: 200, saldoAcreedor: 0 }]]),
      );

      const mayor = await service.libroMayor('empresa-1', 'caja', {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
      });

      expect(mayor.saldoInicial).toBe(200);
      expect(mayor.movimientos[0].saldoAcumulado).toBe(1200);
      expect(mayor.movimientos[1].saldoAcumulado).toBe(900);
      // El saldo final es el del período completo, no el de la última página.
      expect(mayor.saldoFinal).toBe(900);
      expect(mayor.totalMovimientos).toBe(2);
    });

    it('no duplica el saldo al consultar sin fechaDesde', async () => {
      // Regresión: sin fechaDesde se pedía el histórico completo como saldo
      // inicial, y ese dinero volvía a aparecer en los movimientos listados,
      // dejando el saldo final exactamente doble.
      movimientosLibro = [
        { asientoId: 'a1', numero: 1, fecha: new Date('2026-01-05'), glosa: 'Aporte', referencia: null, debe: '1000', haber: '0' },
      ];

      const mayor = await service.libroMayor('empresa-1', 'caja', {});

      // Sin fechaDesde el libro arranca desde el origen: no hay saldo inicial.
      expect(mayor.saldoInicial).toBe(0);
      expect(mayor.saldoFinal).toBe(1000);
      // Y el histórico no debe consultarse siquiera: solo aplica con fechaDesde.
      expect(saldosService.calcularSaldos).not.toHaveBeenCalled();
    });

    it('pagina los movimientos pero mantiene el saldo acumulado correcto', async () => {
      movimientosLibro = [
        { asientoId: 'a1', numero: 1, fecha: new Date('2026-01-05'), glosa: 'x', referencia: null, debe: '100', haber: '0' },
        { asientoId: 'a2', numero: 2, fecha: new Date('2026-01-06'), glosa: 'x', referencia: null, debe: '100', haber: '0' },
        { asientoId: 'a3', numero: 3, fecha: new Date('2026-01-07'), glosa: 'x', referencia: null, debe: '100', haber: '0' },
      ];

      const mayor = await service.libroMayor('empresa-1', 'caja', { pagina: 2, limite: 2 });

      expect(mayor.movimientos).toHaveLength(1);
      // Acumula desde el inicio, aunque solo se muestre la segunda página.
      expect(mayor.movimientos[0].saldoAcumulado).toBe(300);
      expect(mayor.totalMovimientos).toBe(3);
      expect(mayor.saldoFinal).toBe(300);
    });

    it('pide a SaldosService la rama completa cuando se incluyen subcuentas', async () => {
      await service.libroMayor('empresa-1', 'c111', { incluirSubcuentas: true });

      expect(saldosService.idsConDescendientes).toHaveBeenCalledWith('empresa-1', 'c111');
    });
  });

  describe('balanceComprobacion', () => {
    it('solo incluye las cuentas transaccionales para no duplicar', async () => {
      plan.push(cuenta({ id: 'padre', codigo: '1.1', nombre: 'Disponible', debe: 999 }));

      const balance = await service.balanceComprobacion('empresa-1', {});

      // El padre agregado no entra: sus hijos ya suman el mismo dinero.
      expect(balance.cuentas.some((c) => c.id === 'padre')).toBe(false);
    });

    it('reporta cuadra = true cuando debe y haber coinciden', async () => {
      const balance = await service.balanceComprobacion('empresa-1', {});

      expect(balance.totales.debe).toBe(balance.totales.haber);
      expect(balance.cuadra).toBe(true);
    });

    it('reporta cuadra = false cuando el libro está descuadrado', async () => {
      plan.push(cuenta({ id: 'sobrante', codigo: '1.2.1.01', nombre: 'Sobrante', esTransaccional: true, debe: 123 }));

      const balance = await service.balanceComprobacion('empresa-1', {});

      expect(balance.cuadra).toBe(false);
    });

    it('ordena las cuentas por código', async () => {
      const balance = await service.balanceComprobacion('empresa-1', {});

      const codigos = balance.cuentas.map((c) => c.codigo);
      expect(codigos).toEqual([...codigos].sort((a, b) => a.localeCompare(b)));
    });
  });
});
