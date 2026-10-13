import { describe, it, expect } from 'vitest';

import { leerDatabaseUrl, resolverConexion, resolverSsl } from './database-url.js';

// URL con todos los guiones de Supabase: host con guiones, usuario con puntos
// y contraseña con caracteres que obligan a ir percent-encoded.
const URL_SUPABASE =
  'postgresql://postgres.abcxyz123:Mi%40Clave%23Segura@db.mi-proyecto.supabase.co:5432/postgres';

describe('leerDatabaseUrl', () => {
  it('descompone una URL estilo Supabase', () => {
    expect(leerDatabaseUrl(URL_SUPABASE)).toEqual({
      host: 'db.mi-proyecto.supabase.co',
      port: 5432,
      username: 'postgres.abcxyz123',
      password: 'Mi@Clave#Segura',
      name: 'postgres',
    });
  });

  it('descodifica # y no-ASCII en la contraseña', () => {
    // '#' termina la autoridad de la URL si va sin codificar, y 'ñ' ocupa dos
    // bytes en UTF-8: hay que percent-encodear todo lo que quede fuera de
    // [A-Za-z0-9-_.~]. Es el patrón típico de las claves que genera Supabase.
    const uri = 'postgresql://postgres:Cl4ve%23%C3%B1Segura@db.x.supabase.co:5432/postgres';

    expect(leerDatabaseUrl(uri)?.password).toBe('Cl4ve#ñSegura');
  });

  it('usa 5432 si la URL no indica puerto', () => {
    const conexion = leerDatabaseUrl('postgresql://user:pass@host.example.com/mibasedatos');

    expect(conexion?.port).toBe(5432);
    expect(conexion?.name).toBe('mibasedatos');
  });

  it('acepta el esquema postgres: además del postgresql:', () => {
    expect(leerDatabaseUrl('postgres://user:pass@host/db')?.host).toBe('host');
  });

  it('devuelve null si la variable no está definida', () => {
    expect(leerDatabaseUrl(undefined)).toBeNull();
  });

  it('devuelve null si está vacía o solo con espacios', () => {
    expect(leerDatabaseUrl('')).toBeNull();
    expect(leerDatabaseUrl('   ')).toBeNull();
  });

  it('no revienta con un % suelto en la contraseña', () => {
    // decodeURIComponent lanzaría ante un % que no abre un escape válido.
    expect(leerDatabaseUrl('postgresql://user:clav%e@host/db')?.password).toBe('clav%e');
  });

  it('RECHAZA una URL mal formada en vez de conectarse a un host por defecto', () => {
    expect(() => leerDatabaseUrl('esto no es una url')).toThrow(/DATABASE_URL no es una URL válida/);
  });

  it('RECHAZA un esquema que no sea de Postgres', () => {
    expect(() => leerDatabaseUrl('mysql://user:pass@host/db')).toThrow(/esquema/);
  });

  it('RECHAZA una URL sin nombre de base', () => {
    expect(() => leerDatabaseUrl('postgresql://user:pass@host/')).toThrow(/nombre de la base/);
  });
});

describe('resolverConexion', () => {
  it('prioriza DATABASE_URL sobre las variables sueltas', () => {
    const env = {
      DATABASE_URL: 'postgresql://user:pass@db.supabase.co:5432/postgres',
      DB_HOST: 'localhost',
      DB_PORT: '5433',
    };

    expect(resolverConexion(env as NodeJS.ProcessEnv)).toEqual({
      host: 'db.supabase.co',
      port: 5432,
      username: 'user',
      password: 'pass',
      name: 'postgres',
    });
  });

  it('cae a las variables sueltas cuando no hay DATABASE_URL', () => {
    const env = {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'postgres',
      DB_NAME: 'contabily_test',
    };

    expect(resolverConexion(env as NodeJS.ProcessEnv)).toEqual({
      host: 'localhost',
      port: 5433,
      username: 'postgres',
      password: 'postgres',
      name: 'contabily_test',
    });
  });

  it('respeta los defaults actuales con un env vacío', () => {
    // Regression: sin esto la app dejaría de arrancar en local como hasta ahora.
    expect(resolverConexion({} as NodeJS.ProcessEnv)).toEqual({
      host: 'localhost',
      port: 5433,
      username: 'postgres',
      password: 'postgres',
      name: 'contabily_test',
    });
  });
});

describe('resolverSsl', () => {
  it('apaga TLS en localhost', () => {
    expect(resolverSsl('localhost', {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('enciende TLS en cualquier host remoto', () => {
    expect(resolverSsl('db.supabase.co', {} as NodeJS.ProcessEnv)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('DB_SSL=false desactiva TLS aunque el host sea remoto', () => {
    // Postgres en Docker con hostname 'db' y sin SSL: el heurístico fallaría.
    expect(resolverSsl('db', { DB_SSL: 'false' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('DB_SSL=true fuerza TLS aunque el host sea local', () => {
    expect(resolverSsl('localhost', { DB_SSL: 'true' } as NodeJS.ProcessEnv)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('DB_SSL vacío cae al comportamiento automático', () => {
    expect(resolverSsl('db.remoto', { DB_SSL: '' } as NodeJS.ProcessEnv)).toEqual({
      rejectUnauthorized: false,
    });
  });
});
