import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { EmpresaActivaGuard } from '../empresa/guards/empresa-activa.guard.js';
import { EmpresaActual } from '../common/decorators/empresa-actual.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { GastosService } from './services/gastos.service.js';
import { CrearGastoDto } from './dto/gasto.dto.js';

@ApiTags('Gastos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, EmpresaActivaGuard)
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Post()
  @ApiOperation({
    summary:
      'Registrar un gasto y pagarlo al instante (descuenta la caja/banco y genera el asiento con la cuenta de la categoría)',
  })
  @ApiResponse({ status: 201, description: 'Gasto registrado y pagado' })
  @ApiResponse({ status: 400, description: 'Categoría inactiva, saldo insuficiente o cuenta contable faltante' })
  @ApiResponse({ status: 404, description: 'Categoría o caja no encontradas en este negocio' })
  crear(
    @EmpresaActual() empresaId: string,
    @CurrentUser('id') usuarioId: string,
    @Body() dto: CrearGastoDto,
  ) {
    return this.gastosService.crear(empresaId, usuarioId ?? null, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar los gastos del negocio activo con filtros opcionales' })
  @ApiQuery({ name: 'categoriaId', required: false, description: 'UUID de la categoría' })
  @ApiQuery({ name: 'desde', required: false, description: 'Fecha inicial ISO 8601' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha final ISO 8601' })
  @ApiResponse({ status: 200, description: 'Últimos 100 gastos' })
  listar(
    @EmpresaActual() empresaId: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.gastosService.listar(empresaId, { categoriaId, desde, hasta });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un gasto por id' })
  @ApiParam({ name: 'id', description: 'UUID del gasto' })
  @ApiResponse({ status: 200, description: 'Gasto encontrado' })
  @ApiResponse({ status: 404, description: 'Gasto no encontrado en este negocio' })
  obtenerPorId(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.gastosService.obtenerPorId(empresaId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Anular un gasto (asiento inverso y el dinero vuelve a la caja)' })
  @ApiParam({ name: 'id', description: 'UUID del gasto' })
  @ApiResponse({ status: 200, description: 'Gasto anulado' })
  @ApiResponse({ status: 400, description: 'Ya estaba anulado o no tiene asiento asociado' })
  @ApiResponse({ status: 404, description: 'Gasto no encontrado en este negocio' })
  anular(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.gastosService.anular(empresaId, id);
  }
}
