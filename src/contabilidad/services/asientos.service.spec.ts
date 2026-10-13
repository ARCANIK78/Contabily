import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AsientosService } from './asientos.service.js';
import { EstadoAsiento } from '../entities/asiento-contable.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';
import type { CrearAsientoManualDto } from '../dto/asiento.dto.js';

const EMPRESA = 'empresa-1';
const USUARIO = 'usuario-1';

describe('AsientosService', () => {
  let service: AsientosService;
  let manager: {
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let asientosRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let guardado: Record<string, any> | null;
  let reservaCorrelativoExecute: ReturnType<typeof vi.fn>;

  /** Cuentas disponibles para el negocio en las pruebas. */
  const planDeLaEmpresa = [
    { id: 'cc-caja', codigo: '1.1.1.01', esTransaccional: true },
    { id: 'cc-ventas', codigo: '4.1.01', esTransaccional: true },
    { id: 'cc-grupo', codigo: '1.1', esTransaccional: false },
  ];

  beforeEach(() => {
    guardado = null;
    // Correlativo que va quedando en el contador del tenant. Se reinicia en
    // cada prueba para poder asertar el primer número.
    let contador = 0;

    // Cadena completa del QueryBuilder de actualización que reserva el
    // correlativo: createQueryBuilder().update().set().where().returning().
    const reservaCorrelativo = {
      update: vi.fn(() => reservaCorrelativo),
      set: vi.fn(() => reservaCorrelativo),
      where: vi.fn(() => reservaCorrelativo),
      returning: vi.fn(() => reservaCorrelativo),
      execute: vi.fn(async () => {
        contador += 1;
        return { raw: [{ secuencia_asientos: contador }] };
      }),
    };

    manager = {
      find: vi.fn(async (_clase, opciones) => {
        const ids: string[] = opciones.where.id.value ?? opciones.where.id;
        return planDeLaEmpresa.filter((c) => ids.includes(c.id));
      }),
      create: vi.fn((_clase, datos) => datos),
      save: vi.fn(async (entidad) => {
        guardado = { id: 'asiento-1', ...entidad };
        return guardado;
      }),
      getRepository: vi.fn(() => ({
        createQueryBuilder: vi.fn(() => reservaCorrelativo),
      })),
    };

    reservaCorrelativoExecute = reservaCorrelativo.execute;

    asientosRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (entidad: Record<string, any>) => ({ id: 'asiento-1', ...entidad })),
      createQueryBuilder: vi.fn(),
    };

    dataSource = {
      transaction: vi.fn(async (callback) => callback(manager)),
    };

    service = new AsientosService(asientosRepo as never, dataSource as never);
  });

  const detallesValidos = () => [
    { cuentaId: 'cc-caja', debe: 1500, haber: 0 },
    { cuentaId: 'cc-ventas', debe: 0, haber: 1500 },
  ];

  describe('crearAsiento', () => {
    it('asigna el correlativo reservado del contador del negocio', async () => {
      const asiento = await service.crearAsiento(manager as never, {
        empresaId: EMPRESA,
        glosa: 'Venta de contado',
        detalles: detallesValidos(),
      });

      expect(asiento.numero).toBe(1);
      expect(asiento.estado).toBe(EstadoAsiento.CONFIRMADO);
    });

    it('deja el registro CONFIRMADO y con el autor cuando lo hay', async () => {
      const asiento = await service.crearAsiento(manager as never, {
        empresaId: EMPRESA,
        usuarioId: USUARIO,
        glosa: 'Ajuste',
        detalles: detallesValidos(),
      });

      expect(asiento.estado).toBe(EstadoAsiento.CONFIRMADO);
      expect(asiento.usuarioId).toBe(USUARIO);
    });

    it('RECHAZA un asiento que no cuadra entre debe y haber', async () => {
      await expect(
        service.crearAsiento(manager as never, {
          empresaId: EMPRESA,
          glosa: 'Descuadrado',
          detalles: [
            { cuentaId: 'cc-caja', debe: 1500, haber: 0 },
            { cuentaId: 'cc-ventas', debe: 0, haber: 1000 },
          ],
        }),
      ).rejects.toThrow(/no cuadra/i);
    });

    it('RECHAZA un asiento con monto total en cero', async () => {
      await expect(
        service.crearAsiento(manager as never, {
          empresaId: EMPRESA,
          glosa: 'Vacío',
          detalles: [
            { cuentaId: 'cc-caja', debe: 0, haber: 0 },
            { cuentaId: 'cc-ventas', debe: 0, haber: 0 },
          ],
        }),
      ).rejects.toThrow(/monto mayor a 0/i);
    });

    it('RECHAZA un asiento sin ninguna línea', async () => {
      await expect(
        service.crearAsiento(manager as never, {
          empresaId: EMPRESA,
          glosa: 'Sin líneas',
          detalles: [],
        }),
      ).rejects.toThrow(/al menos un detalle/i);
    });

    it('RECHAZA cuentas que no pertenezcan al negocio activo', async () => {
      await expect(
        service.crearAsiento(manager as never, {
          empresaId: EMPRESA,
          glosa: 'Intento de hurgar saldos ajenos',
          detalles: [
            { cuentaId: 'cc-de-otra-empresa', debe: 100, haber: 0 },
            { cuentaId: 'cc-ventas', debe: 0, haber: 100 },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('RECHAZA cuentas agrupadoras para no duplicar el roll-up del balance', async () => {
      await expect(
        service.crearAsiento(manager as never, {
          empresaId: EMPRESA,
          glosa: 'Escribiendo en un padre',
          detalles: [
            { cuentaId: 'cc-grupo', debe: 100, haber: 0 },
            { cuentaId: 'cc-ventas', debe: 0, haber: 100 },
          ],
        }),
      ).rejects.toThrow(/agrupadoras/i);
    });
  });

  describe('anularAsiento', () => {
    const asientoConfirmado = {
      id: 'asiento-9',
      empresaId: EMPRESA,
      numero: 9,
      estado: EstadoAsiento.CONFIRMADO,
    };

    it('anula en lógico: marca el estado sin borrar nada', async () => {
      asientosRepo.findOne.mockResolvedValue({ ...asientoConfirmado });

      const anulado = await service.anularAsiento(EMPRESA, 'asiento-9');

      expect(anulado.estado).toBe(EstadoAsiento.ANULADO);
      expect(asientosRepo.save).toHaveBeenCalled();
      expect(asientosRepo.findOne).toHaveBeenCalled();
    });

    it('RECHAZA anular dos veces el mismo asiento', async () => {
      asientosRepo.findOne.mockResolvedValue({
        ...asientoConfirmado,
        estado: EstadoAsiento.ANULADO,
      });

      await expect(service.anularAsiento(EMPRESA, 'asiento-9')).rejects.toThrow(
        ConflictException,
      );
    });

    it('no deja anular un asiento de otro negocio', async () => {
      asientosRepo.findOne.mockResolvedValue(null);

      await expect(service.anularAsiento(EMPRESA, 'asiento-ajeno')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('crearAsientoManual', () => {
    it('abre su propia transacción y convierte la fecha a medianoche', async () => {
      const dto: CrearAsientoManualDto = {
        fecha: '2026-03-15',
        glosa: 'Depreciación de mobiliario',
        detalles: detallesValidos(),
      };

      await service.crearAsientoManual(EMPRESA, USUARIO, dto);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const asiento = manager.create.mock.calls.find(
        (llamada) => llamada[0].name === 'AsientoContable',
      )?.[1];

      expect(asiento.glosa).toBe('Depreciación de mobiliario');
      expect(asiento.usuarioId).toBe(USUARIO);
      // Medianoche UTC: si llevara hora, dos asientos del mismo día se
      // ordenarían por instante y el libro diario quedaría desordenado.
      expect(asiento.fecha.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('propaga el error de partida doble y no deja el asiento a medias', async () => {
      await expect(
        service.crearAsientoManual(EMPRESA, USUARIO, {
          glosa: 'Descuadrado',
          detalles: [
            { cuentaId: 'cc-caja', debe: 100, haber: 0 },
            { cuentaId: 'cc-ventas', debe: 0, haber: 50 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(asientosRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('aislamiento multi-tenant', () => {
    it('el correlativo se reserva con un UPDATE que bloquea la fila del negocio', async () => {
      await service.crearAsiento(manager as never, {
        empresaId: EMPRESA,
        glosa: 'Venta',
        detalles: detallesValidos(),
      });

      // Sin bloqueo de fila, dos asientos simultáneos leerían el mismo MAX y
      // duplicarían el número.
      expect(reservaCorrelativoExecute).toHaveBeenCalledTimes(1);
    });

    it('la reserva de correlativo se hace sobre la entidad Empresa', async () => {
      await service.crearAsiento(manager as never, {
        empresaId: EMPRESA,
        glosa: 'Venta',
        detalles: detallesValidos(),
      });

      expect(manager.getRepository).toHaveBeenCalledWith(Empresa);
    });
  });
});
