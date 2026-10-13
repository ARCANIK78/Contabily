import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { CuentaFinanciera } from '../entities/cuenta-financiera.entity.js';
import { TipoCambioService } from '../../tipo-cambio/services/tipo-cambio.service.js';

export interface ConversionMoneda {
  montoEnBase: number;
  tasaAplicada: string;
  tipoCambioId: string | null;
}

/**
 * Operaciones financieras compartidas sobre cajas/bancos: bloqueo de la fila,
 * movimiento de saldo y conversión a moneda base (BOB).
 *
 * Lo usan TransaccionesService (cajas) y el módulo de compras/gastos para que
 * todas las reglas de saldo vivan en un solo lugar.
 */
@Injectable()
export class MovimientosFinancierosService {
  constructor(
    @InjectRepository(CuentaFinanciera)
    private readonly cuentasRepo: Repository<CuentaFinanciera>,
    private readonly tipoCambioService: TipoCambioService,
  ) {}

  /**
   * Bloquea la fila (pessimistic_write) y valida que la cuenta pertenezca al
   * negocio activo. Sin la condición `empresaId`, un cliente podría mover
   * dinero de una caja ajena.
   */
  async bloquearCuenta(
    manager: EntityManager,
    empresaId: string,
    id: string,
  ): Promise<CuentaFinanciera> {
    const cuenta = await manager.findOne(CuentaFinanciera, {
      where: { id, empresaId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta financiera ${id} no encontrada`);
    }
    if (!cuenta.activo) {
      throw new BadRequestException(`La cuenta financiera "${cuenta.nombre}" está inactiva`);
    }
    return cuenta;
  }

  /** Suma (delta > 0) o resta (delta < 0) al saldo, redondeando a 2 decimales. */
  async actualizarSaldo(
    manager: EntityManager,
    cuenta: CuentaFinanciera,
    delta: number,
  ): Promise<void> {
    const nuevoSaldo = this.redondear(Number(cuenta.saldo) + delta);
    await manager.update(CuentaFinanciera, cuenta.id, { saldo: nuevoSaldo.toFixed(2) });
    cuenta.saldo = nuevoSaldo.toFixed(2);
  }

  /** Valida saldo suficiente y lanza un error claro si no alcanza. */
  validarSaldoSuficiente(cuenta: CuentaFinanciera, monto: number): void {
    if (this.redondear(Number(cuenta.saldo)) < monto) {
      throw new BadRequestException(
        `Saldo insuficiente en "${cuenta.nombre}": disponible ${Number(cuenta.saldo).toFixed(2)}, requerido ${monto.toFixed(2)}`,
      );
    }
  }

  /**
   * Convierte un monto a moneda base (BOB) usando la tasa del día.
   * Las cuentas en BOB no tocan la API: tasa 1.0000 y sin registro de tipo de cambio.
   */
  async calcularConversion(moneda: string | undefined, monto: number): Promise<ConversionMoneda> {
    if ((moneda ?? 'BOB') === 'BOB') {
      return { montoEnBase: monto, tasaAplicada: '1.0000', tipoCambioId: null };
    }
    const tipoCambio = await this.tipoCambioService.obtenerTasaDelDia();
    return {
      montoEnBase: this.redondear(monto * Number(tipoCambio.tasa)),
      tasaAplicada: tipoCambio.tasa,
      tipoCambioId: tipoCambio.id ?? null,
    };
  }

  /**
   * Convierte un monto entre monedas (solo soporta BOB/USD, que es lo que
   * aceptan los DTOs). Si las monedas coinciden no toca la tasa.
   */
  async convertir(
    monto: number,
    monedaOrigen: string,
    monedaDestino: string,
  ): Promise<{ monto: number; tasa: string; tipoCambioId: string | null }> {
    if ((monedaOrigen ?? 'BOB') === (monedaDestino ?? 'BOB')) {
      return { monto, tasa: '1.0000', tipoCambioId: null };
    }
    const tipoCambio = await this.tipoCambioService.obtenerTasaDelDia();
    const tasa = Number(tipoCambio.tasa);
    // La única tasa disponible es USD→BOB: se pasa por base BOB y se divide si el destino es USD.
    const enBase = monedaOrigen === 'USD' ? monto * tasa : monto;
    const destino = monedaDestino === 'USD' ? enBase / tasa : enBase;
    return {
      monto: this.redondear(destino),
      tasa: tipoCambio.tasa,
      tipoCambioId: tipoCambio.id ?? null,
    };
  }

  redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
  }
}
