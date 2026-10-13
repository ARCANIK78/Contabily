import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Proveedor } from '../entities/proveedor.entity.js';
import { CrearProveedorDto, ActualizarProveedorDto } from '../dto/proveedor.dto.js';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor)
    private readonly proveedoresRepo: Repository<Proveedor>,
  ) {}

  async crear(empresaId: string, dto: CrearProveedorDto): Promise<Proveedor> {
    const existente = await this.proveedoresRepo.findOne({
      where: { empresaId, rif: dto.rif },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un proveedor con el RIF "${dto.rif}" en este negocio`);
    }

    const proveedor = this.proveedoresRepo.create({
      nombre: dto.nombre,
      rif: dto.rif,
      contacto: dto.contacto ?? null,
      telefono: dto.telefono ?? null,
      email: dto.email ?? null,
      direccion: dto.direccion ?? null,
      ...(dto.condicionesPago ? { condicionesPago: dto.condicionesPago } : {}),
      notas: dto.notas ?? null,
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      empresaId,
    });
    return this.proveedoresRepo.save(proveedor);
  }

  listar(empresaId: string, soloActivos = true): Promise<Proveedor[]> {
    return this.proveedoresRepo.find({
      where: { empresaId, ...(soloActivos ? { activo: true } : {}) },
      order: { nombre: 'ASC' },
    });
  }

  async obtenerPorId(empresaId: string, id: string): Promise<Proveedor> {
    const proveedor = await this.proveedoresRepo.findOne({ where: { id, empresaId } });
    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    return proveedor;
  }

  async actualizar(
    empresaId: string,
    id: string,
    dto: ActualizarProveedorDto,
  ): Promise<Proveedor> {
    const proveedor = await this.obtenerPorId(empresaId, id);

    if (dto.rif && dto.rif !== proveedor.rif) {
      const existe = await this.proveedoresRepo.findOne({
        where: { empresaId, rif: dto.rif },
      });
      if (existe) {
        throw new ConflictException(`Ya existe un proveedor con el RIF "${dto.rif}" en este negocio`);
      }
    }

    Object.assign(proveedor, dto);
    return this.proveedoresRepo.save(proveedor);
  }

  /** Baja lógica: el historial de compras conserva al proveedor. */
  async desactivar(empresaId: string, id: string): Promise<Proveedor> {
    const proveedor = await this.obtenerPorId(empresaId, id);
    proveedor.activo = false;
    return this.proveedoresRepo.save(proveedor);
  }
}
