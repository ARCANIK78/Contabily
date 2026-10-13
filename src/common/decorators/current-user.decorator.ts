import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Inyecta el usuario autenticado (`req.user`) que dejó la JwtStrategy.
 *
 *   @Get('perfil')
 *   perfil(@CurrentUser() usuario: Usuario) { ... }
 *
 * Si necesitas un campo concreto: `@CurrentUser('id')`.
 */
export const CurrentUser = createParamDecorator(
  (campo: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest();
    const usuario = request.user;
    return campo ? usuario?.[campo] : usuario;
  },
);
