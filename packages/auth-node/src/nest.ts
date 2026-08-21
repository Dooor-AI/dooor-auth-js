import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Module,
  Optional,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type DynamicModule,
  type ExecutionContext as NestExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createAuthGuard, type CreateAuthGuardOptions } from "./guard.js";
import { hasRoles } from "./roles.js";
import type { DooorTokenPayload } from "./types.js";

/** DI token for the options passed to `DooorAuthModule.forRoot()`. */
export const DOOOR_AUTH_OPTIONS = "DOOOR_AUTH_OPTIONS";

const ROLES_METADATA_KEY = "dooor:roles";
const PUBLIC_METADATA_KEY = "dooor:public";

export interface DooorAuthModuleOptions extends CreateAuthGuardOptions {
  /** Require every role listed by `@DooorRoles()` instead of any one of them. */
  requireAllRoles?: boolean;
}

/**
 * Marks a route (or controller) as requiring specific roles. Roles are
 * resolved per app at token issuance, so the check runs on verified claims.
 *
 * ```ts
 * @DooorRoles("admin")
 * @Get("settings")
 * getSettings() {}
 * ```
 */
export const DooorRoles = (...roles: string[]) => SetMetadata(ROLES_METADATA_KEY, roles);

/** Opts a route out of `DooorAuthGuard` when the guard is registered globally. */
export const Public = () => SetMetadata(PUBLIC_METADATA_KEY, true);

/**
 * Injects the verified token claims into a handler parameter. Pass a claim
 * name to project a single field.
 *
 * ```ts
 * @Get("me")
 * me(@CurrentUser() user: DooorTokenPayload, @CurrentUser("sub") id: string) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (claim: keyof DooorTokenPayload | undefined, context: NestExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ dooor?: DooorTokenPayload }>();
    const claims = request.dooor;
    if (!claims) return undefined;
    return claim ? claims[claim] : claims;
  },
);

/**
 * Nest guard that verifies the `Authorization: Bearer` access token offline
 * via JWKS and attaches the claims to `request.dooor`. Works with both the
 * Express and Fastify adapters.
 *
 * ```ts
 * @Module({ imports: [DooorAuthModule.forRoot()] })
 * export class AppModule {}
 *
 * @UseGuards(DooorAuthGuard)
 * @Controller("reports")
 * export class ReportsController {}
 * ```
 */
@Injectable()
export class DooorAuthGuard implements CanActivate {
  private readonly guard: ReturnType<typeof createAuthGuard>;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(DOOOR_AUTH_OPTIONS) private readonly options: DooorAuthModuleOptions = {},
  ) {
    this.guard = createAuthGuard(this.options ?? {});
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA_KEY, [handler, controller]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ dooor?: DooorTokenPayload }>();

    let claims: DooorTokenPayload;
    try {
      claims = await this.guard(request);
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : "Unauthorized");
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_METADATA_KEY, [handler, controller]) ?? [];
    if (!hasRoles(claims, requiredRoles, { requireAll: this.options?.requireAllRoles })) {
      // Authenticated, but not allowed: 403 rather than 401.
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(", ")}`);
    }

    request.dooor = claims;
    return true;
  }
}

/**
 * Registers `DooorAuthGuard` and its options. Issuer and audience default to
 * `DOOOR_AUTH_ISSUER` / `DOOOR_AUTH_APP_ID`, so `forRoot()` with no arguments
 * is the common case on the Dooor OS runtime.
 */
@Module({})
export class DooorAuthModule {
  static forRoot(options: DooorAuthModuleOptions = {}): DynamicModule {
    return {
      module: DooorAuthModule,
      global: true,
      providers: [
        { provide: DOOOR_AUTH_OPTIONS, useValue: options },
        DooorAuthGuard,
      ],
      exports: [DOOOR_AUTH_OPTIONS, DooorAuthGuard],
    };
  }
}
