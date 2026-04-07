import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../src/lib/errors.js";
import { openApiImportService } from "../../src/modules/openapi-import/service.js";

test("openApiImportService.preview rejects documents without an openapi field", () => {
  assert.throws(
    () =>
      openApiImportService.preview({
        name: "",
        slug: "",
        defaultBaseUrl: "https://widgets.example.test",
        specText: JSON.stringify({
          info: { title: "Broken spec" },
          paths: {}
        })
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "openapi_invalid_document");
      return true;
    }
  );
});

test("openApiImportService.preview merges path and operation parameters and derives fallback identifiers", () => {
  const preview = openApiImportService.preview({
    name: "",
    slug: "",
    defaultBaseUrl: "https://widgets.example.test",
    specText: JSON.stringify({
      openapi: "3.0.0",
      info: {
        title: "Widget API"
      },
      paths: {
        "/widgets/{widgetId}": {
          parameters: [
            {
              name: "widgetId",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          patch: {
            parameters: [
              {
                name: "mode",
                in: "path",
                required: false,
                schema: { type: "string", enum: ["soft", "hard"] }
              }
            ],
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        ok: { type: "boolean" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })
  });

  assert.equal(preview.backendApi.name, "Widget API");
  assert.equal(preview.backendApi.slug, "widget-api");
  assert.equal(preview.operations.length, 1);
  assert.deepEqual(preview.operations[0], {
    operationKey: "PATCH /widgets/{widgetId}",
    operationId: "patch__widgets_widgetId",
    method: "PATCH",
    path: "/widgets/{widgetId}",
    summary: "Patch Widgets WidgetId",
    description: "Patch Widgets WidgetId",
    inputSchema: {
      type: "object",
      properties: {
        widgetId: { type: "string", description: undefined },
        mode: { type: "string", enum: ["soft", "hard"], description: undefined }
      },
      required: ["widgetId"],
      additionalProperties: false
    },
    responseSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" }
      }
    },
    pathTemplate: "/widgets/{{widgetId}}",
    bodyTemplate: null,
    requestSchema: {},
    exposable: true,
    exposureIssues: [],
    suggestedToolName: "patch_widgets_widgetid",
    suggestedToolSlug: "patch-widgets-widgetid",
    suggestedToolTitle: "Patch Widgets WidgetId"
  });
});

test("openApiImportService.preview resolves recursive refs and uses the first oneOf or anyOf branch", () => {
  const preview = openApiImportService.preview({
    name: "Recursive Widgets",
    slug: "recursive-widgets",
    defaultBaseUrl: "https://widgets.example.test",
    specText: JSON.stringify({
      openapi: "3.0.0",
      info: {
        title: "Recursive Widgets"
      },
      paths: {
        "/widgets": {
          post: {
            operationId: "createWidget",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/CreateWidgetRequest"
                  }
                }
              }
            },
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      anyOf: [
                        {
                          type: "object",
                          required: ["id"],
                          properties: {
                            id: { type: "string" }
                          }
                        },
                        {
                          type: "object",
                          required: ["fallback"],
                          properties: {
                            fallback: { type: "boolean" }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      components: {
        schemas: {
          CreateWidgetRequest: {
            oneOf: [
              {
                type: "object",
                required: ["name", "child"],
                properties: {
                  name: { type: "string" },
                  child: { $ref: "#/components/schemas/WidgetNode" }
                }
              },
              {
                type: "object",
                required: ["archived"],
                properties: {
                  archived: { type: "boolean" }
                }
              }
            ]
          },
          WidgetNode: {
            type: "object",
            properties: {
              label: { type: "string" },
              child: { $ref: "#/components/schemas/WidgetNode" }
            }
          }
        }
      }
    })
  });

  assert.equal(preview.operations.length, 1);
  assert.deepEqual(preview.operations[0]?.requestSchema, {
    type: "object",
    required: ["name", "child"],
    properties: {
      name: { type: "string" },
      child: {
        type: "object",
        properties: {
          label: { type: "string" },
          child: {}
        }
      }
    }
  });
  assert.deepEqual(preview.operations[0]?.responseSchema, {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" }
    }
  });
});

test("openApiImportService.preview sets bodyTemplate to null for non-object request bodies", () => {
  const preview = openApiImportService.preview({
    name: "Array payloads",
    slug: "array-payloads",
    defaultBaseUrl: "https://widgets.example.test",
    specText: JSON.stringify({
      openapi: "3.0.0",
      info: {
        title: "Array payloads"
      },
      paths: {
        "/widgets/bulk": {
          post: {
            operationId: "bulkWidgets",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            },
            responses: {
              "201": {
                description: "created"
              }
            }
          }
        }
      }
    })
  });

  assert.equal(preview.operations[0]?.bodyTemplate, null);
  assert.deepEqual(preview.operations[0]?.requestSchema, {
    type: "array",
    items: { type: "string" }
  });
});
