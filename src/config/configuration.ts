import { registerAs } from '@nestjs/config';

import { resolverConexion, resolverSsl } from './database-url.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
  ssl: false | { rejectUnauthorized: boolean };
  synchronize: boolean;
  logging: boolean;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  frontendUrl: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface RedisConfig {
  url: string;
}

export interface SecurityConfig {
  rateLimit: {
    ttl: number;
    limit: number;
  };
  jwt: {
    privateKey: string;
    publicKey: string;
    keysDir: string;
  };
}

/**
 * Conexión a la base. DATABASE_URL manda si existe (Supabase, Railway, ...);
 * si no, se usan las variables sueltas de siempre. `DB_SYNCHRONIZE` y
 * `DB_LOGGING` solo tienen sentido con las variables sueltas: contra un
 * entorno gestionado la sincronización automática está desactivada a propósito.
 */
export const databaseConfig = registerAs('database', (): DatabaseConfig => {
  const conexion = resolverConexion();

  return {
    ...conexion,
    ssl: resolverSsl(conexion.host),
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  };
});

export const jwtConfig = registerAs('jwt', (): JwtConfig => ({
  secret: process.env.JWT_SECRET ?? 'default-secret-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'default-refresh-secret-change-in-production',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));

export const googleOAuthConfig = registerAs('googleOAuth', (): GoogleOAuthConfig => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/api/v1/auth/google/callback',
}));

export const appConfig = registerAs('app', (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
}));

export const supabaseConfig = registerAs('supabase', (): SupabaseConfig => ({
  url: process.env.SUPABASE_URL ?? '',
  anonKey: process.env.SUPABASE_ANON_KEY ?? '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
}));

export const redisConfig = registerAs('redis', (): RedisConfig => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
}));

export const securityConfig = registerAs('security', (): SecurityConfig => ({
  rateLimit: {
    ttl: parseInt(process.env.SECURITY_RATE_LIMIT_TTL ?? '60000', 10),
    limit: parseInt(process.env.SECURITY_RATE_LIMIT_LIMIT ?? '100', 10),
  },
  jwt: {
    privateKey: process.env.JWT_PRIVATE_KEY ?? '',
    publicKey: process.env.JWT_PUBLIC_KEY ?? '',
    keysDir: process.env.JWT_KEYS_DIR ?? './keys',
  },
}));