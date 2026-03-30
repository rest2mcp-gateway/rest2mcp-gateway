import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { authRepository } from "./repository.js";

export const authService = {
  async login(app: FastifyInstance, username: string, password: string) {
    const user = await authRepository.findByUsername(app, username);
    if (!user || !user.passwordHash || !user.isActive) {
      throw new AppError(401, "Invalid credentials", "invalid_credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "Invalid credentials", "invalid_credentials");
    }

    const token = await app.jwt.sign({
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      username: user.username
    });

    return { token, user };
  }
};
