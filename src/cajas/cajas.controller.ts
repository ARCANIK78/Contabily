import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { EmpresaActivaGuard } from '../empresa/guards/empresa-activa.guard.js';
import { EmpresaActual } from '../common/decorators/empresa-actual.decorator.js';
import { CuentasFinancierasService } from './services/cuentas-financieras.service.js';
import { TransaccionesService } from './services/transacciones.service.js';
import { TipoTransaccion } from './entities/transaccion.entity.js';
import {
  CrearCuentaFinancieraDto,
  RegistrarMovimientoDto,
  TransferenciaDto,
} from './dto/cajas.dto.js';

@ApiTags('Cajas y Bancos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, EmpresaActivaGuard)
@Controller('cajas')
export class CajasController {
  constructor(
    private readonly cuentasFinancierasService: CuentasFinancierasService,
    private readonly transaccionesService: TransaccionesService,
  ) {}

  // ==================== CUENTAS FINANCIERAS ====================

  @Post('cuentas')
  @ApiOperation({
    summary: 'Crear una caja o cuenta bancaria en el negocio activo (vinculada al plan de cuentas)',
  })
  @ApiResponse({ status: 201, description: 'Cuenta financiera creada' })
  @ApiResponse({ status: 400, description: 'La cuenta contable no existe, no es transaccional, o falta cuentaAperturaId con saldoInicial > 0' })
  @ApiResponse({ status: 404, description: 'Cuenta contable no encontrada en este negocio' })
  crearCuenta(@EmpresaActual() empresaId: string, @Body() dto: CrearCuentaFinancieraDto) {
    return this.cuentasFinancierasService.crearCuentaFinanciera(empresaId, dto);
  }

  @Get('cuentas')
  @ApiOperation({ summary: 'Listar cajas y bancos del negocio activo con sus saldos actuales' })
  @ApiResponse({ status: 200, description: 'Lista de cuentas financieras' })
  listarCuentas(@EmpresaActual() empresaId: string) {
    return this.cuentasFinancierasService.listarCuentasFinancieras(empresaId);
  }

  @Get('cuentas/:id/saldo')
  @ApiOperation({ summary: 'Consultar el saldo actual de una caja o banco' })
  @ApiResponse({ status: 200, description: 'Saldo actual' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada en este negocio' })
  obtenerSaldo(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.cuentasFinancierasService.obtenerSaldoActual(empresaId, id);
  }

  // ==================== TRANSACCIONES ====================

  @Post('ingresos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar un ingreso en el negocio activo (suma saldo y genera asiento)' })
  @ApiResponse({ status: 200, description: 'Ingreso registrado con asiento equilibrado' })
  @ApiResponse({ status: 400, description: 'Cuenta contable no transaccional o vinculada a una caja' })
  registrarIngreso(@EmpresaActual() empresaId: string, @Body() dto: RegistrarMovimientoDto) {
    return this.transaccionesService.registrarIngreso(empresaId, dto);
  }

  @Post('egresos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar un egreso en el negocio activo (valida saldo y genera asiento)' })
  @ApiResponse({ status: 200, description: 'Egreso registrado con asiento equilibrado' })
  @ApiResponse({ status: 400, description: 'Saldo insuficiente, o cuenta contra vinculada a una caja' })
  registrarEgreso(@EmpresaActual() empresaId: string, @Body() dto: RegistrarMovimientoDto) {
    return this.transaccionesService.registrarEgreso(empresaId, dto);
  }

  @Post('transferencias')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transferir dinero entre cuentas del negocio activo (atómico)' })
  @ApiResponse({ status: 200, description: 'Transferencia realizada' })
  @ApiResponse({ status: 400, description: 'Saldo insuficiente o cuentas iguales' })
  realizarTransferencia(@EmpresaActual() empresaId: string, @Body() dto: TransferenciaDto) {
    return this.transaccionesService.realizarTransferencia(empresaId, dto);
  }

  @Get('transacciones')
  @ApiOperation({ summary: 'Historial de transacciones del negocio activo con filtros opcionales' })
  @ApiResponse({ status: 200, description: 'Últimas 100 transacciones' })
  listarTransacciones(
    @EmpresaActual() empresaId: string,
    @Query('cuentaId') cuentaId?: string,
    @Query('tipo') tipo?: TipoTransaccion,
  ) {
    return this.transaccionesService.listarTransacciones(empresaId, { cuentaId, tipo });
  }
}
