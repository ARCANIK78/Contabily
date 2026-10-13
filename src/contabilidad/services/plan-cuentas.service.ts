import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { PlanDeCuenta } from '../entities/plan-de-cuenta.entity.js';
import { CuentaFinanciera } from '../../cajas/entities/cuenta-financiera.entity.js';
import { DetalleAsiento } from '../entities/detalle-asiento.entity.js';
import { CrearCuentaDto, ActualizarCuentaDto } from '../dto/plan-cuenta.dto.js';

export interface NodoArbol {
  id: string;
  codigo: string;
  nombre: string;
  esTransaccional: boolean;
  subCuentas: NodoArbol[];
}

/** Catálogo base que recibe cada negocio al crearse. Orden importa: padres antes que hijos. */
export const PLAN_BASE: ReadonlyArray<{
  codigo: string;
  nombre: string;
  transaccional?: boolean;
}> = [
  { codigo: '1', nombre: 'Activo' },
  { codigo: '1.1', nombre: 'Disponible' },
  { codigo: '1.1.1', nombre: 'Caja y Bancos' },
  { codigo: '1.1.1.01', nombre: 'Caja General', transaccional: true },
  { codigo: '1.1.1.02', nombre: 'Bancos', transaccional: true },
  { codigo: '1.1.2', nombre: 'Cuentas por Cobrar' },
  { codigo: '1.1.2.01', nombre: 'Clientes nacionales', transaccional: true },
  { codigo: '1.1.3', nombre: 'Inventarios' },
  { codigo: '1.1.3.01', nombre: 'Mercaderías', transaccional: true },
  { codigo: '1.2', nombre: 'Activo No Corriente' },
  { codigo: '1.2.1', nombre: 'Propiedad, Planta y Equipo' },
  { codigo: '1.2.1.01', nombre: 'Mobiliario y Equipo', transaccional: true },

  { codigo: '2', nombre: 'Pasivo' },
  { codigo: '2.1', nombre: 'Pasivo Corriente' },
  { codigo: '2.1.1', nombre: 'Proveedores' },
  { codigo: '2.1.1.01', nombre: 'Proveedores nacionales', transaccional: true },
  { codigo: '2.1.2', nombre: 'Impuestos por pagar' },
  { codigo: '2.1.2.01', nombre: 'IVA por pagar', transaccional: true },
  { codigo: '2.1.3', nombre: 'Remuneraciones por pagar' },
  { codigo: '2.1.3.01', nombre: 'Sueldos por pagar', transaccional: true },
  { codigo: '2.2', nombre: 'Pasivo No Corriente' },
  { codigo: '2.2.1', nombre: 'Deudas a Largo Plazo' },
  { codigo: '2.2.1.01', nombre: 'Préstamos bancarios', transaccional: true },

  { codigo: '3', nombre: 'Patrimonio' },
  { codigo: '3.1', nombre: 'Capital' },
  { codigo: '3.1.01', nombre: 'Capital', transaccional: true },
  { codigo: '3.1.02', nombre: 'Resultados Acumulados', transaccional: true },
  { codigo: '3.2', nombre: 'Resultados del Ejercicio' },
  { codigo: '3.2.01', nombre: 'Utilidad del Ejercicio', transaccional: true },

  { codigo: '4', nombre: 'Ingresos' },
  { codigo: '4.1', nombre: 'Ingresos Operativos' },
  { codigo: '4.1.01', nombre: 'Ingresos por Ventas', transaccional: true },
  { codigo: '4.1.02', nombre: 'Ingresos por Servicios', transaccional: true },
  { codigo: '4.2', nombre: 'Otros Ingresos' },
  { codigo: '4.2.01', nombre: 'Ingresos Financieros', transaccional: true },

  { codigo: '5', nombre: 'Gastos' },
  { codigo: '5.1', nombre: 'Gastos de Administración' },
  { codigo: '5.1.01', nombre: 'Alquileres', transaccional: true },
  { codigo: '5.1.02', nombre: 'Servicios Básicos', transaccional: true },
  { codigo: '5.1.03', nombre: 'Remuneraciones', transaccional: true },
  { codigo: '5.1.04', nombre: 'Gastos Varios', transaccional: true },
  { codigo: '5.2', nombre: 'Gastos de Venta' },
  { codigo: '5.2.01', nombre: 'Publicidad y Marketing', transaccional: true },
  { codigo: '5.3', nombre: 'Gastos Financieros' },
  { codigo: '5.3.01', nombre: 'Comisiones Bancarias', transaccional: true },

  { codigo: '6', nombre: 'Costos' },
  { codigo: '6.1', nombre: 'Costo de Ventas' },
  { codigo: '6.1.01', nombre: 'Costo de Mercadería Vendida', transaccional: true },
];

