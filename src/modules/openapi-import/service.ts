import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import YAML from "yaml";
import { backendApis, mcpServers, tools } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { backendApiService } from "../backend-apis/service.js";
import { backendResourceService } from "../backend-resources/service.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { toolService } from "../tools/service.js";

type JsonObject = Record<string, unknown>;

type PreviewInput = {
  name: string;
  slug: string;
  description?: string;
  defaultBaseUrl: string;
  specText: string;
  targetMcpServerId?: string;
};

type ImportInput = PreviewInput & {
  operations: Array<{
    operationKey: string;
    exposeAsTool: boolean;
  }>;
};

type OpenApiDocument = {
  openapi?: string;
  info?: {
    title?: string;
    description?: string;
  };
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
};

type OperationPreview = {
  operationKey: string;
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  inputSchema: JsonObject;
  responseSchema: JsonObject;
  pathTemplate: string;
  bodyTemplate: string | null;
  requestSchema: JsonObject;
  exposable: boolean;
  exposureIssues: string[];
  suggestedToolName: string;
  suggestedToolSlug: string;
  suggestedToolTitle: string;
};

const supportedMethods = ["get", "post", "put", "patch", "delete"] as const;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const toToolName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 80);

const titleize = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const parseSpecText = (specText: string): OpenApiDocument => {
  try {
    const parsed = JSON.parse(specText) as OpenApiDocument;
    return parsed;
  } catch {
    const parsed = YAML.parse(specText) as OpenApiDocument;
    return parsed;
  }
};

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

const resolveRef = (document: OpenApiDocument, value: unknown, seen = new Set<string>()): unknown => {
  const object = asObject(value);
  const ref = object.$ref;
  if (typeof ref !== "string") {
    return value;
  }
  if (!ref.startsWith("#/")) {
    return value;
  }
  if (seen.has(ref)) {
    return {};
  }

  const parts = ref.slice(2).split("/");
  let current: unknown = document;
  for (const part of parts) {
    current = asObject(current)[part];
  }

  return resolveSchema(document, current, new Set(seen).add(ref));
};

const resolveSchema = (document: OpenApiDocument, schema: unknown, seen = new Set<string>()): JsonObject => {
  const resolved = resolveRef(document, schema, seen);
  const object = asObject(resolved);

  if (Array.isArray(object.allOf)) {
    const mergedProperties: Record<string, unknown> = {};
    const required = new Set<string>();
    for (const entry of object.allOf) {
      const resolvedEntry = resolveSchema(document, entry, seen);
      const properties = asObject(resolvedEntry.properties);
      for (const [key, value] of Object.entries(properties)) {
        mergedProperties[key] = value;
      }
      if (Array.isArray(resolvedEntry.required)) {
        for (const name of resolvedEntry.required) {
          if (typeof name === "string") {
            required.add(name);
          }
        }
      }
    }
    return {
      ...object,
      type: object.type ?? "object",
      properties: mergedProperties,
      required: Array.from(required)
    };
  }

  if (Array.isArray(object.oneOf) && object.oneOf[0]) {
    return resolveSchema(document, object.oneOf[0], seen);
  }

  if (Array.isArray(object.anyOf) && object.anyOf[0]) {
    return resolveSchema(document, object.anyOf[0], seen);
  }

  if (object.properties) {
    const properties = Object.fromEntries(
      Object.entries(asObject(object.properties)).map(([key, value]) => [key, resolveSchema(document, value, seen)])
    );
    return {
      ...object,
      properties
    };
  }

  if (object.items) {
    return {
      ...object,
      items: resolveSchema(document, object.items, seen)
    };
  }

  return object;
};

const normalizeSchema = (schema: JsonObject): JsonObject => {
  const normalized: JsonObject = {};
  const passthroughKeys = [
    "type",
    "description",
    "format",
    "enum",
    "required",
    "additionalProperties",
    "default",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "pattern"
  ];

  for (const key of passthroughKeys) {
    if (schema[key] !== undefined) {
      normalized[key] = schema[key];
    }
  }

  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    normalized.properties = Object.fromEntries(
      Object.entries(schema.properties as JsonObject).map(([key, value]) => [key, normalizeSchema(asObject(value))])
    );
  }

  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    normalized.items = normalizeSchema(asObject(schema.items));
  }

  return normalized;
};

const parameterToSchema = (document: OpenApiDocument, parameter: unknown) => {
  const resolved = asObject(resolveRef(document, parameter));
  return {
    name: typeof resolved.name === "string" ? resolved.name : "",
    location: typeof resolved.in === "string" ? resolved.in : "",
    required: Boolean(resolved.required),
    description: typeof resolved.description === "string" ? resolved.description : "",
    schema: normalizeSchema(resolveSchema(document, resolved.schema))
  };
};

