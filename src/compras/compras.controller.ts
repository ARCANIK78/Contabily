import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { EmpresaActivaGuard } from '../empresa/guards/empresa-activa.guard.js';
import { EmpresaActual } from '../common/decorators/empresa-actual.decorator.js';
import { ComprasService } from './services/compras.service.js';
import { EstadoCompra } from './entities/compra.entity.js';
import { CrearCompraDto, PagoCompraDto } from './dto/compra.dto.js';

@ApiTags('Compras')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, EmpresaActivaGuard)
@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  @ApiOperation({
    summary:
      'Registrar una compra y recibir mercadería en una transacción (asiento contable + stock + costo)',
  })
  @ApiResponse({ status: 201, description: 'Compra registrada, mercadería recibida y asiento generado' })
  @ApiResponse({ status: 400, description: 'Contado sin cuentaFinancieraId, saldo insuficiente o cuenta contable faltante' })
  @ApiResponse({ status: 404, description: 'Proveedor, caja o producto no encontrados en este negocio' })
  @ApiResponse({ status: 409, description: 'Número de factura ya registrado para ese proveedor' })
  crear(@EmpresaActual() empresaId: string, @Body() dto: CrearCompraDto) {
    return this.comprasService.crear(empresaId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar las compras del negocio activo con filtros opcionales' })
  @ApiQuery({ name: 'proveedorId', required: false, description: 'UUID del proveedor' })
  @ApiQuery({ name: 'estado', required: false, enum: EstadoCompra, description: 'RECIBIDA, PAGADA o ANULADA' })
  @ApiQuery({ name: 'desde', required: false, description: 'Fecha inicial YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha final YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Últimas 100 compras' })
  listar(
    @EmpresaActual() empresaId: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('estado') estado?: EstadoCompra,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.comprasService.listar(empresaId, { proveedorId, estado, desde, hasta });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una compra con sus líneas, pagos y asiento' })
  @ApiParam({ name: 'id', description: 'UUID de la compra' })
  @ApiResponse({ status: 200, description: 'Compra encontrada' })
  @ApiResponse({ status: 404, description: 'Compra no encontrada en este negocio' })
  obtenerPorId(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.comprasService.obtenerPorId(empresaId, id);
  }

  @Post(':id/pagos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registrar un pago parcial o total a la cuenta por pagar de la compra (el monto va en la moneda de la factura)',
  })
  @ApiParam({ name: 'id', description: 'UUID de la compra' })
  @ApiResponse({ status: 200, description: 'Pago registrado; la compra pasa a PAGADA si se cancela el saldo' })
  @ApiResponse({ status: 400, description: 'Compra anulada o pagada, o el pago excede el saldo pendiente' })
  @ApiResponse({ status: 404, description: 'Compra o caja no encontradas en este negocio' })
  registrarPago(
    @EmpresaActual() empresaId: string,
    @Param('id') id: string,
    @Body() dto: PagoCompraDto,
  ) {
    return this.comprasService.registrarPago(empresaId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Anular una compra sin pagos (revierte stock, asiento inverso y devuelve el dinero si fue de contado)',
  })
  @ApiParam({ name: 'id', description: 'UUID de la compra' })
  @ApiResponse({ status: 200, description: 'Compra anulada' })
  @ApiResponse({ status: 400, description: 'Ya anulada o con pagos registrados' })
  @ApiResponse({ status: 404, description: 'Compra no encontrada en este negocio' })
  anular(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.comprasService.anular(empresaId, id);
  }
}
