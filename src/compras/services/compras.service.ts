import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { Compra, EstadoCompra, TipoPagoCompra } from '../entities/compra.entity.js';
import { CompraDetalle } from '../entities/compra-detalle.entity.js';
import { CompraPago } from '../entities/compra-pago.entity.js';
import { Proveedor } from '../entities/proveedor.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { PlanDeCuenta } from '../../contabilidad/entities/plan-de-cuenta.entity.js';
import { AsientosService } from '../../contabilidad/services/asientos.service.js';
import { MovimientosFinancierosService } from '../../cajas/services/movimientos-financieros.service.js';
import { ProductoService } from '../../producto/producto.service.js';
import { CrearCompraDto, LineaCompraDto, PagoCompraDto } from '../dto/compra.dto.js';

/** Códigos del plan base que usa el módulo (cada negocio los tiene sembrados). */
const CUENTA_MERCADERIAS = '1.1.3.01';
const CUENTA_IVA_POR_PAGAR = '2.1.2.01';
const CUENTA_PROVEEDORES = '2.1.1.01';

export interface FiltroCompras {
  proveedorId?: string;
  estado?: EstadoCompra;
  /** YYYY-MM-DD */
  desde?: string;
  /** YYYY-MM-DD */
  hasta?: string;
}

interface LineaValidada extends LineaCompraDto {
  subtotal: number;
}

@Injectable()
export class ComprasService {
  constructor(
    @InjectRepository(Compra)
    private readonly comprasRepo: Repository<Compra>,
    private readonly dataSource: DataSource,
    private readonly asientosService: AsientosService,
    private readonly movimientosFinancieros: MovimientosFinancierosService,
    private readonly productoService: ProductoService,
  ) {}

