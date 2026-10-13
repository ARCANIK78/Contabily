import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service.js';

@ApiTags('General')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Liveness para Render (o cualquier orquestador). Se mantiene fuera del
   * prefijo `api` y sin versión para que su URL no cambie si el API sube de
   * versión: un health check que se rompe por un bump de versión deja el
   * servicio marcado como caído sin que nadie lo haya tocado.
   *
   * No consulta la base: TypeORM impide arrancar sin ella, así que si el
   * proceso responde es que la conexión funcionó. Además así un corte
   * transitorio de la BD no dispara reinicios en bucle.
   */
  @Get('health')
  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: 'Estado del servicio (health check)' })
  @ApiResponse({ status: 200, description: 'El proceso está vivo' })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV ?? 'development',
    };
  }
}
