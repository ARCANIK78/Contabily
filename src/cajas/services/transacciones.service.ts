import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  Transaccion,
  TipoTransaccion,
} from '../entities/transaccion.entity.js';
import { CuentaFinanciera } from '../entities/cuenta-financiera.entity.js';
import { AsientosService } from '../../contabilidad/services/asientos.service.js';
import { PlanCuentasService } from '../../contabilidad/services/plan-cuentas.service.js';
import { MovimientosFinancierosService } from './movimientos-financieros.service.js';
import {
  RegistrarMovimientoDto,
  TransferenciaDto,
} from '../dto/cajas.dto.js';

@Injectable()
export class TransaccionesService {
  constructor(
    @InjectRepository(Transaccion)
    private readonly transaccionesRepo: Repository<Transaccion>,
    private readonly dataSource: DataSource,
    private readonly asientosService: AsientosService,
    private readonly planCuentasService: PlanCuentasService,
    private readonly movimientosFinancieros: MovimientosFinancierosService,
  ) {}

  async registrarIngreso(empresaId: string, dto: RegistrarMovimientoDto): Promise<Transaccion> {
    await this.validarCuentaContableTransaccional(empresaId, dto.cuentaContableId);

    return this.dataSource.transaction(async (manager) => {
      const cuenta = await this.movimientosFinancieros.bloquearCuenta(manager, empresaId, dto.cuentaFinancieraId);
      const monto = this.movimientosFinancieros.redondear(dto.monto);
      const conversion = await this.movimientosFinancieros.calcularConversion(cuenta.moneda, monto);

      await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, monto);

      const transaccion = await manager.save(
        manager.create(Transaccion, {
          empresaId,
          cuentaFinancieraId: cuenta.id,
          tipo: TipoTransaccion.INGRESO,
          monto: monto.toFixed(2),
          montoEnMonedaBase: conversion.montoEnBase.toFixed(2),
          tasaAplicada: conversion.tasaAplicada,
          tipoCambioId: conversion.tipoCambioId,
          descripcion: dto.descripcion ?? null,
          referencia: dto.referencia ?? null,
          cuentaDestinoId: null,
        }),
      );

      await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: dto.descripcion ?? `Ingreso en ${cuenta.nombre}`,
        referencia: dto.referencia,
        detalles: [
          // Debe: la caja/banco (activo) aumenta — en moneda base (BOB)
          { cuentaId: cuenta.cuentaContableId, debe: conversion.montoEnBase, haber: 0 },
          // Haber: cuenta de ingreso (cuenta contra)
          { cuentaId: dto.cuentaContableId, debe: 0, haber: conversion.montoEnBase },
        ],
      });

