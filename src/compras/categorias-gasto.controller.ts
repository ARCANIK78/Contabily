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
import { GastosService } from './services/gastos.service.js';
import { CrearCategoriaGastoDto, ActualizarCategoriaGastoDto } from './dto/gasto.dto.js';

@ApiTags('Gastos - Categorías')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, EmpresaActivaGuard)
@Controller('gastos/categorias')
export class CategoriasGastoController {
  constructor(private readonly gastosService: GastosService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una categoría de gasto ligada a una cuenta contable (clase 5)' })
  @ApiResponse({ status: 201, description: 'Categoría creada' })
  @ApiResponse({ status: 400, description: 'La cuenta no es transaccional o está vinculada a una caja/banco' })
  @ApiResponse({ status: 404, description: 'Cuenta contable no encontrada en este negocio' })
  @ApiResponse({ status: 409, description: 'Ya existe una categoría con ese nombre en el negocio' })
  crear(@EmpresaActual() empresaId: string, @Body() dto: CrearCategoriaGastoDto) {
    return this.gastosService.crearCategoria(empresaId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar las categorías de gasto del negocio activo' })
  @ApiQuery({ name: 'inactivas', required: false, description: 'Incluir categorías desactivadas' })
  @ApiResponse({ status: 200, description: 'Lista de categorías con su cuenta contable' })
  listar(@EmpresaActual() empresaId: string, @Query('inactivas') inactivas?: string) {
    return this.gastosService.listarCategorias(empresaId, inactivas !== 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una categoría de gasto por id' })
  @ApiParam({ name: 'id', description: 'UUID de la categoría' })
  @ApiResponse({ status: 200, description: 'Categoría encontrada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada en este negocio' })
  obtenerPorId(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.gastosService.obtenerCategoriaPorId(empresaId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una categoría de gasto' })
  @ApiParam({ name: 'id', description: 'UUID de la categoría' })
  @ApiResponse({ status: 200, description: 'Categoría actualizada' })
  @ApiResponse({ status: 404, description: 'Categoría o cuenta no encontradas en este negocio' })
  @ApiResponse({ status: 409, description: 'Ya existe otra categoría con ese nombre' })
  actualizar(
    @EmpresaActual() empresaId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarCategoriaGastoDto,
  ) {
    return this.gastosService.actualizarCategoria(empresaId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar una categoría (baja lógica; el historial se conserva)' })
  @ApiParam({ name: 'id', description: 'UUID de la categoría' })
  @ApiResponse({ status: 200, description: 'Categoría desactivada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada en este negocio' })
  desactivar(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.gastosService.desactivarCategoria(empresaId, id);
  }
}
