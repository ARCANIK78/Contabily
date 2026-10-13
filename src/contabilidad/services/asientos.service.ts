import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { AsientoContable, EstadoAsiento } from '../entities/asiento-contable.entity.js';
import { DetalleAsiento } from '../entities/detalle-asiento.entity.js';
import { PlanDeCuenta } from '../entities/plan-de-cuenta.entity.js';
import { Empresa } from '../../empresa/entities/empresa.entity.js';
import { CrearAsientoManualDto, FiltroLibroDiarioDto } from '../dto/asiento.dto.js';

export interface DetalleAsientoInput {
  cuentaId: string;
  debe: number;
  haber: number;
}

export interface CrearAsientoInput {
  empresaId: string;
  fecha?: Date;
  glosa: string;
  referencia?: string;
  /** Quién lo genera. Null en flujos internos sin usuario de sesión. */
  usuarioId?: string | null;
  detalles: DetalleAsientoInput[];
}

export interface PaginaAsientos {
  data: AsientoContable[];
  total: number;
}

@Injectable()
export class AsientosService {
  constructor(
    @InjectRepository(AsientoContable)
    private readonly asientosRepo: Repository<AsientoContable>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crea un asiento con sus detalles dentro de la transacción (EntityManager)
   * que le pase el llamador. Valida el principio de partida doble, que todas
   * las cuentas pertenezcan al mismo negocio y que sean transaccionales.
   *
   * Asigna el correlativo del negocio con un UPDATE ... RETURNING sobre
   * `empresas`: el UPDATE bloquea la fila del tenant, de modo que dos asientos
   * simultáneos no pueden leer el mismo MAX y duplicar el número.
   */
  async crearAsiento(manager: EntityManager, input: CrearAsientoInput): Promise<AsientoContable> {
    if (input.detalles.length === 0) {
      throw new BadRequestException('El asiento debe tener al menos un detalle');
    }

    const totalDebe = input.detalles.reduce((suma, d) => suma + Number(d.debe ?? 0), 0);
    const totalHaber = input.detalles.reduce((suma, d) => suma + Number(d.haber ?? 0), 0);

    if (Math.abs(totalDebe - totalHaber) > 0.005) {
      throw new BadRequestException(
        `El asiento no cuadra: debe ${totalDebe.toFixed(2)} ≠ haber ${totalHaber.toFixed(2)}`,
      );
    }

    if (totalDebe <= 0) {
      throw new BadRequestException('El asiento debe tener monto mayor a 0');
    }

    await this.validarCuentasDelAsiento(manager, input);

    const asiento = manager.create(AsientoContable, {
      empresaId: input.empresaId,
      numero: await this.reservarCorrelativo(manager, input.empresaId),
      fecha: input.fecha ?? new Date(),
      glosa: input.glosa,
      referencia: input.referencia ?? null,
      estado: EstadoAsiento.CONFIRMADO,
      usuarioId: input.usuarioId ?? null,
      detalles: input.detalles.map((d) =>
        manager.create(DetalleAsiento, {
          cuentaId: d.cuentaId,
          debe: Number(d.debe ?? 0).toFixed(2),
          haber: Number(d.haber ?? 0).toFixed(2),
        }),
      ),
    });

    return manager.save(asiento);
  }

  /**
   * Libro diario paginado.
   *
   * Devuelve los asientos con su `estado` a la vista, incluidos los anulados:
   * un asiento anulado forma parte del libro (fue registrado y luego anulado),
   * y ocultarlo dejaría huecos en la numeración correlativa. Quien quiera
   * filtrar pasa `estado=CONFIRMADO`.
   *
   * Ojo, esto NO es lo mismo que los saldos: SaldosService sí excluye los
   * anulados por completo, porque un anulado no debe mover dinero.
   */
  async obtenerAsientos(empresaId: string, filtro: FiltroLibroDiarioDto = {}): Promise<PaginaAsientos> {
    const pagina = filtro.pagina ?? 1;
    const limite = filtro.limite ?? 20;

    const query = this.asientosRepo
      .createQueryBuilder('asiento')
      .leftJoinAndSelect('asiento.detalles', 'detalle')
      .leftJoinAndSelect('detalle.cuenta', 'cuenta')
      .where('asiento.empresaId = :empresaId', { empresaId })
      .orderBy('asiento.fecha', 'DESC')
      .addOrderBy('asiento.creadoEn', 'DESC')
      .addOrderBy('detalle.id', 'ASC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (filtro.estado) {
      query.andWhere('asiento.estado = :estado', { estado: filtro.estado });
    }

    if (filtro.fechaDesde) {
      query.andWhere('asiento.fecha >= :fechaDesde', {
        fechaDesde: this.inicioDelDia(filtro.fechaDesde),
      });
    }

    if (filtro.fechaHasta) {
      query.andWhere('asiento.fecha < :fechaHasta', {
        fechaHasta: this.diaSiguiente(filtro.fechaHasta),
      });
    }

    if (filtro.buscar) {
      query.andWhere('(asiento.glosa ILIKE :buscar OR asiento.referencia ILIKE :buscar)', {
        buscar: `%${filtro.buscar}%`,
      });
    }

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  /** Detalle de un asiento con sus líneas y cuentas. */
  async obtenerAsientoPorId(empresaId: string, id: string): Promise<AsientoContable> {
    const asiento = await this.asientosRepo.findOne({
      where: { id, empresaId },
      relations: { detalles: { cuenta: true } },
    });
    if (!asiento) {
      throw new NotFoundException(`Asiento ${id} no encontrado`);
    }
    return asiento;
  }

  /**
   * Anulación lógica: el libro diario no se edita ni se borra, se anula. Los
   * saldos dejan de contar el asiento porque SaldosService filtra por estado.
   */
  async anularAsiento(empresaId: string, id: string): Promise<AsientoContable> {
    const asiento = await this.obtenerAsientoPorId(empresaId, id);

    if (asiento.estado === EstadoAsiento.ANULADO) {
      throw new ConflictException(`El asiento N° ${asiento.numero ?? id} ya está anulado`);
    }

    asiento.estado = EstadoAsiento.ANULADO;
    return this.asientosRepo.save(asiento);
  }

  /** Punto de entrada del asiento manual que se registra desde el frontend. */
  async crearAsientoManual(
    empresaId: string,
    usuarioId: string | null,
    dto: CrearAsientoManualDto,
  ): Promise<AsientoContable> {
    return this.dataSource.transaction(async (manager) =>
      this.crearAsiento(manager, {
        empresaId,
        usuarioId,
        // Sin hora: si no, dos asientos del mismo día se ordenarían por el
        // instante de creación y el libro diario quedaría desordenado.
        fecha: dto.fecha ? new Date(`${dto.fecha}T00:00:00.000Z`) : new Date(),
        glosa: dto.glosa,
        referencia: dto.referencia,
        detalles: dto.detalles,
      }),
    );
  }

  /**
   * Reserva el siguiente número del negocio. El UPDATE bloquea la fila de la
   * empresa dentro de la transacción abierta, así que la operación es atómica
   * aunque haya dos asientos creándose a la vez.
   */
  private async reservarCorrelativo(manager: EntityManager, empresaId: string): Promise<number> {
    const resultado = await manager
      .getRepository(Empresa)
      .createQueryBuilder()
      .update(Empresa)
      .set({ secuenciaAsientos: () => 'secuencia_asientos + 1' })
      .where('id = :empresaId', { empresaId })
      .returning('secuencia_asientos')
      .execute();

    const numero = resultado.raw?.[0]?.secuencia_asientos;
    if (numero === undefined || numero === null) {
      throw new ConflictException('No se pudo asignar el número del asiento: el negocio no existe');
    }
    return Number(numero);
  }

  /**
   * Garantiza que ninguna línea del asiento apunte a una cuenta de otro negocio
   * (o a una inexistente). Sin esto, un cliente malicioso podría "hurgar" saldos
   * de otra empresa usando su UUID.
   *
   * Además exige cuentas transaccionales: si se permitiera escribir directamente
   * en una cuenta agrupadora, el roll-up del balance sumaría dos veces el mismo
   * dinero (su propio detalle y el de sus hijos).
   */
  private async validarCuentasDelAsiento(
    manager: EntityManager,
    input: CrearAsientoInput,
  ): Promise<void> {
    const idsUnicos = [...new Set(input.detalles.map((d) => d.cuentaId))];

    const cuentas = await manager.find(PlanDeCuenta, {
      where: { id: In(idsUnicos), empresaId: input.empresaId },
      select: { id: true, codigo: true, esTransaccional: true },
    });

    if (cuentas.length !== idsUnicos.length) {
      const encontradas = new Set(cuentas.map((c) => c.id));
      const ajenas = idsUnicos.filter((id) => !encontradas.has(id));
      throw new NotFoundException(
        `Las cuentas ${ajenas.join(', ')} no existen en este negocio`,
      );
    }

    const agrupadoras = cuentas.filter((c) => !c.esTransaccional);
    if (agrupadoras.length > 0) {
      const codigos = agrupadoras.map((c) => c.codigo).join(', ');
      throw new BadRequestException(
        `Las cuentas ${codigos} son agrupadoras; los asientos solo pueden escribirse en cuentas transaccionales (las hojas del plan)`,
      );
    }
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
