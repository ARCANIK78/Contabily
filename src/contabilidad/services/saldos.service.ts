import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DetalleAsiento } from '../entities/detalle-asiento.entity.js';
import { PlanDeCuenta } from '../entities/plan-de-cuenta.entity.js';
import { EstadoAsiento } from '../entities/asiento-contable.entity.js';

export interface RangoFechas {
  /** Inclusive. Formato YYYY-MM-DD. */
  fechaDesde?: string;
  /** Inclusive. Formato YYYY-MM-DD. */
  fechaHasta?: string;
}

export interface MovimientoCuenta {
  debe: number;
  haber: number;
  /** debe - haber. Positivo = saldo deudor, negativo = saldo acreedor. */
  neto: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

export interface CuentaConSaldo extends MovimientoCuenta {
  id: string;
  codigo: string;
  nombre: string;
  cuentaPadreId: string | null;
  esTransaccional: boolean;
  /** Clase contable: primer segmento del código (1=Activo, 2=Pasivo, ...). */
  clase: string;
}

const CERO: MovimientoCuenta = {
  debe: 0,
  haber: 0,
  neto: 0,
  saldoDeudor: 0,
  saldoAcreedor: 0,
};

/**
 * Única fuente de verdad de los saldos contables.
 *
 * Todo lo que derive dinero de los asientos —libro mayor, balance de
 * comprobación, estado de resultados, balance general— debe pasar por aquí, o
 * los reportes terminan con tres lógicas de saldo distintas que no cuadran
 * entre sí.
 *
 * Dos invariantes que sostienen todos los reportes:
 *
 *  1. DetalleAsiento NO tiene empresaId. El filtro multi-tenant se hace
 *     uniéndolo a su asiento. Si se olvida esa unión, un cliente podría leer
 *     saldos de otro negocio.
 *  2. Los asientos ANULADOS no suman. Anular es lógico (el libro diario no se
 *     borra), así que el saldo vivo tiene que ignorarlos por completo.
 */
@Injectable()
export class SaldosService {
  constructor(
    @InjectRepository(DetalleAsiento)
    private readonly detallesRepo: Repository<DetalleAsiento>,
    @InjectRepository(PlanDeCuenta)
    private readonly planCuentasRepo: Repository<PlanDeCuenta>,
  ) {}

  /**
   * Suma debe/haber por cuenta dentro del rango dado (o histórico completo),
   * y devuelve además el roll-up del árbol: cada cuenta acumula sus propios
   * detalles más los de sus descendientes.
   *
   * El árbol se recorre por cuentaPadreId, nunca por el prefijo del código.
   * crearCuenta exige que exista la clase raíz pero no valida que el código
   * del hijo empiece por el del padre, así que un LIKE '1.%' metería en la
   * clase equivocada a cualquier cuenta mal colgada.
   */
  async calcularSaldos(
    empresaId: string,
    rango: RangoFechas = {},
  ): Promise<Map<string, MovimientoCuenta>> {
    const propios = await this.sumarMovimientosPropios(empresaId, rango);
    const cuentas = await this.planCuentasRepo.find({ where: { empresaId } });

    return this.acumularArbol(cuentas, propios);
  }

  /**
   * Devuelve el plan completo del negocio con su saldo ya acumulado, listo para
   * pintar un árbol con cifras. Incluye las cuentas sin movimiento (en cero).
   */
  async obtenerPlanConSaldos(
    empresaId: string,
    rango: RangoFechas = {},
  ): Promise<CuentaConSaldo[]> {
    const [cuentas, acumulados] = await Promise.all([
      this.planCuentasRepo.find({ where: { empresaId }, order: { codigo: 'ASC' } }),
      this.calcularSaldos(empresaId, rango),
    ]);

    return cuentas.map((cuenta) => ({
      id: cuenta.id,
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      cuentaPadreId: cuenta.cuentaPadreId,
      esTransaccional: cuenta.esTransaccional,
      clase: this.claseDe(cuenta.codigo),
      ...(acumulados.get(cuenta.id) ?? CERO),
    }));
  }

  /**
   * Ids de una cuenta más todos sus descendientes. Se usa para que el libro
   * mayor pueda pedir la rama completa de un grupo.
   */
  async idsConDescendientes(empresaId: string, cuentaId: string): Promise<string[]> {
    const cuentas = await this.planCuentasRepo.find({ where: { empresaId } });

    const hijosPorPadre = this.agruparHijos(cuentas);
    const resultado: string[] = [];
    const cola = [cuentaId];

    while (cola.length > 0) {
      const actual = cola.shift()!;
      resultado.push(actual);
      cola.push(...(hijosPorPadre.get(actual) ?? []));
    }

    return resultado;
  }