/** Cuenta de apertura recomendada al crear un negocio. */
export const CUENTA_APERTURA_DEFAULT = '3.1.01';

@Injectable()
export class PlanCuentasService {
  constructor(
    @InjectRepository(PlanDeCuenta)
    private readonly planCuentasRepo: Repository<PlanDeCuenta>,
    private readonly dataSource: DataSource,
  ) {}

  async crearCuenta(empresaId: string, dto: CrearCuentaDto): Promise<PlanDeCuenta> {
    const existente = await this.planCuentasRepo.findOne({
      where: { codigo: dto.codigo, empresaId },
    });
    if (existente) {
      throw new ConflictException(`Ya existe una cuenta con el código "${dto.codigo}" en este negocio`);
    }

    await this.validarClaseRaiz(empresaId, dto.codigo);

    if (dto.cuentaPadreId) {
      await this.validarCuentaPadre(empresaId, dto.cuentaPadreId);
    }

    const cuenta = this.planCuentasRepo.create({
      codigo: dto.codigo,
      nombre: dto.nombre,
      cuentaPadreId: dto.cuentaPadreId ?? null,
      esTransaccional: dto.esTransaccional ?? false,
      empresaId,
    });

    return this.planCuentasRepo.save(cuenta);
  }

  obtenerCuentas(empresaId: string): Promise<PlanDeCuenta[]> {
    return this.planCuentasRepo.find({ where: { empresaId }, order: { codigo: 'ASC' } });
  }

  async obtenerArbolCuentas(empresaId: string): Promise<NodoArbol[]> {
    const cuentas = await this.planCuentasRepo.find({
      where: { empresaId },
      order: { codigo: 'ASC' },
    });

    const porId = new Map<string, NodoArbol>();
    for (const cuenta of cuentas) {
      porId.set(cuenta.id, {
        id: cuenta.id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        esTransaccional: cuenta.esTransaccional,
        subCuentas: [],
      });
    }

    const raices: NodoArbol[] = [];
    for (const cuenta of cuentas) {
      const nodo = porId.get(cuenta.id)!;
      const padre = cuenta.cuentaPadreId ? porId.get(cuenta.cuentaPadreId) : undefined;
      if (padre) {
        padre.subCuentas.push(nodo);
      } else {
        raices.push(nodo);
      }
    }

    return raices;
  }

