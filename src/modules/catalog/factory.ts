import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { listEntities } from "../common/crud.js";

export const buildCatalogRepository = <TTable extends Record<string, any>>(
  table: TTable,
  searchColumn: string
) => ({
  list: (app: FastifyInstance, query: { organizationId?: string | undefined; page: number; pageSize: number; search?: string | undefined; isActive?: boolean | undefined }) =>
    listEntities(app, table as any, { ...query, searchColumn }),
  create: (app: FastifyInstance, values: any) => app.db.insert(table as any).values(values).returning(),
  update: (app: FastifyInstance, id: string, values: any) => app.db.update(table as any).set(values).where(eq((table as any).id, id)).returning(),
  delete: (app: FastifyInstance, id: string) => app.db.delete(table as any).where(eq((table as any).id, id)).returning()
});

export const buildCatalogService = (
  entityType: string,
  repository: ReturnType<typeof buildCatalogRepository>,
  options?: {
    autoPublish?: boolean;
    beforeDelete?: (app: FastifyInstance, organizationId: string, id: string) => Promise<void>;
  }
) => ({
  list: repository.list,
  async create(app: FastifyInstance, actorId: string, organizationId: string, values: any) {
    const createdRows = await repository.create(app, values) as Array<Record<string, unknown>>;
    const row = createdRows[0];
    if (!row) {
      throw new Error(`Failed to create ${entityType}`);
    }
    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: `${entityType}.create`,
      entityType,
      entityId: String(row.id),
      payload: values
    });
    if (options?.autoPublish) {
      await maybeAutoPublishDraft(app, actorId, organizationId, `${entityType}.create`);
    }
    return row;
  },
  async update(app: FastifyInstance, actorId: string, organizationId: string, id: string, values: any) {
    const updatedRows = await repository.update(app, id, values) as Array<Record<string, unknown>>;
    const row = updatedRows[0];
    if (!row) {
      throw new AppError(404, `${entityType} not found`, `${entityType}_not_found`);
    }
    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: `${entityType}.update`,
      entityType,
      entityId: String(row.id),
      payload: values
    });
    if (options?.autoPublish) {
      await maybeAutoPublishDraft(app, actorId, organizationId, `${entityType}.update`);
    }
    return row;
  },
  async delete(app: FastifyInstance, actorId: string, organizationId: string, id: string) {
    if (options?.beforeDelete) {
      await options.beforeDelete(app, organizationId, id);
    }
    const deletedRows = await repository.delete(app, id) as Array<Record<string, unknown>>;
    const row = deletedRows[0];
    if (!row) {
      throw new AppError(404, `${entityType} not found`, `${entityType}_not_found`);
    }
    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: `${entityType}.delete`,
      entityType,
      entityId: String(row.id),
      payload: {}
    });
    if (options?.autoPublish) {
      await maybeAutoPublishDraft(app, actorId, organizationId, `${entityType}.delete`);
    }
    return row;
  }
});
