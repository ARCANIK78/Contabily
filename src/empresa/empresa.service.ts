import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa, TipoNegocio, Moneda } from './entities/empresa.entity.js';
import { Usuario } from '../auth/entities/user.entity.js';
import { PlanCuentasService } from '../contabilidad/services/plan-cuentas.service.js';
import { GastosService } from '../compras/services/gastos.service.js';

export interface CrearEmpresaDto {
  nombre: string;
  razonSocial?: string;
  rif: string;
  direccionFiscal?: string;
  telefono?: string;
  email?: string;
  sitioWeb?: string;
  logoUrl?: string;
  tipo?: TipoNegocio;
  moneda?: Moneda;
  zonaHoraria?: string;
  locale?: string;
  configuracion?: Record<string, any>;
}

export interface ActualizarEmpresaDto {
  nombre?: string;
  razonSocial?: string;
  rif?: string;
  direccionFiscal?: string;
  telefono?: string;
  email?: string;
  sitioWeb?: string;
  logoUrl?: string;
  tipo?: TipoNegocio;
  moneda?: Moneda;
  zonaHoraria?: string;
  locale?: string;
  activo?: boolean;
  configuracion?: Record<string, any>;
}

@Injectable()
export class EmpresaService {
  private readonly logger = new Logger(EmpresaService.name);

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    private readonly planCuentasService: PlanCuentasService,
    private readonly gastosService: GastosService,
  ) {}

  async crear(usuario: Usuario, dto: CrearEmpresaDto): Promise<Empresa> {
    const existe = await this.empresaRepository.findOne({
      where: { usuarioId: usuario.id, rif: dto.rif },
    });
    if (existe) {
      throw new ConflictException('Ya existe una empresa con ese RIF para este usuario');
    }

    const empresa = this.empresaRepository.create({
      ...dto,
      usuarioId: usuario.id,
      usuario,
    });

    const guardada = await this.empresaRepository.save(empresa);

    // Cada negocio nace con su propio plan de cuentas (aislamiento + arranque inmediato).
    try {
      const cuentas = await this.planCuentasService.sembrarPlanBase(guardada.id);
      this.logger.log(
        `Negocio "${guardada.nombre}": plan de cuentas base sembrado con ${cuentas.length} cuentas`,
      );
    } catch (error) {
      // No se revierte la empresa: el plan puede sembrarse después con
      // POST /api/v1/contabilidad/plan-cuentas o al reiniciar.
      this.logger.error(
        `No se pudo sembrar el plan de cuentas de ${guardada.id}: ${(error as Error).message}`,
      );
    }

    // Cada negocio nace con sus categorías de gasto base (ligadas a la clase 5).
    try {
      const categorias = await this.gastosService.sembrarCategoriasBase(guardada.id);
      if (categorias.length > 0) {
        this.logger.log(
          `Negocio "${guardada.nombre}": ${categorias.length} categorías de gasto base sembradas`,
        );
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron sembrar las categorías de gasto de ${guardada.id}: ${(error as Error).message}`,
      );
    }

    this.logger.log(`Empresa creada: ${guardada.nombre} (${guardada.rif}) para usuario ${usuario.id}`);
    return guardada;
  }

  async buscarPorUsuario(usuarioId: string): Promise<Empresa[]> {
    return this.empresaRepository.find({
      where: { usuarioId, activo: true },
      order: { creadoEn: 'DESC' },
    });
  }

  async buscarPorId(id: string, usuarioId: string): Promise<Empresa> {
    const empresa = await this.empresaRepository.findOne({
      where: { id, usuarioId },
    });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return empresa;
  }

  async buscarPorRif(rif: string, usuarioId: string): Promise<Empresa | null> {
    return this.empresaRepository.findOne({ where: { rif, usuarioId } });
  }

  async actualizar(id: string, usuarioId: string, dto: ActualizarEmpresaDto): Promise<Empresa> {
    const empresa = await this.buscarPorId(id, usuarioId);

    if (dto.rif && dto.rif !== empresa.rif) {
      const existe = await this.empresaRepository.findOne({
        where: { usuarioId, rif: dto.rif },
      });
      if (existe) {
        throw new ConflictException('Ya existe una empresa con ese RIF');
      }
    }

    Object.assign(empresa, dto);
    const actualizada = await this.empresaRepository.save(empresa);
    this.logger.log(`Empresa actualizada: ${actualizada.nombre} (${actualizada.rif})`);
    return actualizada;
  }

  async desactivar(id: string, usuarioId: string): Promise<void> {
    const empresa = await this.buscarPorId(id, usuarioId);
    empresa.activo = false;
    await this.empresaRepository.save(empresa);
    this.logger.log(`Empresa desactivada: ${empresa.nombre}`);
  }

  async activar(id: string, usuarioId: string): Promise<void> {
    const empresa = await this.buscarPorId(id, usuarioId);
    empresa.activo = true;
    await this.empresaRepository.save(empresa);
    this.logger.log(`Empresa activada: ${empresa.nombre}`);
  }

  async obtenerEstadisticas(empresaId: string): Promise<{
    totalEmpresas: number;
    empresasActivas: number;
  }> {
    const [total, activas] = await Promise.all([
      this.empresaRepository.count({ where: { usuarioId: empresaId } }),
      this.empresaRepository.count({ where: { usuarioId: empresaId, activo: true } }),
    ]);
    return { totalEmpresas: total, empresasActivas: activas };
  }
}