import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Custom decorator to attach required roles metadata to controllers or route handlers.
 * Usage: @Roles(Role.ADMIN, Role.DOCTOR)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