const buildBodyTemplateFromSchema = (schema: JsonObject): string | null => {
  if (schema.type !== "object") {
    return null;
  }

  const properties = asObject(schema.properties);
  const templateObject = Object.fromEntries(
    Object.entries(properties).map(([name, rawProperty]) => {
      const property = asObject(rawProperty);
      const isStringLike = property.type === "string" || property.format === "date-time" || property.format === "date";
      return [name, isStringLike ? `{{${name}}}` : `__RAW__${name}__`];
    })
  );

  const serialized = JSON.stringify(templateObject, null, 2);
  if (!serialized) {
    return null;
  }

  return serialized.replace(/"__RAW__([a-zA-Z_][a-zA-Z0-9_-]*)__"/g, "{{$1}}");
};

const convertPathTemplate = (path: string) =>
  path.replace(/\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g, "{{$1}}");

const extractResponseSchema = (document: OpenApiDocument, operation: JsonObject) => {
  const responses = asObject(operation.responses);
  const response = asObject(
    responses["200"] ??
      responses["201"] ??
      responses["202"] ??
      responses.default
  );
  const content = asObject(response.content);
  const mediaType = asObject(
    content["application/json"] ??
      Object.values(content)[0]
  );
  return normalizeSchema(resolveSchema(document, mediaType.schema));
};

const buildOperationPreview = (
  document: OpenApiDocument,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  pathItem: JsonObject,
  operation: JsonObject
): OperationPreview => {
  const operationId =
    (typeof operation.operationId === "string" && operation.operationId.trim()) ||
    `${method.toLowerCase()}_${path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_")}`;

  const summary =
    (typeof operation.summary === "string" && operation.summary.trim()) ||
    titleize(operationId);
  const description =
    (typeof operation.description === "string" && operation.description.trim()) ||
    summary;

  const combinedParameters = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : [])
  ];

  const parameters = combinedParameters
    .map((parameter) => parameterToSchema(document, parameter))
    .filter((parameter) => parameter.name.length > 0);

  const requestBody = asObject(resolveRef(document, operation.requestBody));
  const requestContent = asObject(requestBody.content);
  const requestMediaType = asObject(
    requestContent["application/json"] ??
      Object.values(requestContent)[0]
  );
  const requestSchema = normalizeSchema(resolveSchema(document, requestMediaType.schema));
  const responseSchema = extractResponseSchema(document, operation);

  const inputProperties: Record<string, unknown> = {};
  const required = new Set<string>();

  for (const parameter of parameters) {
    inputProperties[parameter.name] = {
      ...parameter.schema,
      description: parameter.description || parameter.schema.description
    };
    if (parameter.required) {
      required.add(parameter.name);
    }
  }

  if (requestSchema.type === "object") {
    const bodyProperties = asObject(requestSchema.properties);
    for (const [name, value] of Object.entries(bodyProperties)) {
      if (!(name in inputProperties)) {
        inputProperties[name] = value;
      }
    }
    if (Array.isArray(requestSchema.required)) {
      for (const name of requestSchema.required) {
        if (typeof name === "string") {
          required.add(name);
        }
      }
    }
  }

  const unsupportedParameters = parameters.filter(
    (parameter) => parameter.location === "query" || parameter.location === "header" || parameter.location === "cookie"
  );

  const exposureIssues: string[] = [];
  if (unsupportedParameters.length > 0) {
    exposureIssues.push("Query/header/cookie parameters are not auto-exposed yet");
  }

  const pathTemplate = convertPathTemplate(path);
  const bodyTemplate = buildBodyTemplateFromSchema(requestSchema);
  const operationKey = `${method} ${path}`;
  const suggestedToolName = toToolName(operationId);
  const suggestedToolSlug = slugify(operationId);

  return {
    operationKey,
    operationId,
    method,
    path,
    summary,
    description,
    inputSchema: {
      type: "object",
      properties: inputProperties,
      required: Array.from(required),
      additionalProperties: false
    },
    responseSchema,
    pathTemplate,
    bodyTemplate,
    requestSchema,
    exposable: exposureIssues.length === 0,
    exposureIssues,
    suggestedToolName,
    suggestedToolSlug,
    suggestedToolTitle: summary
  };
};

const buildPreview = (input: PreviewInput) => {
  const document = parseSpecText(input.specText);
  if (!document.openapi) {
    throw new AppError(400, "Only OpenAPI 3.x documents are supported", "openapi_invalid_document");
  }

  const pathEntries = Object.entries(document.paths ?? {});
  const operations = pathEntries.flatMap(([path, rawPathItem]) => {
    const pathItem = asObject(rawPathItem);
    return supportedMethods.flatMap((methodName) => {
      const operation = pathItem[methodName];
      if (!operation || typeof operation !== "object") {
        return [];
      }

      return [buildOperationPreview(document, path, methodName.toUpperCase() as OperationPreview["method"], pathItem, asObject(operation))];
    });
  });

  return {
    backendApi: {
      name: input.name || document.info?.title || "Imported API",
      slug: input.slug || slugify(document.info?.title || "imported-api"),
      description: input.description || document.info?.description || ""
    },
    operations
  };
};

