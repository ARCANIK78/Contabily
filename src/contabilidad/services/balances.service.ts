import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PlanDeCuenta } from '../entities/plan-de-cuenta.entity.js';
import { AsientoContable, EstadoAsiento } from '../entities/asiento-contable.entity.js';
import {
  CuentaConSaldo,
  MovimientoCuenta,
  RangoFechas,
  SaldosService,
} from './saldos.service.js';

export interface FilaLibroMayor {
  numero: number | null;
  asientoId: string;
  fecha: Date;
  glosa: string;
  referencia: string | null;
  debe: number;
  haber: number;
  saldoAcumulado: number;
}

export interface RespuestaLibroMayor {
  cuenta: { id: string; codigo: string; nombre: string };
  rango: RangoFechas;
  saldoInicial: number;
  movimientos: FilaLibroMayor[];
  saldoFinal: number;
  totalMovimientos: number;
}

export interface FilaBalanceComprobacion {
  id: string;
  codigo: string;
  nombre: string;
  debe: number;
  haber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

export interface RespuestaBalanceComprobacion {
  rango: RangoFechas;
  cuentas: FilaBalanceComprobacion[];
  totales: { debe: number; haber: number; saldoDeudor: number; saldoAcreedor: number };
  /** true cuando ∑debe = ∑haber. El frontend lo muestra antes de creer cualquier cifra. */
  cuadra: boolean;
}

export interface SeccionResultados {
  clase: string;
  titulo: string;
  grupos: Array<{
    codigo: string;
    nombre: string;
    saldo: number;
    cuentas: Array<{ codigo: string; nombre: string; saldo: number }>;
  }>;
  total: number;
}

export interface RespuestaEstadoResultados {
  rango: RangoFechas;
  ingresos: SeccionResultados;
  costos: SeccionResultados;
  gastos: SeccionResultados;
  utilidad: number;
  perdida: number;
}

export interface GrupoBalance {
  codigo: string;
  nombre: string;
  saldo: number;
  cuentas: Array<{ codigo: string; nombre: string; saldo: number }>;
}

export interface RespuestaBalanceGeneral {
  fecha: string;
  activo: { total: number; grupos: GrupoBalance[] };
  pasivo: { total: number; grupos: GrupoBalance[] };
  patrimonio: { total: number; grupos: GrupoBalance[] };
  resultadosDelEjercicio: number;
  /**
   * Cuentas transaccionales con una clase fuera de 1-6. El plan base solo
   * siembra esas seis, pero crearCuenta no impide crear una clase nueva: sin
   * esta sección ese dinero desaparecería del balance y la ecuación no
   * cuadraría sin que nadie supiera por qué.
   */
  otrasCuentas: { total: number; cuentas: Array<{ codigo: string; nombre: string; saldo: number }> };
  /** activo === pasivo + patrimonio + resultados + otrasCuentas. */
  verifica: boolean;
  activoTotal: number;
  pasivoPatrimonioTotal: number;
}

/** Títulos de las clases contables del plan base. */
const TITULOS_CLASE: Record<string, string> = {
  '1': 'Activo',
  '2': 'Pasivo',
  '3': 'Patrimonio',
  '4': 'Ingresos',
  '5': 'Gastos',
  '6': 'Costos',
};

@Injectable()
export class BalancesService {
  constructor(
    private readonly saldosService: SaldosService,
    @InjectRepository(PlanDeCuenta)
    private readonly planCuentasRepo: Repository<PlanDeCuenta>,
    @InjectRepository(AsientoContable)
    private readonly asientosRepo: Repository<AsientoContable>,
  ) {}

