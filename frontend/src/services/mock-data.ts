import type {
  BackendApi, BackendEnvironment, BackendResource,
  McpServer, Tool, Scope, ToolScope, ToolMapping
} from '@/contracts/admin-api';

export const mockBackendApis: BackendApi[] = [
  {
    id: '1', organization_id: 'org-1', name: 'Customer Service API', slug: 'customer-service-api',
    description: 'Internal customer management REST API', base_url: 'https://api.internal.acme.com/v2',
    auth_type: 'bearer', auth_config_ref: 'cred-1', default_timeout_ms: 5000,
    retry_policy: { max_retries: 3, backoff_ms: 1000, retry_on: [502, 503] },
    is_active: true, created_at: '2025-01-15T10:00:00Z', updated_at: '2025-03-20T14:30:00Z',
  },
  {
    id: '2', organization_id: 'org-1', name: 'Order Management API', slug: 'order-management-api',
    description: 'Handles order lifecycle and fulfillment', base_url: 'https://orders.acme.com/api/v1',
    auth_type: 'api_key', auth_config_ref: 'cred-2', default_timeout_ms: 10000,
    retry_policy: null, is_active: true,
    created_at: '2025-02-01T08:00:00Z', updated_at: '2025-03-18T09:00:00Z',
  },
  {
    id: '3', organization_id: 'org-1', name: 'Billing Service', slug: 'billing-service',
    description: 'Stripe-backed billing and invoice service', base_url: 'https://billing.acme.com/api',
    auth_type: 'oauth2', auth_config_ref: 'cred-3', default_timeout_ms: 8000,
    retry_policy: { max_retries: 2, backoff_ms: 2000, retry_on: [500, 502, 503] },
    is_active: false, created_at: '2025-03-01T12:00:00Z', updated_at: '2025-03-22T16:00:00Z',
  },
];

export const mockEnvironments: BackendEnvironment[] = [
  { id: 'env-1', backend_api_id: '1', environment_name: 'production', base_url: 'https://api.internal.acme.com/v2', is_default: true },
  { id: 'env-2', backend_api_id: '1', environment_name: 'staging', base_url: 'https://staging-api.internal.acme.com/v2', is_default: false },
  { id: 'env-3', backend_api_id: '2', environment_name: 'production', base_url: 'https://orders.acme.com/api/v1', is_default: true },
];

export const mockResources: BackendResource[] = [
  { id: 'res-1', backend_api_id: '1', name: 'List Customers', operation_id: 'listCustomers', description: 'Get paginated list of customers', http_method: 'GET', path_template: '/customers', request_schema: null, response_schema: null, is_active: true },
  { id: 'res-2', backend_api_id: '1', name: 'Get Customer', operation_id: 'getCustomer', description: 'Get customer by ID', http_method: 'GET', path_template: '/customers/{id}', request_schema: null, response_schema: null, is_active: true },
  { id: 'res-3', backend_api_id: '1', name: 'Create Customer', operation_id: 'createCustomer', description: 'Create a new customer', http_method: 'POST', path_template: '/customers', request_schema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } }, response_schema: null, is_active: true },
  { id: 'res-4', backend_api_id: '2', name: 'List Orders', operation_id: 'listOrders', description: 'Get all orders', http_method: 'GET', path_template: '/orders', request_schema: null, response_schema: null, is_active: true },
  { id: 'res-5', backend_api_id: '2', name: 'Create Order', operation_id: 'createOrder', description: 'Place a new order', http_method: 'POST', path_template: '/orders', request_schema: { type: 'object', properties: { customer_id: { type: 'string' }, items: { type: 'array' } } }, response_schema: null, is_active: true },
];