const ensureMcpServerForOrganization = async (
  app: FastifyInstance,
  organizationId: string,
  mcpServerId: string
) => {
  const [row] = await app.db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new AppError(400, "Target MCP server not found", "mcp_server_not_found");
  }

  return row;
};

const ensureUniqueIdentifiers = async (
  app: FastifyInstance,
  mcpServerId: string,
  operations: OperationPreview[]
) => {
  const requestedSlugs = operations.map((operation) => operation.suggestedToolSlug);
  const existingRows = requestedSlugs.length > 0
    ? await app.db
        .select({ slug: tools.slug, name: tools.name })
        .from(tools)
        .where(and(eq(tools.mcpServerId, mcpServerId), inArray(tools.slug, requestedSlugs)))
    : [];

  const usedSlugs = new Set(existingRows.map((row) => row.slug));
  const usedNames = new Set(existingRows.map((row) => row.name));

  return operations.map((operation) => {
    let nextSlug = operation.suggestedToolSlug || slugify(operation.operationId);
    let nextName = operation.suggestedToolName || toToolName(operation.operationId);
    let counter = 2;

    while (usedSlugs.has(nextSlug) || usedNames.has(nextName)) {
      nextSlug = `${operation.suggestedToolSlug}-${counter}`;
      nextName = `${operation.suggestedToolName}_${counter}`;
      counter += 1;
    }

    usedSlugs.add(nextSlug);
    usedNames.add(nextName);

    return {
      ...operation,
      suggestedToolSlug: nextSlug,
      suggestedToolName: nextName
    };
  });
};

export const openApiImportService = {
  preview(input: PreviewInput) {
    return buildPreview(input);
  },

  async execute(app: FastifyInstance, actorId: string, organizationId: string, input: ImportInput) {
    const preview = buildPreview(input);
    const operationSelection = new Map(input.operations.map((operation) => [operation.operationKey, operation.exposeAsTool]));

    const selectedOperations = preview.operations.filter((operation) => operationSelection.get(operation.operationKey));
    if (selectedOperations.some((operation) => !operation.exposable)) {
      throw new AppError(400, "One or more selected operations cannot be exposed as tools yet", "openapi_unsupported_tool_exposure");
    }

    if (selectedOperations.length > 0 && !input.targetMcpServerId) {
      throw new AppError(400, "A target MCP server is required when exposing operations as tools", "missing_target_mcp_server_id");
    }

    if (input.targetMcpServerId) {
      await ensureMcpServerForOrganization(app, organizationId, input.targetMcpServerId);
    }

    const backendApi = await backendApiService.create(app, actorId, organizationId, {
      organizationId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      defaultBaseUrl: input.defaultBaseUrl,
      authType: "none",
      authConfig: {},
      defaultTimeoutMs: 30000,
      retryPolicy: { retries: 0 },
      isActive: true
    });

    const resourcesByOperationKey = new Map<string, { id: string }>();
    for (const operation of preview.operations) {
      const resource = await backendResourceService.create(app, actorId, organizationId, {
        backendApiId: backendApi.id,
        name: operation.summary,
        operationId: operation.operationId,
        description: operation.description,
        httpMethod: operation.method,
        pathTemplate: operation.pathTemplate,
        bodyTemplate: operation.bodyTemplate ?? undefined,
        requestSchema: operation.requestSchema,
        responseSchema: operation.responseSchema,
        isActive: true
      });
      resourcesByOperationKey.set(operation.operationKey, { id: resource.id });
    }

    const toolOperations = await ensureUniqueIdentifiers(app, input.targetMcpServerId ?? "", selectedOperations);
    const createdTools = [];
    for (const operation of toolOperations) {
      const resource = resourcesByOperationKey.get(operation.operationKey);
      if (!resource || !input.targetMcpServerId) {
        continue;
      }

      const tool = await toolService.create(app, actorId, organizationId, {
        mcpServerId: input.targetMcpServerId,
        name: operation.suggestedToolName,
        slug: operation.suggestedToolSlug,
        title: operation.suggestedToolTitle,
        description: operation.description,
        inputSchema: operation.inputSchema,
        outputSchema: operation.responseSchema,
        examples: [],
        riskLevel: "low",
        isActive: true,
        scopeIds: [],
        mapping: {
          backendResourceId: resource.id,
          requestMapping: {},
          responseMapping: {},
          errorMapping: {},
          authStrategy: "inherit",
          timeoutOverrideMs: null,
          retryOverride: null,
          isActive: true
        }
      });
      createdTools.push(tool);
    }

    await maybeAutoPublishDraft(app, actorId, organizationId, "openapi_import.execute");

    return {
      backendApi,
      importedResourceCount: preview.operations.length,
      importedToolCount: createdTools.length,
      operations: preview.operations.map((operation) => ({
        operationKey: operation.operationKey,
        importedAsTool: Boolean(operationSelection.get(operation.operationKey))
      }))
    };
  }
};
