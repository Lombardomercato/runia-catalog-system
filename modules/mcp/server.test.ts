import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpBearerGate, validateMcpRequest } from './auth';
import { createRuniaSalesMcpServer } from './server';
import type { PricingContext, SalesCatalog, SalesProduct } from './types';

const safeProduct: SalesProduct = {
  id: '001708b0-5c27-4a40-85ff-c732ace91d22',
  sku: 'RUT150B',
  slug: 'dominio-rutini-v-malbec-x-750cc--001708b0-5c27-4a40-85ff-c732ace91d22',
  name: 'DOMINIO RUTINI V Malbec x 750cc',
  brand: 'RUTINI',
  category: 'Vinos',
  categorySlug: 'vinos',
  presentation: '750cc',
  description: null,
  imageUrl: null,
  price: 26701,
  basePrice: 26701,
  currency: 'ARS',
  pricingPolicy: 'RETAIL',
  discountPercent: 0,
  availability: 'SUPPLIER_AVAILABLE',
  opportunity: null,
};

class FakeCatalog implements SalesCatalog {
  async searchProducts(input: { query?: string; pricing: PricingContext }) {
    if (input.query?.toLocaleLowerCase('es-AR').includes('blocked')) return [];
    return [{
      ...safeProduct,
      pricingPolicy: input.pricing.policy,
      discountPercent: input.pricing.discountPercent,
      price: input.pricing.policy === 'CUSTOM_DISCOUNT' ? 24030.9 : safeProduct.price,
    }];
  }

  async getProduct(input: { productId?: string; sku?: string; pricing: PricingContext }) {
    if (input.sku === 'BLOCKED') return null;
    return (input.productId === safeProduct.id || input.sku === safeProduct.sku)
      ? (await this.searchProducts({ pricing: input.pricing }))[0]
      : null;
  }

  async searchGuides() {
    return [{ slug: 'vino-para-asado-no-siempre-malbec', title: 'El asado no pide siempre Malbec', description: 'Criterio editorial.', href: '/guias/vino-para-asado-no-siempre-malbec', matchedOn: ['asado'] }];
  }
}

test('MCP publica sólo las siete tools comerciales y ninguna acción privilegiada', async () => {
  const result = await callMcp('tools/list', {});
  const names = result.tools.map((tool: { name: string }) => tool.name);
  assert.deepEqual(names, [
    'search_products',
    'get_product',
    'recommend_products',
    'get_effective_price',
    'get_opportunities',
    'search_guides',
    'build_selection',
  ]);
  assert.equal(names.some((name: string) => /sql|admin|write/i.test(name)), false);
});

test('search_products conserva pricing CUSTOM server-side y no devuelve BLOCKED', async () => {
  const custom = await callMcp('tools/call', {
    name: 'search_products',
    arguments: {
      query: 'Rutini',
      pricing: { policy: 'CUSTOM_DISCOUNT', discountPercent: 10 },
      limit: 4,
    },
  });
  assert.equal(custom.structuredContent.products[0].price, 24030.9);
  assert.equal(custom.structuredContent.products[0].pricingPolicy, 'CUSTOM_DISCOUNT');

  const blocked = await callMcp('tools/call', {
    name: 'search_products',
    arguments: {
      query: 'blocked',
      pricing: { policy: 'RETAIL', discountPercent: 0 },
      limit: 4,
    },
  });
  assert.equal(blocked.structuredContent.count, 0);
});

test('schemas estrictos rechazan inyección de parámetros privilegiados', async () => {
  const response = await callMcp('tools/call', {
    name: 'search_products',
    arguments: {
      query: 'Rutini',
      pricing: { policy: 'RETAIL', discountPercent: 0 },
      sql: 'select * from secrets',
    },
  });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /validation|unrecognized|invalid/i);
});

test('validación HTTP bloquea Origin/Host ajenos sin relajar autenticación', () => {
  const request = new Request('https://runia.example/api/mcp', {
    method: 'POST',
    headers: {
      host: 'evil.example',
      origin: 'https://evil.example',
      'content-type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(validateMcpRequest(request, ['https://www.lombardomercato.com'], ['runia.example'])?.status, 403);
});

test('bearer inválido responde 401 y no se transforma en error interno', async () => {
  const authenticate = createMcpBearerGate('a'.repeat(48));
  const response = await authenticate(new Request('https://runia.example/api/mcp', {
    headers: { authorization: `Bearer ${'b'.repeat(48)}` },
  }));
  assert.ok(response instanceof Response);
  assert.equal(response.status, 401);
});

async function callMcp(method: string, params: Record<string, unknown>) {
  const handler = createMcpHandler(
    () => createRuniaSalesMcpServer(new FakeCatalog()),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const response = await handler.fetch(new Request('https://runia.example/api/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'test', method, params }),
  }));
  assert.equal(response.status, 200);
  const text = await response.text();
  const payload = text.startsWith('event:')
    ? JSON.parse(text.split('\ndata: ').at(-1)?.trim() ?? '{}')
    : JSON.parse(text);
  assert.equal(payload.jsonrpc, '2.0');
  return payload.result;
}