  /**
   * Busca una cuenta dentro de la empresa dada. Si no pertenece a esa empresa
   * devuelve 404 (no 403) para no revelar la existencia de cuentas ajenas.
   */
  async obtenerCuentaPorId(empresaId: string, id: string): Promise<PlanDeCuenta> {
    const cuenta = await this.planCuentasRepo.findOne({ where: { id, empresaId } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta contable ${id} no encontrada`);
    }
    return cuenta;
  }

  async actualizarCuenta(
    empresaId: string,
    id: string,
    dto: ActualizarCuentaDto,
  ): Promise<PlanDeCuenta> {
    const cuenta = await this.obtenerCuentaPorId(empresaId, id);

    if (dto.codigo && dto.codigo !== cuenta.codigo) {
      const duplicada = await this.planCuentasRepo.findOne({
        where: { codigo: dto.codigo, empresaId },
      });
      if (duplicada) {
        throw new ConflictException(`Ya existe una cuenta con el código "${dto.codigo}"`);
      }
      await this.validarClaseRaiz(empresaId, dto.codigo);
    }

    if (dto.cuentaPadreId) {
      if (dto.cuentaPadreId === id) {
        throw new BadRequestException('Una cuenta no puede ser padre de sí misma');
      }
      await this.validarCuentaPadre(empresaId, dto.cuentaPadreId);
      await this.validarSinCiclo(empresaId, id, dto.cuentaPadreId);
    }

    Object.assign(cuenta, dto);
    return this.planCuentasRepo.save(cuenta);
  }

  async eliminarCuenta(empresaId: string, id: string): Promise<{ eliminada: boolean }> {
    const cuenta = await this.obtenerCuentaPorId(empresaId, id);

    const subCuentas = await this.planCuentasRepo.count({
      where: { cuentaPadreId: id, empresaId },
    });
    if (subCuentas > 0) {
      throw new BadRequestException('No se puede eliminar: la cuenta tiene subcuentas asociadas');
    }

    const cuentasFinancieras = await this.dataSource
      .getRepository(CuentaFinanciera)
      .count({ where: { cuentaContableId: id, empresaId } });
    if (cuentasFinancieras > 0) {
      throw new BadRequestException('No se puede eliminar: la cuenta tiene cajas o bancos asociados');
    }

    const detalles = await this.dataSource
      .getRepository(DetalleAsiento)
      .count({ where: { cuentaId: id } });
    if (detalles > 0) {
      throw new BadRequestException('No se puede eliminar: la cuenta tiene asientos contables asociados');
    }

    await this.planCuentasRepo.remove(cuenta);
    return { eliminada: true };
  }

  private async validarCuentaPadre(empresaId: string, cuentaPadreId: string): Promise<void> {
    const padre = await this.planCuentasRepo.findOne({
      where: { id: cuentaPadreId, empresaId },
    });
    if (!padre) {
      throw new BadRequestException(`La cuenta padre ${cuentaPadreId} no existe`);
    }
  }

  /**
   * Impide ciclos: el candidato a padre no puede ser (ni tener entre sus
   * ascendientes) a la cuenta que se está actualizando, o el árbol dejaría
   * de mostrar ambas ramas.
   */
  private async validarSinCiclo(
    empresaId: string,
    id: string,
    cuentaPadreId: string,
  ): Promise<void> {
    let actual: string | null = cuentaPadreId;
    let pasos = 0;
    while (actual && pasos < 1000) {
      if (actual === id) {
        throw new BadRequestException(
          'No se puede asignar: la cuenta padre es descendiente de esta cuenta (crearía un ciclo)',
        );
      }
      const nodo: PlanDeCuenta | null = await this.planCuentasRepo.findOne({
        where: { id: actual, empresaId },
      });
      actual = nodo?.cuentaPadreId ?? null;
      pasos += 1;
    }
  }

  private async validarClaseRaiz(empresaId: string, codigo: string): Promise<void> {
    if (!codigo.includes('.')) {
      return;
    }
    const claseRaiz = codigo.split('.')[0];
    const clase = await this.planCuentasRepo.findOne({ where: { codigo: claseRaiz, empresaId } });
    if (!clase) {
      throw new BadRequestException(
        `Primero debe existir la clase "${claseRaiz}" — crea una cuenta con código "${claseRaiz}" antes de crear "${codigo}"`,
      );
    }
  }

  /**
   * Siembra el catálogo estándar de cuentas para un negocio recién creado.
   * Idempotente: si el negocio ya tiene cuentas, no hace nada.
   *
   * Devuelve las cuentas creadas (vacío si ya existían).
   */
  async sembrarPlanBase(empresaId: string): Promise<PlanDeCuenta[]> {
    const total = await this.planCuentasRepo.count({ where: { empresaId } });
    if (total > 0) {
      return [];
    }

    // Los padres deben guardarse primero para poder referenciar sus ids.
    const guardadas: PlanDeCuenta[] = [];
    const idPorCodigo = new Map<string, string>();

    for (const nodo of PLAN_BASE) {
      const codigoPadre = nodo.codigo.includes('.')
        ? nodo.codigo.slice(0, nodo.codigo.lastIndexOf('.'))
        : null;

      const cuenta = this.planCuentasRepo.create({
        codigo: nodo.codigo,
        nombre: nodo.nombre,
        cuentaPadreId: codigoPadre ? (idPorCodigo.get(codigoPadre) ?? null) : null,
        esTransaccional: nodo.transaccional ?? false,
        empresaId,
      });

      const guardada = await this.planCuentasRepo.save(cuenta);
      idPorCodigo.set(guardada.codigo, guardada.id);
      guardadas.push(guardada);
    }

    return guardadas;
  }
}
