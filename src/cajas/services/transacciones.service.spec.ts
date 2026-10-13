import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { TransaccionesService } from './transacciones.service.js';
import { MovimientosFinancierosService } from './movimientos-financieros.service.js';
import { CuentaFinanciera } from '../entities/cuenta-financiera.entity.js';

type MockManager = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const EMPRESA = 'empresa-uuid-1';

describe('TransaccionesService', () => {
  let service: TransaccionesService;
  let manager: MockManager;
  let dataSource: { transaction: ReturnType<typeof vi.fn>; getRepository: ReturnType<typeof vi.fn> };
  let asientosService: { crearAsiento: ReturnType<typeof vi.fn> };
  let planCuentasService: { obtenerCuentaPorId: ReturnType<typeof vi.fn> };
  let tipoCambioService: { obtenerTasaDelDia: ReturnType<typeof vi.fn> };
  let cuentasContablesVinculadas: number;
  let cuentas: Record<string, Partial<CuentaFinanciera>>;

  const cuentaContableTransaccional = {
    id: 'cc-caja',
    codigo: '1.1.1.01',
    esTransaccional: true,
  };

  beforeEach(() => {
    cuentas = {
      origen: {
        id: 'origen',
        nombre: 'Caja Chica',
        activo: true,
        moneda: 'BOB',
        saldo: '200.00',
        cuentaContableId: 'cc-caja',
      },
      destino: {
        id: 'destino',
        nombre: 'Banco Union',
        activo: true,
        moneda: 'BOB',
        saldo: '50.00',
        cuentaContableId: 'cc-banco',
      },
    };

    manager = {
      findOne: vi.fn((_, opciones) =>
        Promise.resolve(cuentas[opciones.where.id] ? { ...cuentas[opciones.where.id] } : null),
      ),
      create: vi.fn((_, datos) => datos),
      save: vi.fn((entidad) => Promise.resolve({ id: 'tx-1', ...entidad })),
      update: vi.fn(),
    };

    dataSource = {
      transaction: vi.fn(async (callback) => callback(manager)),
      getRepository: vi.fn(() => ({
        count: vi.fn(async () => cuentasContablesVinculadas),
      })),
    };
    cuentasContablesVinculadas = 0;

    asientosService = {
      crearAsiento: vi.fn().mockResolvedValue({ id: 'asiento-1' }),
    };

    planCuentasService = {
      obtenerCuentaPorId: vi.fn().mockResolvedValue(cuentaContableTransaccional),
    };

    tipoCambioService = {
      obtenerTasaDelDia: vi.fn().mockResolvedValue({ id: 'tc-1', tasa: '11.8500' }),
    };

    // La lógica de saldo/conversión vive en el servicio compartido (sin mock:
    // se ejercita de verdad sobre el manager simulado).
    const movimientosFinancieros = new MovimientosFinancierosService(
      {} as never,
      tipoCambioService as never,
    );

    service = new TransaccionesService(
      {} as never,
      dataSource as never,
      asientosService as never,
      planCuentasService as never,
      movimientosFinancieros as never,
    );
  });

  describe('registrarIngreso', () => {
    it('suma el saldo y genera un asiento equilibrado', async () => {
      const dto = {
        cuentaFinancieraId: 'origen',
        monto: 150.5,
        cuentaContableId: 'cc-ingreso',
        descripcion: 'Venta de contado',
      };

      const transaccion = await service.registrarIngreso(EMPRESA, dto);

      expect(transaccion.tipo).toBe('INGRESO');
      expect(manager.update).toHaveBeenCalledWith(
        CuentaFinanciera,
        'origen',
        { saldo: '350.50' },
      );

      const asiento = asientosService.crearAsiento.mock.calls[0][1];
      const totalDebe = asiento.detalles.reduce((s: number, d: { debe: number }) => s + d.debe, 0);
      const totalHaber = asiento.detalles.reduce((s: number, d: { haber: number }) => s + d.haber, 0);
      expect(totalDebe).toBe(totalHaber);
      expect(asiento.detalles[0]).toMatchObject({ cuentaId: 'cc-caja', debe: 150.5, haber: 0 });
      expect(asiento.detalles[1]).toMatchObject({ cuentaId: 'cc-ingreso', debe: 0, haber: 150.5 });
    });

    it('rechaza si la cuenta contable contra no es transaccional', async () => {
      planCuentasService.obtenerCuentaPorId.mockResolvedValue({
        id: 'cc-gasto',
        codigo: '5.1',
        esTransaccional: false,
      });

      await expect(
        service.registrarIngreso(EMPRESA, {
          cuentaFinancieraId: 'origen',
          monto: 10,
          cuentaContableId: 'cc-gasto',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rechaza el ingreso si la cuenta contra está vinculada a una caja', async () => {
      cuentasContablesVinculadas = 1;

      await expect(
        service.registrarIngreso(EMPRESA, {
          cuentaFinancieraId: 'origen',
          monto: 10,
          cuentaContableId: 'cc-caja-otra',
        }),
      ).rejects.toThrow('vinculada a una caja');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('registrarEgreso', () => {
    it('resta el saldo y genera el asiento invertido', async () => {
      const transaccion = await service.registrarEgreso(EMPRESA, {
        cuentaFinancieraId: 'origen',
        monto: 50,
        cuentaContableId: 'cc-gasto',
        descripcion: 'Pago de alquiler',
      });

      expect(transaccion.tipo).toBe('EGRESO');
      expect(manager.update).toHaveBeenCalledWith(
        CuentaFinanciera,
        'origen',
        { saldo: '150.00' },
      );

      const asiento = asientosService.crearAsiento.mock.calls[0][1];
      expect(asiento.detalles[0]).toMatchObject({ cuentaId: 'cc-gasto', debe: 50, haber: 0 });
      expect(asiento.detalles[1]).toMatchObject({ cuentaId: 'cc-caja', debe: 0, haber: 50 });
    });

    it('rechaza el egreso cuando el saldo es insuficiente', async () => {
      await expect(
        service.registrarEgreso(EMPRESA, {
          cuentaFinancieraId: 'origen',
          monto: 5000,
          cuentaContableId: 'cc-gasto',
        }),
      ).rejects.toThrow('Saldo insuficiente');
      expect(asientosService.crearAsiento).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rechaza el egreso si la cuenta contra está vinculada a una caja', async () => {
      cuentasContablesVinculadas = 1;

      await expect(
        service.registrarEgreso(EMPRESA, {
          cuentaFinancieraId: 'origen',
          monto: 10,
          cuentaContableId: 'cc-caja-otra',
        }),
      ).rejects.toThrow('vinculada a una caja');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rechaza el egreso si la cuenta financiera está inactiva', async () => {
      cuentas.origen.activo = false;

      await expect(
        service.registrarEgreso(EMPRESA, {
          cuentaFinancieraId: 'origen',
          monto: 10,
          cuentaContableId: 'cc-gasto',
        }),
      ).rejects.toThrow('inactiva');
    });
  });

  describe('realizarTransferencia', () => {
    it('rechaza transferir a la misma cuenta', async () => {
      await expect(
        service.realizarTransferencia(EMPRESA, {
          cuentaOrigenId: 'origen',
          cuentaDestinoId: 'origen',
          monto: 10,
        }),
      ).rejects.toThrow('no pueden ser la misma');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('resta en el origen, suma en el destino y genera asiento equilibrado', async () => {
      const transaccion = await service.realizarTransferencia(EMPRESA, {
        cuentaOrigenId: 'origen',
        cuentaDestinoId: 'destino',
        monto: 100,
        descripcion: 'Fondeo de caja',
      });

      expect(transaccion.tipo).toBe('TRANSFERENCIA');
      expect(transaccion.cuentaDestinoId).toBe('destino');

      expect(manager.update).toHaveBeenCalledWith(CuentaFinanciera, 'origen', { saldo: '100.00' });
      expect(manager.update).toHaveBeenCalledWith(CuentaFinanciera, 'destino', { saldo: '150.00' });

      const asiento = asientosService.crearAsiento.mock.calls[0][1];
      // Debe = destino, Haber = origen
      expect(asiento.detalles[0]).toMatchObject({ cuentaId: 'cc-banco', debe: 100, haber: 0 });
      expect(asiento.detalles[1]).toMatchObject({ cuentaId: 'cc-caja', debe: 0, haber: 100 });
    });

    it('rechaza la transferencia si el origen no tiene saldo suficiente', async () => {
      await expect(
        service.realizarTransferencia(EMPRESA, {
          cuentaOrigenId: 'origen',
          cuentaDestinoId: 'destino',
          monto: 9999,
        }),
      ).rejects.toThrow('Saldo insuficiente');
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('moneda y tipo de cambio', () => {
    it('los movimientos en BOB no consultan el tipo de cambio', async () => {
      const transaccion = await service.registrarIngreso(EMPRESA, {
        cuentaFinancieraId: 'origen',
        monto: 150.5,
        cuentaContableId: 'cc-ingreso',
      });

      expect(tipoCambioService.obtenerTasaDelDia).not.toHaveBeenCalled();
      expect(transaccion.tasaAplicada).toBe('1.0000');
      expect(transaccion.tipoCambioId).toBeNull();
    });

    it('un ingreso en USD convierte el asiento a BOB con la tasa del día', async () => {
      cuentas.origen.moneda = 'USD';

      const transaccion = await service.registrarIngreso(EMPRESA, {
        cuentaFinancieraId: 'origen',
        monto: 10,
        cuentaContableId: 'cc-ingreso',
      });

      expect(tipoCambioService.obtenerTasaDelDia).toHaveBeenCalledTimes(1);
      expect(transaccion.monto).toBe('10.00');
      expect(transaccion.montoEnMonedaBase).toBe('118.50');
      expect(transaccion.tasaAplicada).toBe('11.8500');
      expect(transaccion.tipoCambioId).toBe('tc-1');
      // el saldo de la cuenta sigue en su propia moneda (USD)
      expect(manager.update).toHaveBeenCalledWith(CuentaFinanciera, 'origen', { saldo: '210.00' });

      const asiento = asientosService.crearAsiento.mock.calls[0][1];
      expect(asiento.detalles[0]).toMatchObject({ cuentaId: 'cc-caja', debe: 118.5, haber: 0 });
      expect(asiento.detalles[1]).toMatchObject({ cuentaId: 'cc-ingreso', debe: 0, haber: 118.5 });
    });

    it('un egreso en USD convierte el asiento a BOB con la tasa del día', async () => {
      cuentas.origen.moneda = 'USD';

      const transaccion = await service.registrarEgreso(EMPRESA, {
        cuentaFinancieraId: 'origen',
        monto: 5,
        cuentaContableId: 'cc-gasto',
      });

      expect(transaccion.montoEnMonedaBase).toBe('59.25');
      expect(transaccion.tasaAplicada).toBe('11.8500');
      expect(transaccion.tipoCambioId).toBe('tc-1');
      expect(manager.update).toHaveBeenCalledWith(CuentaFinanciera, 'origen', { saldo: '195.00' });

      const asiento = asientosService.crearAsiento.mock.calls[0][1];
      expect(asiento.detalles[0]).toMatchObject({ cuentaId: 'cc-gasto', debe: 59.25, haber: 0 });
      expect(asiento.detalles[1]).toMatchObject({ cuentaId: 'cc-caja', debe: 0, haber: 59.25 });
    });

    it('rechaza transferencias entre cuentas de distinta moneda', async () => {
      cuentas.destino.moneda = 'USD';

      await expect(
        service.realizarTransferencia(EMPRESA, {
          cuentaOrigenId: 'origen',
          cuentaDestinoId: 'destino',
          monto: 10,
        }),
      ).rejects.toThrow('misma moneda');
      expect(asientosService.crearAsiento).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('una transferencia en USD usa la tasa para el asiento', async () => {
      cuentas.origen.moneda = 'USD';
      cuentas.destino.moneda = 'USD';

      const transaccion = await service.realizarTransferencia(EMPRESA, {
        cuentaOrigenId: 'origen',
        cuentaDestinoId: 'destino',
        monto: 2,
      });

      expect(transaccion.montoEnMonedaBase).toBe('23.70');
      expect(transaccion.tasaAplicada).toBe('11.8500');
      expect(transaccion.tipoCambioId).toBe('tc-1');
      const asiento = asientosService.crearAsiento.mock.calls[0][1];
      expect(asiento.detalles[0]).toMatchObject({ cuentaId: 'cc-banco', debe: 23.7, haber: 0 });
      expect(asiento.detalles[1]).toMatchObject({ cuentaId: 'cc-caja', debe: 0, haber: 23.7 });
    });
  });

  describe('bloquearCuenta', () => {
    it('lanza NotFound si la cuenta financiera no existe', async () => {
      await expect(
        service.registrarIngreso(EMPRESA, {
          cuentaFinancieraId: 'fantasma',
          monto: 10,
          cuentaContableId: 'cc-ingreso',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