export const mockMcpServers: McpServer[] = [
  { id: 'mcp-1', organization_id: 'org-1', name: 'Customer Tools', slug: 'customer-tools', version: '1.0.0', title: 'Customer Management Tools', description: 'Tools for managing customer data', auth_mode: 'bearer', is_active: true, created_at: '2025-01-20T10:00:00Z', updated_at: '2025-03-20T14:30:00Z' },
  { id: 'mcp-2', organization_id: 'org-1', name: 'Order Tools', slug: 'order-tools', version: '1.0.0', title: 'Order Management Tools', description: 'Tools for order lifecycle', auth_mode: 'api_key', is_active: true, created_at: '2025-02-05T08:00:00Z', updated_at: '2025-03-18T09:00:00Z' },
];

export const mockTools: Tool[] = [
  { id: 'tool-1', mcp_server_id: 'mcp-1', name: 'get_customer', slug: 'get-customer', title: 'Get Customer', description: 'Retrieve a customer record by ID', input_schema: { type: 'object', properties: { customer_id: { type: 'string' } }, required: ['customer_id'] }, output_schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } } }, examples: null, risk_level: 'low', is_active: true, created_at: '2025-01-25T10:00:00Z', updated_at: '2025-03-20T14:30:00Z' },
  { id: 'tool-2', mcp_server_id: 'mcp-1', name: 'create_customer', slug: 'create-customer', title: 'Create Customer', description: 'Create a new customer record', input_schema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } }, required: ['name', 'email'] }, output_schema: null, examples: null, risk_level: 'medium', is_active: true, created_at: '2025-01-25T10:00:00Z', updated_at: '2025-03-20T14:30:00Z' },
  { id: 'tool-3', mcp_server_id: 'mcp-2', name: 'list_orders', slug: 'list-orders', title: 'List Orders', description: 'List all orders with optional filters', input_schema: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } }, output_schema: null, examples: null, risk_level: 'low', is_active: true, created_at: '2025-02-10T08:00:00Z', updated_at: '2025-03-18T09:00:00Z' },
];

export const mockScopes: Scope[] = [
  { id: 'scope-1', organization_id: 'org-1', name: 'customers.read', description: 'Read access to customer data', category: 'customers', is_sensitive: false, created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' },
  { id: 'scope-2', organization_id: 'org-1', name: 'customers.write', description: 'Write access to customer data', category: 'customers', is_sensitive: true, created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' },
  { id: 'scope-3', organization_id: 'org-1', name: 'orders.read', description: 'Read access to order data', category: 'orders', is_sensitive: false, created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' },
  { id: 'scope-4', organization_id: 'org-1', name: 'orders.write', description: 'Write access to order data', category: 'orders', is_sensitive: true, created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' },
  { id: 'scope-5', organization_id: 'org-1', name: 'admin.tools.execute', description: 'Execute any tool (admin)', category: 'admin', is_sensitive: true, created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' },
];

export const mockToolScopes: ToolScope[] = [
  { tool_id: 'tool-1', scope_id: 'scope-1' },
  { tool_id: 'tool-2', scope_id: 'scope-2' },
  { tool_id: 'tool-3', scope_id: 'scope-3' },
];

export const mockToolMappings: ToolMapping[] = [
  { id: 'map-1', tool_id: 'tool-1', backend_api_id: '1', backend_resource_id: 'res-2', request_mapping: { params: { id: '{{input.customer_id}}' } }, response_mapping: { extract: '$.data' }, error_mapping: { '404': 'Customer not found' }, auth_strategy: 'passthrough', timeout_override_ms: null, retry_override: null, is_active: true, created_at: '2025-01-25T10:00:00Z', updated_at: '2025-03-20T14:30:00Z' },
  { id: 'map-2', tool_id: 'tool-2', backend_api_id: '1', backend_resource_id: 'res-3', request_mapping: { body: { name: '{{input.name}}', email: '{{input.email}}' } }, response_mapping: null, error_mapping: null, auth_strategy: 'service_account', timeout_override_ms: 8000, retry_override: null, is_active: true, created_at: '2025-01-25T10:00:00Z', updated_at: '2025-03-20T14:30:00Z' },
];
