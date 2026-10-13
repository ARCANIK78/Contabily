import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';

import { Gasto, EstadoGasto } from '../entities/gasto.entity.js';
import { CategoriaGasto } from '../entities/categoria-gasto.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { PlanDeCuenta } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import { AsientosService } from '../../contabilidad/services/asientos.service.js';
import { MovimientosFinancierosService } from '../../cajas/services/movimientos-financieros.service.js';
import {
  CrearGastoDto,
  CrearCategoriaGastoDto,
  ActualizarCategoriaGastoDto,
} from '../dto/gasto.dto.js';

const CUENTA_IVA_POR_PAGAR = '2.1.2.01';

/**
 * Categorías que nacen con cada negocio, ligadas a las cuentas del plan base.
 * Si una cuenta no existe en el plan del negocio, esa categoría se omite.
 */
export const CATEGORIAS_BASE: ReadonlyArray<{ nombre: string; codigo: string }> = [
  { nombre: 'Alquileres', codigo: '5.1.01' },
  { nombre: 'Servicios Básicos', codigo: '5.1.02' },
  { nombre: 'Remuneraciones', codigo: '5.1.03' },
  { nombre: 'Gastos Varios', codigo: '5.1.04' },
  { nombre: 'Publicidad y Marketing', codigo: '5.2.01' },
  { nombre: 'Comisiones Bancarias', codigo: '5.3.01' },
];

export interface FiltroGastos {
  categoriaId?: string;
  /** ISO 8601 */
  desde?: string;
  /** ISO 8601 */
  hasta?: string;
}

@Injectable()
export class GastosService {
  constructor(
    @InjectRepository(Gasto)
    private readonly gastosRepo: Repository<Gasto>,
    @InjectRepository(CategoriaGasto)
    private readonly categoriasRepo: Repository<CategoriaGasto>,
    private readonly dataSource: DataSource,
    private readonly asientosService: AsientosService,
    private readonly movimientosFinancieros: MovimientosFinancierosService,
  ) {}

