import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CuentaFinanciera } from '../entities/cuenta-financiera.entity.js';
import { PlanCuentasService } from '../../contabilidad/services/plan-cuentas.service.js';
import { AsientosService } from '../../contabilidad/services/asientos.service.js';
import { TipoCambioService } from '../../tipo-cambio/services/tipo-cambio.service.js';
import { CrearCuentaFinancieraDto } from '../dto/cajas.dto.js';

@Injectable()
export class CuentasFinancierasService {
  constructor(
    @InjectRepository(CuentaFinanciera)
    private readonly cuentasRepo: Repository<CuentaFinanciera>,
    private readonly planCuentasService: PlanCuentasService,
    private readonly dataSource: DataSource,
    private readonly asientosService: AsientosService,
    private readonly tipoCambioService: TipoCambioService,
  ) {}

  async crearCuentaFinanciera(
    empresaId: string,
    dto: CrearCuentaFinancieraDto,
  ): Promise<CuentaFinanciera> {
    // obtenerCuentaPorId ya acota a la empresa: una cuenta contable ajena da 404.
    const cuentaContable = await this.planCuentasService.obtenerCuentaPorId(
      empresaId,
      dto.cuentaContableId,
    );
    if (!cuentaContable.esTransaccional) {
      throw new BadRequestException(
        `La cuenta contable "${cuentaContable.codigo}" no es transaccional; vincula una cuenta que acepte movimientos`,
      );
    }

    const saldoInicial = dto.saldoInicial ?? 0;
    const cuentaAperturaId = dto.cuentaAperturaId;

    if (saldoInicial > 0) {
      if (!cuentaAperturaId) {
        throw new BadRequestException(
          'Un saldoInicial mayor a 0 requiere cuentaAperturaId para generar el asiento de apertura (Debe caja / Haber la cuenta indicada); o crea la cuenta con saldoInicial 0',
        );
      }
      if (cuentaAperturaId === dto.cuentaContableId) {
        throw new BadRequestException(
          'La cuenta de apertura no puede ser la misma cuenta contable de la caja',
        );
      }
      const cuentaApertura = await this.planCuentasService.obtenerCuentaPorId(
        empresaId,
        cuentaAperturaId,
      );
      if (!cuentaApertura.esTransaccional) {
        throw new BadRequestException(
          `La cuenta de apertura "${cuentaApertura.codigo}" no es transaccional; usa una cuenta que acepte movimientos`,
        );
      }
      const vinculada = await this.cuentasRepo.count({
        where: { cuentaContableId: cuentaAperturaId, empresaId },
      });
      if (vinculada > 0) {
        throw new BadRequestException(
          'La cuenta de apertura está vinculada a una caja o banco; usa una cuenta de patrimonio (ej: 3.1 Capital)',
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const cuenta = manager.create(CuentaFinanciera, {
        empresaId,
        nombre: dto.nombre,
        tipo: dto.tipo,
        moneda: dto.moneda ?? 'BOB',
        activo: dto.activo ?? true,
        saldo: saldoInicial.toFixed(2),
        cuentaContableId: dto.cuentaContableId,
      });
      const guardada = await manager.save(cuenta);

      if (saldoInicial > 0 && cuentaAperturaId) {
        // El asiento siempre va en moneda base (BOB): si la cuenta es USD,
        // se convierte el saldo inicial con la tasa del día.
        let montoApertura = saldoInicial;
        if ((dto.moneda ?? 'BOB') !== 'BOB') {
          const tipoCambio = await this.tipoCambioService.obtenerTasaDelDia();
          montoApertura = Math.round(saldoInicial * Number(tipoCambio.tasa) * 100) / 100;
        }
        await this.asientosService.crearAsiento(manager, {
          empresaId,
          glosa: `Apertura de ${dto.nombre}`,
          detalles: [
            { cuentaId: dto.cuentaContableId, debe: montoApertura, haber: 0 },
            { cuentaId: cuentaAperturaId, debe: 0, haber: montoApertura },
          ],
        });
      }

      return guardada;
    });
  }

  async listarCuentasFinancieras(empresaId: string): Promise<CuentaFinanciera[]> {
    return this.cuentasRepo.find({
      where: { empresaId },
      relations: { cuentaContable: true },
      order: { nombre: 'ASC' },
    });
  }

  async obtenerSaldoActual(
    empresaId: string,
    id: string,
  ): Promise<{ id: string; nombre: string; moneda: string; saldo: number }> {
    const cuenta = await this.cuentasRepo.findOne({ where: { id, empresaId } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta financiera ${id} no encontrada`);
    }
    return {
      id: cuenta.id,
      nombre: cuenta.nombre,
      moneda: cuenta.moneda,
      saldo: Number(cuenta.saldo),
    };
  }

  async obtenerCuentaPorId(empresaId: string, id: string): Promise<CuentaFinanciera> {
    const cuenta = await this.cuentasRepo.findOne({ where: { id, empresaId } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta financiera ${id} no encontrada`);
    }
    return cuenta;
  }
}
