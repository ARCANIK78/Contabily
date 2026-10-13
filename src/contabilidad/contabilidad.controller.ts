import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { EmpresaActivaGuard } from '../empresa/guards/empresa-activa.guard.js';
import { EmpresaActual } from '../common/decorators/empresa-actual.decorator.js';
import { PlanCuentasService } from './services/plan-cuentas.service.js';
import { AsientosService } from './services/asientos.service.js';
import { BalancesService } from './services/balances.service.js';
import { SaldosService } from './services/saldos.service.js';
import { CrearCuentaDto, ActualizarCuentaDto } from './dto/plan-cuenta.dto.js';
import {
  CrearAsientoManualDto,
  FiltroLibroDiarioDto,
  FiltroLibroMayorDto,
  FiltroPeriodoDto,
} from './dto/asiento.dto.js';

@ApiTags('Contabilidad')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, EmpresaActivaGuard)
@Controller('contabilidad')
export class ContabilidadController {
  constructor(
    private readonly planCuentasService: PlanCuentasService,
    private readonly asientosService: AsientosService,
    private readonly balancesService: BalancesService,
    private readonly saldosService: SaldosService,
  ) {}

  @Post('plan-cuentas')
  @ApiOperation({
    summary: 'Crear una cuenta contable en el negocio activo (valida código único por empresa)',
  })
  @ApiResponse({ status: 201, description: 'Cuenta creada' })
  @ApiResponse({ status: 409, description: 'Código ya registrado en este negocio' })
  @ApiResponse({ status: 409, description: 'Sin negocio activo: falta el header X-Empresa-Id' })
  crearCuenta(@EmpresaActual() empresaId: string, @Body() dto: CrearCuentaDto) {
    return this.planCuentasService.crearCuenta(empresaId, dto);
  }

  @Get('plan-cuentas')
  @ApiOperation({ summary: 'Listar las cuentas del plan del negocio activo (planas, por código)' })
  @ApiResponse({ status: 200, description: 'Lista plana de cuentas contables' })
  obtenerCuentas(@EmpresaActual() empresaId: string) {
    return this.planCuentasService.obtenerCuentas(empresaId);
  }

  @Get('plan-cuentas/arbol')
  @ApiOperation({ summary: 'Plan de cuentas del negocio activo como árbol jerárquico' })
  @ApiResponse({ status: 200, description: 'Árbol de cuentas (padres e hijos)' })
  obtenerArbol(@EmpresaActual() empresaId: string) {
    return this.planCuentasService.obtenerArbolCuentas(empresaId);
  }

