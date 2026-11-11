import assert from "node:assert/strict";
import { test } from "node:test";
import { syncDiscounts } from "./discount-sync.server.js";

const productId = "gid://shopify/Product/1";

function makeAdmin({ items, variants }) {
  let savedPrices;

  return {
    getSavedPrices: () => savedPrices,
    async graphql(query, options) {
      let data;
      if (query.includes("discountNodes(first:")) {
        data = {
          discountNodes: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                discount: {
                  status: "ACTIVE",
                  customerGets: {
                    value: { percentage: 0.1 },
                    items,
                  },
                },
              },
            ],
          },
        };
      } else if (query.includes("nodes(ids: $ids)")) {
        data = {
          nodes: [{ id: productId, handle: "sample-product", variants }],
        };
      } else if (query.includes("metafieldsSet(metafields:")) {
        data = { metafieldsSet: { userErrors: [] } };
        savedPrices = JSON.parse(options.variables.m[0].value);
      } else if (query.includes("shop {")) {
        data = { shop: { id: "gid://shopify/Shop/1" } };
      } else {
        throw new Error(`Unexpected GraphQL query: ${query}`);
      }

      return { json: async () => ({ data }) };
    },
  };
}

test("sync preserves undiscounted variant prices without making an unsafe card price", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [] },
      productVariants: {
        nodes: [
          {
            id: "gid://shopify/ProductVariant/101",
            product: { id: productId },
          },
        ],
      },
    },
    variants: {
      nodes: [
        { id: "gid://shopify/ProductVariant/101", price: "100.00" },
        { id: "gid://shopify/ProductVariant/102", price: "50.00" },
      ],
    },
  });

  await syncDiscounts(admin);

  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.variants["101"], { o: 100, s: 90 });
  assert.deepEqual(entry.variants["102"], { o: 50, s: 50 });
  assert.equal("card" in entry, false);
});

test("sync sets the card price from a real variant when every variant is discounted", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [
        { id: "gid://shopify/ProductVariant/101", price: "100.00" },
        { id: "gid://shopify/ProductVariant/102", price: "50.00" },
      ],
    },
  });

  await syncDiscounts(admin);

  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.card, { o: 50, s: 45 });
});