  /**
   * Libro mayor de una cuenta: saldo anterior al período, movimientos del
   * período y saldo final corrido.
   *
   * Los movimientos se paginan pero el saldo inicial se calcula sobre el
   * histórico completo antes de fechaDesde, que es lo que hace que la columna
   * de saldo sea confiable en cualquier página.
   */
  async libroMayor(
    empresaId: string,
    cuentaId: string,
    rango: RangoFechas & { pagina?: number; limite?: number; incluirSubcuentas?: boolean },
  ): Promise<RespuestaLibroMayor> {
    const cuenta = await this.planCuentasRepo.findOne({ where: { id: cuentaId, empresaId } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta contable ${cuentaId} no encontrada`);
    }

    const idsConsiderados = rango.incluirSubcuentas
      ? await this.saldosService.idsConDescendientes(empresaId, cuentaId)
      : [cuentaId];

    const [saldoInicialMap, movimientosBrutos] = await Promise.all([
      // Histórico anterior a fechaDesde. Sin fechaDesde el libro arranca desde
      // el origen, así que no hay saldo inicial: si aquí se pidiera el
      // histórico completo, ese dinero saldría dos veces, porque además figura
      // en los movimientos listados.
      rango.fechaDesde
        ? this.saldosService.calcularSaldos(empresaId, { fechaHasta: this.diaAnterior(rango.fechaDesde) })
        : Promise.resolve(new Map<string, MovimientoCuenta>()),
      this.consultarMovimientos(empresaId, idsConsiderados, rango),
    ]);

    const saldoInicial = this.sumarNetos(saldoInicialMap, idsConsiderados);

    const pagina = rango.pagina ?? 1;
    const limite = rango.limite ?? 20;
    const desde = (pagina - 1) * limite;
    const paginaMovimientos = movimientosBrutos.slice(desde, desde + limite);

    // El acumulado de la página N sigue a partir del final de la página N-1.
    // Sin este arrastre, la segunda página mostraría saldos reiniciados.
    let acumulado = this.redondear(
      saldoInicial +
        movimientosBrutos
          .slice(0, desde)
          .reduce((suma, fila) => suma + fila.debe - fila.haber, 0),
    );

    const movimientos: FilaLibroMayor[] = paginaMovimientos.map((fila) => {
      acumulado = this.redondear(acumulado + fila.debe - fila.haber);
      return { ...fila, saldoAcumulado: acumulado };
    });

    // El saldo que se muestra en la última fila es el de esa página, no el
    // final del período. Se recalcula completo para no dar un dato a medias.
    const saldoFinal = this.redondear(
      saldoInicial +
        movimientosBrutos.reduce((suma, fila) => suma + fila.debe - fila.haber, 0),
    );

    return {
      cuenta: { id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre },
      rango: { fechaDesde: rango.fechaDesde, fechaHasta: rango.fechaHasta },
      saldoInicial,
      movimientos,
      saldoFinal,
      totalMovimientos: movimientosBrutos.length,
    };
  }

  /**
   * Balance de comprobación: la comprobación de partida doble por cuenta. Es
   * el sanity check previo a cualquier otro reporte.
   */
  async balanceComprobacion(
    empresaId: string,
    rango: RangoFechas,
  ): Promise<RespuestaBalanceComprobacion> {
    const plan = await this.saldosService.obtenerPlanConSaldos(empresaId, rango);

    // Solo las hojas del plan: los padres son agregados y contarlos duplicaría.
    const cuentas: FilaBalanceComprobacion[] = plan
      .filter((c) => c.esTransaccional)
      .map(({ id, codigo, nombre, debe, haber, saldoDeudor, saldoAcreedor }) => ({
        id,
        codigo,
        nombre,
        debe,
        haber,
        saldoDeudor,
        saldoAcreedor,
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    const totales = cuentas.reduce(
      (suma, c) => ({
        debe: this.redondear(suma.debe + c.debe),
        haber: this.redondear(suma.haber + c.haber),
        saldoDeudor: this.redondear(suma.saldoDeudor + c.saldoDeudor),
        saldoAcreedor: this.redondear(suma.saldoAcreedor + c.saldoAcreedor),
      }),
      { debe: 0, haber: 0, saldoDeudor: 0, saldoAcreedor: 0 },
    );

    return {
      rango,
      cuentas,
      totales,
      cuadra: Math.abs(totales.debe - totales.haber) <= 0.005,
    };
  }

  /**
   * Estado de resultados: ingresos (4) menos costos (6) menos gastos (5).
   */
  async estadoResultados(empresaId: string, rango: RangoFechas): Promise<RespuestaEstadoResultados> {
    const plan = await this.saldosService.obtenerPlanConSaldos(empresaId, rango);

    const ingresos = this.seccionDe(plan, '4', 'ingresos');
    const costos = this.seccionDe(plan, '6', 'costos');
    const gastos = this.seccionDe(plan, '5', 'gastos');

    const resultado = this.redondear(ingresos.total - costos.total - gastos.total);

    return {
      rango,
      ingresos,
      costos,
      gastos,
      utilidad: resultado > 0 ? resultado : 0,
      perdida: resultado < 0 ? -resultado : 0,
    };
  }

  /**
   * Balance general al corte pedido: activo contra pasivo + patrimonio +
   * resultados del ejercicio. Sin comparativo de períodos anteriores.
   */
  async balanceGeneral(empresaId: string, fecha?: string): Promise<RespuestaBalanceGeneral> {
    const rango: RangoFechas = fecha ? { fechaHasta: fecha } : {};
    const plan = await this.saldosService.obtenerPlanConSaldos(empresaId, rango);

    const activo = this.bloqueDeClase(plan, '1', (c) => c.saldoDeudor);
    const pasivo = this.bloqueDeClase(plan, '2', (c) => c.saldoAcreedor);
    const patrimonio = this.bloqueDeClase(plan, '3', (c) => c.saldoAcreedor);

    const resultadosDelEjercicio = this.redondear(
      this.totalClase(plan, '4', (c) => c.saldoAcreedor) -
        this.totalClase(plan, '6', (c) => c.saldoDeudor) -
        this.totalClase(plan, '5', (c) => c.saldoDeudor),
    );

    const otrasCuentas = this.cuentasSinClasificar(plan);

    const activoTotal = activo.total;
    const pasivoPatrimonioTotal = this.redondear(
      pasivo.total + patrimonio.total + resultadosDelEjercicio + otrasCuentas.total,
    );

    return {
      fecha: fecha ?? new Date().toISOString().slice(0, 10),
      activo,
      pasivo,
      patrimonio,
      resultadosDelEjercicio,
      otrasCuentas,
      verifica: Math.abs(activoTotal - pasivoPatrimonioTotal) <= 0.005,
      activoTotal,
      pasivoPatrimonioTotal,
    };
  }

  // ---------------------------------------------------------------- internals

  private async consultarMovimientos(
    empresaId: string,
    cuentaIds: string[],
    rango: RangoFechas,
  ): Promise<FilaLibroMayor[]> {
    const query = this.asientosRepo
      .createQueryBuilder('asiento')
      .innerJoin('asiento.detalles', 'detalle')
      .select('asiento.id', 'asientoId')
      .addSelect('asiento.numero', 'numero')
      .addSelect('asiento.fecha', 'fecha')
      .addSelect('asiento.glosa', 'glosa')
      .addSelect('asiento.referencia', 'referencia')
      .addSelect('SUM(detalle.debe)', 'debe')
      .addSelect('SUM(detalle.haber)', 'haber')
      .where('asiento.empresaId = :empresaId', { empresaId })
      .andWhere('detalle.cuentaId IN (:...cuentaIds)', { cuentaIds })
      .andWhere('asiento.estado = :estado', { estado: EstadoAsiento.CONFIRMADO })
      .groupBy('asiento.id')
      .addGroupBy('asiento.numero')
      .addGroupBy('asiento.fecha')
      .addGroupBy('asiento.glosa')
      .addGroupBy('asiento.referencia')
      .orderBy('asiento.fecha', 'ASC')
      .addOrderBy('asiento.numero', 'ASC');

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

    const filas = await query.getRawMany<{
      asientoId: string;
      numero: string | null;
      fecha: Date;
      glosa: string;
      referencia: string | null;
      debe: string;
      haber: string;
    }>();

    return filas.map((fila) => ({
      asientoId: fila.asientoId,
      numero: fila.numero === null ? null : Number(fila.numero),
      fecha: fila.fecha,
      glosa: fila.glosa,
      referencia: fila.referencia,
      debe: Number(fila.debe),
      haber: Number(fila.haber),
      saldoAcumulado: 0,
    }));
  }

  private seccionDe(
    plan: CuentaConSaldo[],
    clase: string,
    clave: 'ingresos' | 'costos' | 'gastos',
  ): SeccionResultados {
    const hojas = plan.filter((c) => c.clase === clase && c.esTransaccional);

    const porGrupo = new Map<string, Array<{ codigo: string; nombre: string; saldo: number }>>();
    for (const cuenta of hojas) {
      const grupo = this.grupoDe(cuenta.codigo);
      const lista = porGrupo.get(grupo) ?? [];
      lista.push({
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        // Los ingresos se presentan en positivo como haber; los gastos/costos
        // como deudores. Se normaliza a positivo para poder restarlos después.
        saldo: clave === 'ingresos' ? cuenta.saldoAcreedor : cuenta.saldoDeudor,
      });
      porGrupo.set(grupo, lista);
    }

    const grupos = [...porGrupo.entries()]
      .map(([codigo, cuentas]) => ({
        codigo,
        nombre: this.nombreDeGrupo(plan, codigo),
        saldo: this.redondear(cuentas.reduce((suma, c) => suma + c.saldo, 0)),
        cuentas: cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo)),
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    return {
      clase,
      titulo: TITULOS_CLASE[clase] ?? clase,
      grupos,
      total: this.redondear(grupos.reduce((suma, g) => suma + g.saldo, 0)),
    };
  }

  private bloqueDeClase(
    plan: CuentaConSaldo[],
    clase: string,
    elegirSaldo: (c: CuentaConSaldo) => number,
  ): { total: number; grupos: GrupoBalance[] } {
    const hojas = plan.filter((c) => c.clase === clase && c.esTransaccional);

    const porGrupo = new Map<string, GrupoBalance>();
    for (const cuenta of hojas) {
      const codigoGrupo = this.grupoDe(cuenta.codigo);
      const existente = porGrupo.get(codigoGrupo) ?? {
        codigo: codigoGrupo,
        nombre: this.nombreDeGrupo(plan, codigoGrupo),
        saldo: 0,
        cuentas: [],
      };
      const saldo = elegirSaldo(cuenta);
      existente.saldo = this.redondear(existente.saldo + saldo);
      existente.cuentas.push({ codigo: cuenta.codigo, nombre: cuenta.nombre, saldo });
      porGrupo.set(codigoGrupo, existente);
    }

    const grupos = [...porGrupo.values()]
      .map((g) => ({
        ...g,
        cuentas: g.cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo)),
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    return {
      total: this.redondear(grupos.reduce((suma, g) => suma + g.saldo, 0)),
      grupos,
    };
  }

  private totalClase(
    plan: CuentaConSaldo[],
    clase: string,
    elegirSaldo: (c: CuentaConSaldo) => number,
  ): number {
    return this.redondear(
      plan
        .filter((c) => c.clase === clase && c.esTransaccional)
        .reduce((suma, c) => suma + elegirSaldo(c), 0),
    );
  }

  /**
   * Cuentas transaccionales cuya clase no está entre 1 y 6.
   *
   * crearCuenta valida que exista la clase raíz, pero no que sea una de las
   * seis del plan base: alguien puede crear una clase 7 sin más. Sin listarla
   * aquí, su saldo quedaría fuera del balance y la ecuación no cuadraría sin
   * que nadie supiera por qué. Se reporta con su neto firmado para que la
   * suma cierre exacta.
   */
  private cuentasSinClasificar(
    plan: CuentaConSaldo[],
  ): { total: number; cuentas: Array<{ codigo: string; nombre: string; saldo: number }> } {
    const cuentas = plan
      .filter((c) => c.esTransaccional && !TITULOS_CLASE[c.clase])
      .map((c) => ({ codigo: c.codigo, nombre: c.nombre, saldo: c.neto }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    return {
      total: this.redondear(cuentas.reduce((suma, c) => suma + c.saldo, 0)),
      cuentas,
    };
  }

  /** 1.1.1.01 → 1.1.1: el nivel de agrupación que se muestra en el reporte. */
  private grupoDe(codigo: string): string {
    const partes = codigo.split('.');
    return partes.length > 2 ? partes.slice(0, -1).join('.') : codigo;
  }

  /**
   * Nombre del grupo tal como está en el plan (1.1.1 → "Caja y Bancos"). Si el
   * nodo intermedio no existe en el plan se usa el de la clase, que siempre
   * está sembrada.
   */
  private nombreDeGrupo(plan: CuentaConSaldo[], codigoGrupo: string): string {
    const propia = plan.find((c) => c.codigo === codigoGrupo);
    if (propia) {
      return propia.nombre;
    }
    const raiz = codigoGrupo.split('.')[0] ?? codigoGrupo;
    return TITULOS_CLASE[raiz] ?? codigoGrupo;
  }

  private sumarNetos(
    saldos: Map<string, MovimientoCuenta>,
    ids: string[],
  ): number {
    return this.redondear(
      ids.reduce((suma, id) => suma + (saldos.get(id)?.neto ?? 0), 0),
    );
  }

  private diaAnterior(iso: string): string {
    const dia = this.inicioDelDia(iso);
    dia.setUTCDate(dia.getUTCDate() - 1);
    return dia.toISOString().slice(0, 10);
  }

  private inicioDelDia(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }

  private diaSiguiente(iso: string): Date {
    const siguiente = this.inicioDelDia(iso);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    return siguiente;
  }

  private redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
  }
}