  @Patch('plan-cuentas/:id')
  @ApiOperation({ summary: 'Actualizar una cuenta contable del negocio activo' })
  @ApiResponse({ status: 200, description: 'Cuenta actualizada' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada en este negocio' })
  actualizarCuenta(
    @EmpresaActual() empresaId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarCuentaDto,
  ) {
    return this.planCuentasService.actualizarCuenta(empresaId, id, dto);
  }

  @Delete('plan-cuentas/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una cuenta contable (valida que no tenga dependencias)' })
  @ApiResponse({ status: 200, description: 'Cuenta eliminada' })
  @ApiResponse({ status: 400, description: 'La cuenta tiene subcuentas, cajas o asientos asociados' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada en este negocio' })
  eliminarCuenta(@EmpresaActual() empresaId: string, @Param('id') id: string) {
    return this.planCuentasService.eliminarCuenta(empresaId, id);
  }

  @Get('plan-cuentas/con-saldos')
  @ApiOperation({
    summary: 'Plan de cuentas del negocio activo con el saldo ya acumulado',
    description:
      'Árbol del plan con debe/haber/saldo por cuenta. Acepta un período opcional; sin él devuelve el histórico.',
  })
  @ApiResponse({ status: 200, description: 'Plan con saldos, listo para poblar el frontend' })
  async obtenerPlanConSaldos(
    @EmpresaActual() empresaId: string,
    @Query() filtro: FiltroPeriodoDto,
  ) {
    return this.saldosService.obtenerPlanConSaldos(empresaId, filtro);
  }

  // ------------------------------------------------------------- libro diario

  @Get('asientos')
  @ApiOperation({
    summary: 'Libro diario del negocio activo: asientos con sus detalles',
    description:
      'Paginado y filtrable por período, estado y texto libre. Por defecto solo asientos confirmados.',
  })
  @ApiResponse({ status: 200, description: 'Página de asientos con partidas debe/haber' })
  obtenerAsientos(
    @EmpresaActual() empresaId: string,
    @Query() filtro: FiltroLibroDiarioDto,
  ) {
    return this.asientosService.obtenerAsientos(empresaId, filtro);
  }

  @Get('asientos/:id')
  @ApiOperation({ summary: 'Detalle de un asiento del libro diario' })
  @ApiResponse({ status: 200, description: 'Asiento con sus líneas y cuentas' })
  @ApiResponse({ status: 404, description: 'Asiento no encontrado en este negocio' })
  obtenerAsiento(
    @EmpresaActual() empresaId: string,
    @Param('id') id: string,
  ) {
    return this.asientosService.obtenerAsientoPorId(empresaId, id);
  }

  @Post('asientos/manual')
  @ApiOperation({
    summary: 'Registrar un asiento manual de ajuste',
    description:
      'Para movimientos que no nacen de cajas o compras (depreciaciones, ajustes, correcciones). Valida partida doble y que las cuentas sean transaccionales.',
  })
  @ApiResponse({ status: 201, description: 'Asiento creado con su correlativo' })
  @ApiResponse({ status: 400, description: 'No cuadra el debe/haber, o hay cuentas agrupadoras' })
  @ApiResponse({ status: 404, description: 'Cuenta inexistente en este negocio' })
  crearAsientoManual(
    @EmpresaActual() empresaId: string,
    @CurrentUser('id') usuarioId: string,
    @Body() dto: CrearAsientoManualDto,
  ) {
    return this.asientosService.crearAsientoManual(empresaId, usuarioId, dto);
  }

  @Post('asientos/:id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular un asiento del libro diario',
    description:
      'Anulación lógica: el libro diario no se edita ni se borra, se anula. Los saldos y reportes dejan de contar el asiento.',
  })
  @ApiResponse({ status: 200, description: 'Asiento anulado' })
  @ApiResponse({ status: 404, description: 'Asiento no encontrado en este negocio' })
  @ApiResponse({ status: 409, description: 'El asiento ya estaba anulado' })
  anularAsiento(
    @EmpresaActual() empresaId: string,
    @Param('id') id: string,
  ) {
    return this.asientosService.anularAsiento(empresaId, id);
  }

  // ------------------------------------------------------------- libro mayor

  @Get('libro-mayor')
  @ApiOperation({
    summary: 'Libro mayor de una cuenta',
    description:
      'Saldo anterior al período, movimientos del período (paginados) y saldo final corrido.',
  })
  @ApiResponse({ status: 200, description: 'Mayor de la cuenta con saldo inicial y final' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada en este negocio' })
  libroMayor(
    @EmpresaActual() empresaId: string,
    @Query() filtro: FiltroLibroMayorDto,
  ) {
    return this.balancesService.libroMayor(empresaId, filtro.cuentaId, {
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta,
      pagina: filtro.pagina,
      limite: filtro.limite,
      incluirSubcuentas: filtro.incluirSubcuentas,
    });
  }

  // ---------------------------------------------------------------- balances

  @Get('balance-comprobacion')
  @ApiOperation({
    summary: 'Balance de comprobación del período',
    description:
      'Debe y haber por cuenta transaccional, con totales y la bandera `cuadra`. Es la comprobación de partida doble previa a cualquier otro reporte.',
  })
  @ApiResponse({ status: 200, description: 'Balance de comprobación con totales' })
  balanceComprobacion(
    @EmpresaActual() empresaId: string,
    @Query() filtro: FiltroPeriodoDto,
  ) {
    return this.balancesService.balanceComprobacion(empresaId, filtro);
  }

  @Get('estado-resultados')
  @ApiOperation({
    summary: 'Estado de resultados del período',
    description: 'Ingresos menos costos menos gastos, con el desglose por grupo.',
  })
  @ApiResponse({ status: 200, description: 'Utilidad o pérdida del período' })
  estadoResultados(
    @EmpresaActual() empresaId: string,
    @Query() filtro: FiltroPeriodoDto,
  ) {
    return this.balancesService.estadoResultados(empresaId, filtro);
  }

  @Get('balance-general')
  @ApiOperation({
    summary: 'Balance general al corte pedido',
    description:
      'Activo contra pasivo + patrimonio + resultados del ejercicio. Trae la bandera `verifica` para que el frontend no muestre cifras sin comprobar.',
  })
  @ApiResponse({ status: 200, description: 'Balance general con la ecuación contable' })
  balanceGeneral(
    @EmpresaActual() empresaId: string,
    @Query() filtro: FiltroPeriodoDto,
  ) {
    return this.balancesService.balanceGeneral(empresaId, filtro.fechaHasta);
  }
}