  /**
   * Suma cruda de los detalles, sin roll-up. Es el SQL único que toca la base:
   * la unión con el asiento es la que aplica el tenant y excluye los anulados.
   */
  private async sumarMovimientosPropios(
    empresaId: string,
    rango: RangoFechas,
  ): Promise<Map<string, { debe: number; haber: number }>> {
    const query = this.detallesRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.asiento', 'asiento')
      .select('detalle.cuenta_id', 'cuentaId')
      .addSelect('COALESCE(SUM(detalle.debe), 0)', 'debe')
      .addSelect('COALESCE(SUM(detalle.haber), 0)', 'haber')
      .where('asiento.empresa_id = :empresaId', { empresaId })
      .andWhere('asiento.estado = :estado', { estado: EstadoAsiento.CONFIRMADO })
      .groupBy('detalle.cuenta_id');

    // `fecha` es timestamptz. Comparar contra el siguiente día a medianoche deja
    // el rango inclusivo en ambos extremos sin tener que migrar la columna.
    if (rango.fechaDesde) {
      query.andWhere('asiento.fecha >= :fechaDesde', {
        fechaDesde: this.inicioDelDia(rango.fechaDesde),
      });
    }
    if (rango.fechaHasta) {
      query.andWhere('asiento.fecha < :fechaHasta', {
        fechaHasta: this.diaSiguiente(rango.fechaHasta),
      });
    }

    const filas = await query.getRawMany<{ cuentaId: string; debe: string; haber: string }>();

    const movimientos = new Map<string, { debe: number; haber: number }>();
    for (const fila of filas) {
      movimientos.set(fila.cuentaId, {
        debe: Number(fila.debe),
        haber: Number(fila.haber),
      });
    }
    return movimientos;
  }

  /** Post-order sobre el árbol de cuentaPadreId, con guardia anti-ciclo. */
  private acumularArbol(
    cuentas: PlanDeCuenta[],
    propios: Map<string, { debe: number; haber: number }>,
  ): Map<string, MovimientoCuenta> {
    const hijosPorPadre = this.agruparHijos(cuentas);
    const resultado = new Map<string, MovimientoCuenta>();
    const enCurso = new Set<string>();

    const acumular = (id: string): { debe: number; haber: number } => {
      const yaCalculado = resultado.get(id);
      if (yaCalculado) {
        return yaCalculado;
      }
      // Rompe un ciclo defectuoso en lugar de colgarse.
      if (enCurso.has(id)) {
        return { debe: 0, haber: 0 };
      }
      enCurso.add(id);

      let debe = propios.get(id)?.debe ?? 0;
      let haber = propios.get(id)?.haber ?? 0;

      for (const hijoId of hijosPorPadre.get(id) ?? []) {
        const acumuladoHijo = acumular(hijoId);
        debe += acumuladoHijo.debe;
        haber += acumuladoHijo.haber;
      }

      const movimiento = this.redondearADos({ debe, haber });
      resultado.set(id, this.presentar(movimiento));
      return movimiento;
    };

    for (const cuenta of cuentas) {
      acumular(cuenta.id);
    }

    return resultado;
  }

  private agruparHijos(cuentas: PlanDeCuenta[]): Map<string, string[]> {
    const ids = new Set(cuentas.map((cuenta) => cuenta.id));
    const hijosPorPadre = new Map<string, string[]>();

    for (const cuenta of cuentas) {
      // Un padre que ya no existe (SET NULL) simplemente queda como raíz.
      if (!cuenta.cuentaPadreId || !ids.has(cuenta.cuentaPadreId)) {
        continue;
      }
      const hermanos = hijosPorPadre.get(cuenta.cuentaPadreId) ?? [];
      hermanos.push(cuenta.id);
      hijosPorPadre.set(cuenta.cuentaPadreId, hermanos);
    }

    return hijosPorPadre;
  }

  /** Clase contable a partir del código: 1.1.1.01 → '1'. */
  claseDe(codigo: string): string {
    return codigo.split('.')[0] ?? codigo;
  }

  /** Presentación habitual de un balance de comprobación. */
  private presentar(movimiento: { debe: number; haber: number }): MovimientoCuenta {
    const neto = this.redondear(movimiento.debe - movimiento.haber);
    return {
      debe: movimiento.debe,
      haber: movimiento.haber,
      neto,
      saldoDeudor: neto > 0 ? neto : 0,
      saldoAcreedor: neto < 0 ? -neto : 0,
    };
  }

  private redondearADos(movimiento: { debe: number; haber: number }): { debe: number; haber: number } {
    return { debe: this.redondear(movimiento.debe), haber: this.redondear(movimiento.haber) };
  }

  private redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
  }

  private inicioDelDia(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }

  private diaSiguiente(iso: string): Date {
    const siguiente = this.inicioDelDia(iso);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    return siguiente;
  }
}
