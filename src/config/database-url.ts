/**
 * Soporte para DATABASE_URL, el formato que entregan Supabase, Railway, Heroku
 * o cualquier servicio gestionado de Postgres: una única URL en lugar de
 * host/puerto/usuario por separado.
 *
 * Vive en un archivo propio y sin dependencias de Nest porque también lo
 * consume `data-source.ts`, que corre fuera de la aplicación (el CLI de
 * migraciones no puede inyectar ConfigService).
 */
export interface ConexionBaseDatos {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

const PUERTO_POSTGRES = 5432;

/** decodeURIComponent revienta si hay un % suelto en la contraseña. */
function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

/**
 * Descompone DATABASE_URL, o devuelve null si no está definida para que el
 * llamador caiga a las variables sueltas (DB_HOST, DB_PORT, ...).
 *
 * Lanza si la URL existe pero es inválida: preferible fallar al arrancar con un
 * mensaje claro antes que conectarse por accidente a un host por defecto.
 */
export function leerDatabaseUrl(url: string | undefined): ConexionBaseDatos | null {
  if (!url || url.trim() === '') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error('DATABASE_URL no es una URL válida. Esperaba algo como postgresql://usuario:clave@host:5432/base');
  }

  if (!parsed.protocol.startsWith('postgres')) {
    throw new Error(
      `DATABASE_URL usa el esquema "${parsed.protocol}" y se esperaba "postgres:" o "postgresql:"`,
    );
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL no incluye un host');
  }

  const name = parsed.pathname.replace(/^\//, '');
  if (!name) {
    throw new Error('DATABASE_URL no incluye el nombre de la base tras la última "/"');
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : PUERTO_POSTGRES,
    username: decodificar(parsed.username),
    password: decodificar(parsed.password),
    name,
  };
}

/**
 * Decide si la conexión usa TLS.
 *
 * El default es automático: todo lo que no sea `localhost` es normalmente un
 * servicio gestionado que exige SSL (Supabase, Railway, RDS...). Pero el
 * heurístico no acierta siempre — Postgres en Docker con hostname `db` y sin
 * SSL, o un servidor interno que sí lo necesita — así que `DB_SSL=true|false`
 * lo fuerza cuando haga falta.
 *
 * `rejectUnauthorized: false` salta la verificación del certificado: esos
 * servicios presentan una cadena que Node no valida por defecto y sin esto la
 * conexión muere en el handshake. Es el mismo comportamiento que ya usaba la
 * aplicación.
 */
export function resolverSsl(
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): false | { rejectUnauthorized: boolean } {
  const crudo = env.DB_SSL;
  const activo =
    crudo !== undefined && crudo !== '' ? crudo === 'true' : host !== 'localhost';

  return activo ? { rejectUnauthorized: false } : false;
}

/**
 * La conexión completa: DATABASE_URL si existe, si no las variables sueltas.
 * `puertoPorDefecto` permite que cada consumidor mantenga su default actual
 * (la app usa 5433 para Docker, el CLI el mismo, pero otros entornos 5432).
 */
export function resolverConexion(
  env: NodeJS.ProcessEnv = process.env,
  puertoPorDefecto = 5433,
): ConexionBaseDatos {
  const desdeUrl = leerDatabaseUrl(env.DATABASE_URL);
  if (desdeUrl) {
    return desdeUrl;
  }

  return {
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? puertoPorDefecto),
    username: env.DB_USERNAME ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    name: env.DB_NAME ?? 'contabily_test',
  };
}
