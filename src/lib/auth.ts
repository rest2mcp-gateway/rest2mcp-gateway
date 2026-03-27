import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "../db/schema.js";
import { AppError } from "./errors.js";

export type AuthClaims = {
  sub: string;
  organizationId: string;
  role: UserRole;
  email: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: AuthClaims;
  }
}

export const requireAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
  try {
    await request.jwtVerify<AuthClaims>();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unauthorized";

    if (code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED") {
      throw new AppError(401, "Session expired", "session_expired");
    }

    throw new AppError(401, "Authentication required", "unauthorized");
  }
};

export const requireRoles = (roles: UserRole[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    const user = request.user as AuthClaims;
    if (!roles.includes(user.role)) {
      throw new AppError(403, "Insufficient permissions", "forbidden");
    }
  };
};

export const assertRole = (role: UserRole, allowed: UserRole[]) => {
  if (!allowed.includes(role)) {
    throw new AppError(403, "Insufficient permissions", "forbidden");
  }
};
