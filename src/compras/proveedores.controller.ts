import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { EmpresaActivaGuard } from '../empresa/guards/empresa-activa.guard.js';
import { EmpresaActual } from '../common/decorators/empresa-actual.decorator.js';
import { ProveedoresService } from './services/proveedores.service.js';
import { CrearProveedorDto, ActualizarProveedorDto } from './dto/proveedor.dto.js';

@ApiTags('Compras - Proveedores')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, EmpresaActivaGuard)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un proveedor en el negocio activo' })
  @ApiResponse({ status: 201, description: 'Proveedor creado' })
  @ApiResponse({ status: 409, description: 'Ya existe un proveedor con ese RIF en el negocio' })
  crear(@EmpresaActual() empresaId: string, @Body() dto: CrearProveedorDto) {
    return this.proveedoresService.crear(empresaId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar los proveedores del negocio activo' })
  @ApiQuery({ name: 'inactivos', required: false, description: 'Incluir proveedores desactivados' })
  @ApiResponse({ status: 200, description: 'Lista de proveedores ordenada por nombre' })
  listar(@EmpresaActual() empresaId: string, @Query('inactivos') inactivos?: string) {
    return this.proveedoresService.listar(empresaId, inactivos !== 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un proveedor por id' })
  @ApiParam({ name: 'id', description: 'UUID del proveedor' })
  @ApiResponse({ status: 200, description: 'Proveedor encontrado' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado en este negocio' })
  obtenerPorId(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.proveedoresService.obtenerPorId(empresaId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un proveedor del negocio activo' })
  @ApiParam({ name: 'id', description: 'UUID del proveedor' })
  @ApiResponse({ status: 200, description: 'Proveedor actualizado' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado en este negocio' })
  @ApiResponse({ status: 409, description: 'El nuevo RIF ya existe en el negocio' })
  actualizar(
    @EmpresaActual() empresaId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarProveedorDto,
  ) {
    return this.proveedoresService.actualizar(empresaId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar un proveedor (baja lógica; el historial se conserva)' })
  @ApiParam({ name: 'id', description: 'UUID del proveedor' })
  @ApiResponse({ status: 200, description: 'Proveedor desactivado' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado en este negocio' })
  desactivar(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.proveedoresService.desactivar(empresaId, id);
  }
}
