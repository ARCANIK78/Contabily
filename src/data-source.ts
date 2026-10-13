import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { resolverConexion, resolverSsl } from './config/database-url.js';

import { User } from './auth/entities/user.entity.js';
import { Empresa } from './empresa/entities/empresa.entity.js';
import { PlanDeCuenta } from './contabilidad/entities/plan-de-cuenta.entity.js';
import { AsientoContable } from './contabilidad/entities/asiento-contable.entity.js';
import { DetalleAsiento } from './contabilidad/entities/detalle-asiento.entity.js';
import { CuentaFinanciera } from './cajas/entities/cuenta-financiera.entity.js';
import { Transaccion } from './cajas/entities/transaccion.entity.js';
import { TipoCambio } from './tipo-cambio/entities/tipo-cambio.entity.js';
import { Producto } from './producto/entities/producto.entity.js';
import { ProductoVariante } from './producto/entities/producto-variante.entity.js';
import { Categoria } from './producto/entities/categoria.entity.js';
import { Coleccion } from './producto/entities/coleccion.entity.js';
import { MovimientoInventario } from './producto/entities/movimiento-inventario.entity.js';
import { Proveedor } from './compras/entities/proveedor.entity.js';
import { Compra } from './compras/entities/compra.entity.js';
import { CompraDetalle } from './compras/entities/compra-detalle.entity.js';
import { CompraPago } from './compras/entities/compra-pago.entity.js';
import { CategoriaGasto } from './compras/entities/categoria-gasto.entity.js';
import { Gasto } from './compras/entities/gasto.entity.js';

import { InitSchema1791533603941 } from './migrations/1791533603941-InitSchema.js';
import { CrearTiposCambioYConvertirMontos1791534430746 } from './migrations/1791534430746-CrearTiposCambioYConvertirMontos.js';
import { AgregarTasaAplicadaATransacciones1791536036688 } from './migrations/1791536036688-AgregarTasaAplicadaATransacciones.js';
import { FaltantesSincronizacionInicial1791590000000 } from './migrations/1791590000000-FaltantesSincronizacionInicial.js';
import { AgregarEmpresaIdAModulosContables1791604000000 } from './migrations/1791604000000-AgregarEmpresaIdAModulosContables.js';
import { CrearModuloComprasYGastos1791700000000 } from './migrations/1791700000000-CrearModuloComprasYGastos.js';
import { AgregarCorrelativoYEstadoAAsientos1791800000000 } from './migrations/1791800000000-AgregarCorrelativoYEstadoAAsientos.js';

// Carga manual de .env: el CLI de TypeORM corre fuera de Nest y necesita las credenciales.
function cargarEnv(): void {
  try {
    const contenido = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const linea of contenido.split('\n')) {
      const coincidencia = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linea.trim());
      if (coincidencia && process.env[coincidencia[1]] === undefined) {
        process.env[coincidencia[1]] = coincidencia[2];
      }
    }
  } catch {
    // sin .env se usan los valores por defecto de abajo
  }
}

cargarEnv();

// DATABASE_URL si existe (Supabase, Railway...), si no las variables sueltas.
const { name: database, ...conexion } = resolverConexion();

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...conexion,
  database,
  // TLS hacia el servidor. Sin esto el CLI de migraciones muere en el
  // handshake contra Supabase, aunque la aplicación sí arranque: aquí es
  // donde más duele olvidarlo. Ver resolverSsl para el override con DB_SSL.
  ssl: resolverSsl(conexion.host),
  entities: [
    User,
    Empresa,
    PlanDeCuenta,
    AsientoContable,
    DetalleAsiento,
    CuentaFinanciera,
    Transaccion,
    TipoCambio,
    Producto,
    ProductoVariante,
    Categoria,
    Coleccion,
    MovimientoInventario,
    Proveedor,
    Compra,
    CompraDetalle,
    CompraPago,
    CategoriaGasto,
    Gasto,
  ],
  migrations: [
    InitSchema1791533603941,
    CrearTiposCambioYConvertirMontos1791534430746,
    AgregarTasaAplicadaATransacciones1791536036688,
    // Va aquí por timestamp: debe correr antes de las dos siguientes, que
    // referencian empresas, productos y producto_variantes.
    FaltantesSincronizacionInicial1791590000000,
    AgregarEmpresaIdAModulosContables1791604000000,
    CrearModuloComprasYGastos1791700000000,
    AgregarCorrelativoYEstadoAAsientos1791800000000,
  ],
  synchronize: false,
  logging: false,
});