  /**
   * Registra la compra y recibe la mercadería en una sola transacción:
   *  - guarda cabecera y líneas,
   *  - genera el asiento (inventario + IVA vs caja o proveedores),
   *  - descuenta la caja si es de contado,
   *  - sube stock y costos de los productos (último costo).
   */
  async crear(empresaId: string, dto: CrearCompraDto): Promise<Compra> {
    const proveedor = await this.buscarProveedor(empresaId, dto.proveedorId);

    const lineas = this.validarLineas(dto.detalles);
    const subtotal = this.movimientosFinancieros.redondear(
      lineas.reduce((suma, linea) => suma + linea.subtotal, 0),
    );
    const iva = this.movimientosFinancieros.redondear(dto.iva ?? 0);
    const total = this.movimientosFinancieros.redondear(subtotal + iva);

    if (total <= 0) {
      throw new BadRequestException('El total de la compra debe ser mayor a 0');
    }

    const tipoPago = dto.tipoPago ?? TipoPagoCompra.CONTADO;
    const moneda = dto.moneda ?? 'BOB';
    const fecha = dto.fecha ?? this.hoy();

    if (tipoPago === TipoPagoCompra.CONTADO && !dto.cuentaFinancieraId) {
      throw new BadRequestException(
        'Las compras de contado requieren cuentaFinancieraId (la caja o banco con la que se paga)',
      );
    }

    // Una sola tasa para todo el documento: así el asiento cuadra al céntimo.
    const conversion = await this.movimientosFinancieros.calcularConversion(moneda, total);
    const tasa = Number(conversion.tasaAplicada);
    const subtotalBase = this.movimientosFinancieros.redondear(subtotal * tasa);
    const ivaBase = this.movimientosFinancieros.redondear(iva * tasa);
    const totalBase = this.movimientosFinancieros.redondear(subtotalBase + ivaBase);

    try {
      return await this.dataSource.transaction(async (manager) => {
        let cuenta: CuentaFinanciera | undefined;
        let debitoCaja = 0;

        if (dto.cuentaFinancieraId) {
          cuenta = await this.movimientosFinancieros.bloquearCuenta(
            manager,
            empresaId,
            dto.cuentaFinancieraId,
          );
          const enCaja = await this.movimientosFinancieros.convertir(total, moneda, cuenta.moneda);
          debitoCaja = enCaja.monto;
          this.movimientosFinancieros.validarSaldoSuficiente(cuenta, debitoCaja);
        }

        const compra = await manager.save(
          manager.create(Compra, {
            empresaId,
            proveedorId: proveedor.id,
            numeroFactura: dto.numeroFactura,
            fecha,
            fechaVencimiento: dto.fechaVencimiento ?? null,
            tipoPago,
            estado:
              tipoPago === TipoPagoCompra.CONTADO ? EstadoCompra.PAGADA : EstadoCompra.RECIBIDA,
            moneda,
            tasaAplicada: conversion.tasaAplicada,
            tipoCambioId: conversion.tipoCambioId,
            subtotal: subtotal.toFixed(2),
            iva: iva.toFixed(2),
            total: total.toFixed(2),
            montoEnMonedaBase: totalBase.toFixed(2),
            saldoPendiente: tipoPago === TipoPagoCompra.CONTADO ? '0.00' : total.toFixed(2),
            cuentaFinancieraId: cuenta?.id ?? null,
            asientoId: null,
            notas: dto.notas ?? null,
          }),
        );

        for (const linea of lineas) {
          await manager.save(
            manager.create(CompraDetalle, {
              compraId: compra.id,
              productoId: linea.productoId ?? null,
              varianteId: linea.varianteId ?? null,
              descripcion: linea.descripcion,
              cantidad: linea.cantidad,
              costoUnitario: linea.costoUnitario.toFixed(2),
              subtotal: linea.subtotal.toFixed(2),
            }),
          );
        }

        // Debe: inventario (mercaderías) + IVA acreditable; Haber: caja (contado) o proveedores (crédito).
        const detallesAsiento = [
          {
            cuentaId: (await this.buscarCuenta(manager, empresaId, CUENTA_MERCADERIAS)).id,
            debe: subtotalBase,
            haber: 0,
          },
        ];
        if (ivaBase > 0) {
          const cuentaIva = await this.buscarCuenta(manager, empresaId, CUENTA_IVA_POR_PAGAR);
          detallesAsiento.push({ cuentaId: cuentaIva.id, debe: ivaBase, haber: 0 });
        }
        const cuentaHaber = cuenta
          ? cuenta.cuentaContableId
          : (await this.buscarCuenta(manager, empresaId, CUENTA_PROVEEDORES)).id;
        detallesAsiento.push({ cuentaId: cuentaHaber, debe: 0, haber: totalBase });

        const asiento = await this.asientosService.crearAsiento(manager, {
          empresaId,
          glosa: `Compra ${dto.numeroFactura} a ${proveedor.nombre}`,
          referencia: dto.numeroFactura,
          fecha: new Date(fecha),
          detalles: detallesAsiento,
        });

        compra.asientoId = asiento.id;
        await manager.save(compra);

        if (cuenta) {
          await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, -debitoCaja);
        }

        await this.productoService.aplicarEntradaCompra(
          manager,
          empresaId,
          compra.id,
          lineas.map((linea) => ({
            productoId: linea.productoId,
            varianteId: linea.varianteId,
            cantidad: linea.cantidad,
            costoUnitario: linea.costoUnitario,
            descripcion: linea.descripcion,
          })),
        );

        return this.obtenerPorId(empresaId, compra.id);
      });
    } catch (error) {
      // La restricción UNIQUE (empresa, proveedor, factura) se traduce a un 409 claro.
      if (this.esFacturaDuplicada(error)) {
        throw new ConflictException(
          `Ya existe la factura "${dto.numeroFactura}" registrada al proveedor ${proveedor.nombre}`,
        );
      }
      throw error;
    }
  }

  /**
   * Registra un pago (parcial o total) a la cuenta por pagar de la compra.
   * El monto se expresa en la moneda de la factura; la caja se debita en su
   * propia moneda usando la tasa del día.
   */
  async registrarPago(
    empresaId: string,
    compraId: string,
    dto: PagoCompraDto,
  ): Promise<CompraPago> {
    const compra = await this.buscarCompra(empresaId, compraId, { pagos: true });

    if (compra.estado === EstadoCompra.ANULADA) {
      throw new BadRequestException('No se puede pagar una compra anulada');
    }

    const saldoPendiente = this.movimientosFinancieros.redondear(Number(compra.saldoPendiente));
    if (saldoPendiente <= 0) {
      throw new BadRequestException('La compra ya está pagada en su totalidad');
    }

    const monto = this.movimientosFinancieros.redondear(dto.monto);
    if (monto > saldoPendiente) {
      throw new BadRequestException(
        `El pago excede el saldo pendiente: pendiente ${saldoPendiente.toFixed(2)}, intenta pagar ${monto.toFixed(2)}`,
      );
    }

    const conversion = await this.movimientosFinancieros.calcularConversion(compra.moneda, monto);

    return this.dataSource.transaction(async (manager) => {
      const cuenta = await this.movimientosFinancieros.bloquearCuenta(
        manager,
        empresaId,
        dto.cuentaFinancieraId,
      );
      const enCaja = await this.movimientosFinancieros.convertir(
        monto,
        compra.moneda,
        cuenta.moneda,
      );
      this.movimientosFinancieros.validarSaldoSuficiente(cuenta, enCaja.monto);

      const pago = await manager.save(
        manager.create(CompraPago, {
          empresaId,
          compraId: compra.id,
          cuentaFinancieraId: cuenta.id,
          monto: monto.toFixed(2),
          montoEnMonedaBase: conversion.montoEnBase.toFixed(2),
          tasaAplicada: conversion.tasaAplicada,
          tipoCambioId: conversion.tipoCambioId,
          asientoId: null,
          referencia: dto.referencia ?? null,
          notas: dto.notas ?? null,
        }),
      );

      // Debe: proveedores (se amortiza la deuda); Haber: caja/banco.
      const asiento = await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: `Pago a proveedor — compra ${compra.numeroFactura}`,
        referencia: dto.referencia ?? compra.numeroFactura,
        detalles: [
          {
            cuentaId: (await this.buscarCuenta(manager, empresaId, CUENTA_PROVEEDORES)).id,
            debe: conversion.montoEnBase,
            haber: 0,
          },
          { cuentaId: cuenta.cuentaContableId, debe: 0, haber: conversion.montoEnBase },
        ],
      });

      pago.asientoId = asiento.id;
      await manager.save(pago);

      await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, -enCaja.monto);

      const nuevoSaldo = this.movimientosFinancieros.redondear(saldoPendiente - monto);
      compra.saldoPendiente = Math.max(nuevoSaldo, 0).toFixed(2);
      compra.estado = nuevoSaldo <= 0 ? EstadoCompra.PAGADA : EstadoCompra.RECIBIDA;
      await manager.save(compra);

      return pago;
    });
  }

  /**
   * Anula una compra sin pagos: revierte el stock (salida a proveedor) y
   * genera el asiento inverso. Si fue de contado, devuelve el dinero a la caja.
   */
  async anular(empresaId: string, id: string): Promise<Compra> {
    const compra = await this.buscarCompra(empresaId, id, {
      pagos: true,
      detalles: true,
      proveedor: true,
      asiento: { detalles: true },
    });

    if (compra.estado === EstadoCompra.ANULADA) {
      throw new BadRequestException('La compra ya está anulada');
    }
    if (compra.pagos.length > 0) {
      throw new BadRequestException(
        'La compra tiene pagos registrados; no se puede anular (usa una nota de crédito con el proveedor)',
      );
    }
    if (!compra.asiento || compra.asiento.detalles.length === 0) {
      throw new BadRequestException('La compra no tiene asiento contable asociado; no se puede reversar');
    }
    // Se captura fuera de la transacción para que TypeScript sepa que existe.
    const detallesInversos = compra.asiento.detalles.map((detalle) => ({
      cuentaId: detalle.cuentaId,
      debe: Number(detalle.haber),
      haber: Number(detalle.debe),
    }));

    return this.dataSource.transaction(async (manager) => {
      // 1. Reversa de inventario: salida con origen devolución al proveedor.
      await this.productoService.reversarEntradaCompra(
        manager,
        empresaId,
        compra.id,
        compra.detalles.map((detalle) => ({
          productoId: detalle.productoId,
          varianteId: detalle.varianteId,
          cantidad: detalle.cantidad,
          costoUnitario: Number(detalle.costoUnitario),
          descripcion: detalle.descripcion,
        })),
      );

      // 2. Asiento inverso (se intercambian debe y haber; el original queda por auditoría).
      await this.asientosService.crearAsiento(manager, {
        empresaId,
        glosa: `Anulación de compra ${compra.numeroFactura} — ${compra.proveedor?.nombre ?? ''}`.trim(),
        referencia: compra.numeroFactura,
        detalles: detallesInversos,
      });

      // 3. Compra de contado: el dinero vuelve a la caja.
      if (compra.tipoPago === TipoPagoCompra.CONTADO && compra.cuentaFinancieraId) {
        const cuenta = await this.movimientosFinancieros.bloquearCuenta(
          manager,
          empresaId,
          compra.cuentaFinancieraId,
        );
        const enCaja = await this.movimientosFinancieros.convertir(
          Number(compra.total),
          compra.moneda,
          cuenta.moneda,
        );
        await this.movimientosFinancieros.actualizarSaldo(manager, cuenta, enCaja.monto);
      }

      compra.estado = EstadoCompra.ANULADA;
      compra.saldoPendiente = '0.00';
      return manager.save(compra);
    });
  }

  listar(empresaId: string, filtros: FiltroCompras = {}): Promise<Compra[]> {
    const where: FindOptionsWhere<Compra> = { empresaId };
    if (filtros.proveedorId) {
      where.proveedorId = filtros.proveedorId;
    }
    if (filtros.estado) {
      where.estado = filtros.estado;
    }
    if (filtros.desde || filtros.hasta) {
      where.fecha = Between(filtros.desde ?? '0000-01-01', filtros.hasta ?? '9999-12-31');
    }

    return this.comprasRepo.find({
      where,
      relations: { proveedor: true },
      order: { fecha: 'DESC', creadoEn: 'DESC' },
      take: 100,
    });
  }

  async obtenerPorId(empresaId: string, id: string): Promise<Compra> {
    return this.buscarCompra(empresaId, id, {
      proveedor: true,
      detalles: { producto: true, variante: true },
      pagos: { cuentaFinanciera: true },
      cuentaFinanciera: true,
      asiento: true,
    });
  }

  // ==================== INTERNOS ====================

  private async buscarCompra(
    empresaId: string,
    id: string,
    relations: FindOptionsRelations<Compra> = {},
  ): Promise<Compra> {
    const compra = await this.comprasRepo.findOne({
      where: { id, empresaId },
      relations,
    });
    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }
    return compra;
  }

  private async buscarProveedor(empresaId: string, proveedorId: string): Promise<Proveedor> {
    const proveedor = await this.dataSource
      .getRepository(Proveedor)
      .findOne({ where: { id: proveedorId, empresaId } });
    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado en este negocio');
    }
    if (!proveedor.activo) {
      throw new BadRequestException(`El proveedor "${proveedor.nombre}" está inactivo`);
    }
    return proveedor;
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
        `Falta la cuenta ${codigo} en el plan de cuentas de este negocio; crea esa cuenta antes de registrar compras`,
      );
    }
    return cuenta;
  }

  private validarLineas(detalles: LineaCompraDto[]): LineaValidada[] {
    return detalles.map((linea) => {
      if (!Number.isInteger(linea.cantidad)) {
        throw new BadRequestException(
          `La cantidad de la línea "${linea.descripcion}" debe ser un número entero`,
        );
      }
      const subtotal = this.movimientosFinancieros.redondear(linea.cantidad * linea.costoUnitario);
      if (subtotal <= 0) {
        throw new BadRequestException(
          `La línea "${linea.descripcion}" debe tener un subtotal mayor a 0`,
        );
      }
      return {
        productoId: linea.productoId,
        varianteId: linea.varianteId,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        costoUnitario: linea.costoUnitario,
        subtotal,
      };
    });
  }

  private hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Detecta el choque con la restricción UNIQUE (empresa, proveedor, factura). */
  private esFacturaDuplicada(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      String((error as QueryFailedError).driverError).includes(
        'UQ_compras_empresa_proveedor_factura',
      )
    );
  }
}