  /**
   * Registra un gasto y lo paga en el mismo momento: descuenta la caja/banco
   * y genera el asiento (cuenta de la categoría + IVA vs caja).
   */
  async crear(empresaId: string, usuarioId: string | null, dto: CrearGastoDto): Promise<Gasto> {
    const categoria = await this.categoriasRepo.findOne({
      where: { id: dto.categoriaId, empresaId },
    });
    if (!categoria) {
      throw new NotFoundException('Categoría de gasto no encontrada en este negocio');
    }
    if (!categoria.activa) {
      throw new BadRequestException(`La categoría "${categoria.nombre}" está inactiva`);
    }

    const moneda = dto.moneda ?? 'BOB';
    const monto = this.movimientosFinancieros.redondear(dto.monto);
    const iva = this.movimientosFinancieros.redondear(dto.iva ?? 0);
    const total = this.movimientosFinancieros.redondear(monto + iva);

    const conversion = await this.movimientosFinancieros.calcularConversion(moneda, total);
    const tasa = Number(conversion.tasaAplicada);
    const ivaBase = this.movimientosFinancieros.redondear(iva * tasa);
    const montoGastoBase = this.movimientosFinancieros.redondear(conversion.montoEnBase - ivaBase);
    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();

    return this.dataSource.transaction(async (manager) => {
      const cuenta = await this.movimientosFinancieros.bloquearCuenta(
        manager,
        empresaId,
        dto.cuentaFinancieraId,
      );
      const enCaja = await this.movimientosFinancieros.convertir(total, moneda, cuenta.moneda);
      this.movimientosFinancieros.validarSaldoSuficiente(cuenta, enCaja.monto);

      // Debe: cuenta de la categoría (+ IVA acreditable); Haber: caja/banco.
      const detallesAsiento = [
        { cuentaId: categoria.cuentaContableId, debe: montoGastoBase, haber: 0 },
      ];
      if (ivaBase > 0) {
        const cuentaIva = await this.buscarCuenta(manager, empresaId, CUENTA_IVA_POR_PAGAR);
        detallesAsiento.push({ cuentaId: cuentaIva.id, debe: ivaBase, haber: 0 });
      }
      detallesAsiento.push({ cuentaId: cuenta.cuentaContableId, debe: 0, haber: conversion.montoEnBase });

      const asiento = await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: `Gasto ${categoria.nombre}: ${dto.descripcion}`,
        referencia: dto.numeroComprobante,
        fecha,
        detalles: detallesAsiento,
      });

      const gasto = await manager.save(
        manager.create(Gasto, {
          empresaId,
          categoriaId: categoria.id,
          cuentaFinancieraId: cuenta.id,
          fecha,
          descripcion: dto.descripcion,
          numeroComprobante: dto.numeroComprobante ?? null,
          moneda,
          monto: monto.toFixed(2),
          iva: iva.toFixed(2),
          tasaAplicada: conversion.tasaAplicada,
          tipoCambioId: conversion.tipoCambioId,
          montoEnMonedaBase: conversion.montoEnBase.toFixed(2),
          estado: EstadoGasto.PAGADO,
          asientoId: asiento.id,
          usuarioId: usuarioId ?? null,
        }),
      );

      await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, -enCaja.monto);
      return gasto;
    });
  }

  /** Anula un gasto: asiento inverso y el dinero vuelve a la caja. */
  async anular(empresaId: string, id: string): Promise<Gasto> {
    const gasto = await this.gastosRepo.findOne({
      where: { id, empresaId },
      relations: { asiento: { detalles: true } },
    });
    if (!gasto) {
      throw new NotFoundException('Gasto no encontrado');
    }
    if (gasto.estado === EstadoGasto.ANULADO) {
      throw new BadRequestException('El gasto ya está anulado');
    }
    if (!gasto.asiento || gasto.asiento.detalles.length === 0) {
      throw new BadRequestException('El gasto no tiene asiento contable asociado; no se puede reversar');
    }
    // Se captura fuera de la transacción para que TypeScript sepa que existe.
    const detallesInversos = gasto.asiento.detalles.map((detalle) => ({
      cuentaId: detalle.cuentaId,
      debe: Number(detalle.haber),
      haber: Number(detalle.debe),
    }));

    return this.dataSource.transaction(async (manager) => {
      await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: `Anulación de gasto: ${gasto.descripcion}`,
        referencia: gasto.numeroComprobante ?? undefined,
        detalles: detallesInversos,
      });

      const cuenta = await this.movimientosFinancieros.bloquearCuenta(
        manager,
        empresaId,
        gasto.cuentaFinancieraId,
      );
      const total = this.movimientosFinancieros.redondear(Number(gasto.monto) + Number(gasto.iva));
      const enCaja = await this.movimientosFinancieros.convertir(total, gasto.moneda, cuenta.moneda);
      await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, enCaja.monto);

      gasto.estado = EstadoGasto.ANULADO;
      return manager.save(gasto);
    });
  }

  listar(empresaId: string, filtros: FiltroGastos = {}): Promise<Gasto[]> {
    const where: FindOptionsWhere<Gasto> = { empresaId };
    if (filtros.categoriaId) {
      where.categoriaId = filtros.categoriaId;
    }
    if (filtros.desde || filtros.hasta) {
      where.fecha = Between(
        filtros.desde ? new Date(filtros.desde) : new Date('0000-01-01'),
        filtros.hasta ? new Date(filtros.hasta) : new Date('9999-12-31'),
      );
    }

    return this.gastosRepo.find({
      where,
      relations: { categoria: true, cuentaFinanciera: true },
      order: { fecha: 'DESC', creadoEn: 'DESC' },
      take: 100,
    });
  }

  async obtenerPorId(empresaId: string, id: string): Promise<Gasto> {
    const gasto = await this.gastosRepo.findOne({
      where: { id, empresaId },
      relations: { categoria: true, cuentaFinanciera: true, asiento: true },
    });
    if (!gasto) {
      throw new NotFoundException('Gasto no encontrado');
    }
    return gasto;
  }

  // ==================== CATEGORÍAS ====================

  async crearCategoria(empresaId: string, dto: CrearCategoriaGastoDto): Promise<CategoriaGasto> {
    const existente = await this.categoriasRepo.findOne({
      where: { empresaId, nombre: dto.nombre },
    });
    if (existente) {
      throw new ConflictException(`Ya existe una categoría llamada "${dto.nombre}" en este negocio`);
    }

    await this.validarCuentaContable(empresaId, dto.cuentaContableId);

    const categoria = this.categoriasRepo.create({
      nombre: dto.nombre,
      cuentaContableId: dto.cuentaContableId,
      empresaId,
    });
    return this.categoriasRepo.save(categoria);
  }

  listarCategorias(empresaId: string, soloActivas = true): Promise<CategoriaGasto[]> {
    return this.categoriasRepo.find({
      where: { empresaId, ...(soloActivas ? { activa: true } : {}) },
      relations: { cuentaContable: true },
      order: { nombre: 'ASC' },
    });
  }

  async obtenerCategoriaPorId(empresaId: string, id: string): Promise<CategoriaGasto> {
    const categoria = await this.categoriasRepo.findOne({
      where: { id, empresaId },
      relations: { cuentaContable: true },
    });
    if (!categoria) {
      throw new NotFoundException('Categoría de gasto no encontrada');
    }
    return categoria;
  }

  async actualizarCategoria(
    empresaId: string,
    id: string,
    dto: ActualizarCategoriaGastoDto,
  ): Promise<CategoriaGasto> {
    const categoria = await this.obtenerCategoriaPorId(empresaId, id);

    if (dto.nombre && dto.nombre !== categoria.nombre) {
      const existe = await this.categoriasRepo.findOne({
        where: { empresaId, nombre: dto.nombre },
      });
      if (existe) {
        throw new ConflictException(`Ya existe una categoría llamada "${dto.nombre}" en este negocio`);
      }
    }
    if (dto.cuentaContableId && dto.cuentaContableId !== categoria.cuentaContableId) {
      await this.validarCuentaContable(empresaId, dto.cuentaContableId);
    }

    Object.assign(categoria, dto);
    return this.categoriasRepo.save(categoria);
  }

  /** Baja lógica: el historial de gastos conserva la categoría. */
  async desactivarCategoria(empresaId: string, id: string): Promise<CategoriaGasto> {
    const categoria = await this.obtenerCategoriaPorId(empresaId, id);
    categoria.activa = false;
    return this.categoriasRepo.save(categoria);
  }

  /**
   * Siembra las categorías estándar de un negocio (ligadas a la clase 5 del
   * plan base). Idempotente: las que ya existen no se tocan.
   */
  async sembrarCategoriasBase(empresaId: string): Promise<CategoriaGasto[]> {
    const planRepo = this.dataSource.getRepository(PlanDeCuenta);
    const creadas: CategoriaGasto[] = [];

    for (const base of CATEGORIAS_BASE) {
      const existente = await this.categoriasRepo.findOne({
        where: { empresaId, nombre: base.nombre },
      });
      if (existente) {
        continue;
      }

      const cuenta = await planRepo.findOne({ where: { empresaId, codigo: base.codigo } });
      if (!cuenta) {
        continue; // el negocio no tiene esa cuenta en su plan
      }

      creadas.push(
        await this.categoriasRepo.save(
          this.categoriasRepo.create({
            empresaId,
            nombre: base.nombre,
            cuentaContableId: cuenta.id,
          }),
        ),
      );
    }

    return creadas;
  }

  // ==================== INTERNOS ====================

  /**
   * La cuenta de una categoría debe ser transaccional y no puede ser la
   * contable de una caja/banco (el asiento descuadraría frente al subledger).
   */
  private async validarCuentaContable(empresaId: string, cuentaContableId: string): Promise<void> {
    const cuenta = await this.dataSource
      .getRepository(PlanDeCuenta)
      .findOne({ where: { id: cuentaContableId, empresaId } });
    if (!cuenta) {
      throw new NotFoundException('Cuenta contable no encontrada en este negocio');
    }
    if (!cuenta.esTransaccional) {
      throw new BadRequestException(
        `La cuenta "${cuenta.codigo}" no es transaccional; usa una cuenta que acepte movimientos (clase 5)`,
      );
    }
    const vinculadas = await this.dataSource
      .getRepository(CuentaFinanciera)
      .count({ where: { cuentaContableId, empresaId } });
    if (vinculadas > 0) {
      throw new BadRequestException(
        `La cuenta "${cuenta.codigo}" está vinculada a una caja o banco; para gastos usa una cuenta de la clase 5`,
      );
    }
  }

  private async buscarCuenta(
    manager: EntityManager,
    empresaId: string,
    codigo: string,
  ): Promise<PlanDeCuenta> {
    const cuenta = await manager
      .getRepository(PlanDeCuenta)
      .findOne({ where: { empresaId, codigo } });
    if (!cuenta) {
      throw new BadRequestException(
        `Falta la cuenta ${codigo} en el plan de cuentas de este negocio; crea esa cuenta antes de registrar gastos con IVA`,
      );
    }
    return cuenta;
  }
}
