import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../lib/auth.js";
import { authUserSchema, loginBodySchema } from "./schemas.js";
import { authRepository } from "./repository.js";
import { authService } from "./service.js";
import { serializeAuthUser } from "./serializer.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", {
    schema: {
      tags: ["auth"],
      body: loginBodySchema
    }
  }, async (request) => {
    const { username, password } = loginBodySchema.parse(request.body);
    const result = await authService.login(app, username, password);
    return ok({
      token: result.token,
      user: authUserSchema.parse(serializeAuthUser(result.user))
    });
  });

  app.get("/me", {
    schema: {
      tags: ["auth"]
    },
    preHandler: requireAuth
  }, async (request) => {
    const user = await authRepository.findById(app, request.user.sub);
    if (!user) {
      throw new AppError(404, "User not found", "user_not_found");
    }

    return ok({
      user: authUserSchema.parse(serializeAuthUser(user))
    });
  });
};