      return transaccion;
    });
  }

  async registrarEgreso(empresaId: string, dto: RegistrarMovimientoDto): Promise<Transaccion> {
    await this.validarCuentaContableTransaccional(empresaId, dto.cuentaContableId);

    return this.dataSource.transaction(async (manager) => {
      const cuenta = await this.movimientosFinancieros.bloquearCuenta(manager, empresaId, dto.cuentaFinancieraId);
      const monto = this.movimientosFinancieros.redondear(dto.monto);

      if (this.movimientosFinancieros.redondear(Number(cuenta.saldo)) < monto) {
        throw new BadRequestException(
          `Saldo insuficiente en "${cuenta.nombre}": disponible ${Number(cuenta.saldo).toFixed(2)}, requerido ${monto.toFixed(2)}`,
        );
      }

      const conversion = await this.movimientosFinancieros.calcularConversion(cuenta.moneda, monto);

      await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, -monto);

      const transaccion = await manager.save(
        manager.create(Transaccion, {
          empresaId,
          cuentaFinancieraId: cuenta.id,
          tipo: TipoTransaccion.EGRESO,
          monto: monto.toFixed(2),
          montoEnMonedaBase: conversion.montoEnBase.toFixed(2),
          tasaAplicada: conversion.tasaAplicada,
          tipoCambioId: conversion.tipoCambioId,
          descripcion: dto.descripcion ?? null,
          referencia: dto.referencia ?? null,
          cuentaDestinoId: null,
        }),
      );

      await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: dto.descripcion ?? `Egreso en ${cuenta.nombre}`,
        referencia: dto.referencia,
        detalles: [
          // Debe: cuenta de gasto (cuenta contra) — en moneda base (BOB)
          { cuentaId: dto.cuentaContableId, debe: conversion.montoEnBase, haber: 0 },
          // Haber: la caja/banco (activo) disminuye
          { cuentaId: cuenta.cuentaContableId, debe: 0, haber: conversion.montoEnBase },
        ],
      });

      return transaccion;
    });
  }

  async realizarTransferencia(
    empresaId: string,
    dto: TransferenciaDto,
  ): Promise<Transaccion> {
    if (dto.cuentaOrigenId === dto.cuentaDestinoId) {
      throw new BadRequestException('La cuenta origen y destino no pueden ser la misma');
    }

    return this.dataSource.transaction(async (manager) => {
      // Bloqueo en orden de id para evitar interbloqueos
      const [primeraId, segundaId] = [dto.cuentaOrigenId, dto.cuentaDestinoId].sort();
      const primera = await this.movimientosFinancieros.bloquearCuenta(manager, empresaId, primeraId);
      const segunda = await this.movimientosFinancieros.bloquearCuenta(manager, empresaId, segundaId);

      const origen = primera.id === dto.cuentaOrigenId ? primera : segunda;
      const destino = primera.id === dto.cuentaDestinoId ? primera : segunda;
      const monto = this.movimientosFinancieros.redondear(dto.monto);

      if ((origen.moneda ?? 'BOB') !== (destino.moneda ?? 'BOB')) {
        throw new BadRequestException(
          'Las transferencias solo permiten cuentas de la misma moneda',
        );
      }

      if (this.movimientosFinancieros.redondear(Number(origen.saldo)) < monto) {
        throw new BadRequestException(
          `Saldo insuficiente en "${origen.nombre}": disponible ${Number(origen.saldo).toFixed(2)}, requerido ${monto.toFixed(2)}`,
        );
      }

      const conversion = await this.movimientosFinancieros.calcularConversion(origen.moneda, monto);

      await this.movimientosFinancieros.actualizarSaldo(manager, origen, -monto);
      await this.movimientosFinancieros.actualizarSaldo(manager, destino, monto);

      const transaccion = await manager.save(
        manager.create(Transaccion, {
          empresaId,
          cuentaFinancieraId: origen.id,
          tipo: TipoTransaccion.TRANSFERENCIA,
          monto: monto.toFixed(2),
          montoEnMonedaBase: conversion.montoEnBase.toFixed(2),
          tasaAplicada: conversion.tasaAplicada,
          tipoCambioId: conversion.tipoCambioId,
          descripcion: dto.descripcion ?? null,
          referencia: dto.referencia ?? null,
          cuentaDestinoId: destino.id,
        }),
      );

      await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: dto.descripcion ?? `Transferencia de ${origen.nombre} a ${destino.nombre}`,
        referencia: dto.referencia,
        detalles: [
          // Debe: cuenta contable del destino — en moneda base (BOB)
          { cuentaId: destino.cuentaContableId, debe: conversion.montoEnBase, haber: 0 },
          // Haber: cuenta contable del origen
          { cuentaId: origen.cuentaContableId, debe: 0, haber: conversion.montoEnBase },
        ],
      });

      return transaccion;
    });
  }

  async listarTransacciones(
    empresaId: string,
    filtros: { cuentaId?: string; tipo?: TipoTransaccion },
  ): Promise<Transaccion[]> {
    return this.transaccionesRepo.find({
      where: {
        empresaId,
        ...(filtros.cuentaId ? { cuentaFinancieraId: filtros.cuentaId } : {}),
        ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      },
      relations: { cuentaFinanciera: true, cuentaDestino: true },
      order: { fechaCreacion: 'DESC' },
      take: 100,
    });
  }

  private async validarCuentaContableTransaccional(
    empresaId: string,
    cuentaContableId: string,
  ): Promise<void> {
    const cuenta = await this.planCuentasService.obtenerCuentaPorId(empresaId, cuentaContableId);
    if (!cuenta.esTransaccional) {
      throw new BadRequestException(
        `La cuenta contable "${cuenta.codigo}" no es transaccional; usa una cuenta que acepte movimientos`,
      );
    }
    // La cuenta contra no puede ser la contable de una caja/banco: el asiento
    // descuadraría el libro diario frente a los saldos operativos (subledger).
    const vinculadas = await this.dataSource
      .getRepository(CuentaFinanciera)
      .count({ where: { cuentaContableId, empresaId } });
    if (vinculadas > 0) {
      throw new BadRequestException(
        `La cuenta contable "${cuenta.codigo}" está vinculada a una caja o banco; para mover dinero entre cajas usa una transferencia, y para registrar el movimiento usa una cuenta de resultado o patrimonio (ej: clase 4 o 5)`,
      );
    }
  }
}
