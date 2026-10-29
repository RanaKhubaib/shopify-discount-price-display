const NS = "discount_display";

const DISCOUNTS_QUERY = `#graphql
query ($after: String) {
  discountNodes(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      discount {
        ... on DiscountAutomaticBasic {
          status
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount } }
            }
            items {
              ... on DiscountProducts {
                products(first: 100) { nodes { id } }
                productVariants(first: 100) { nodes { id product { id } } }
              }
              ... on DiscountCollections {
                collections(first: 100) { nodes { id } }
              }
            }
          }
        }
        ... on DiscountCodeBasic {
          status
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount } }
            }
            items {
              ... on DiscountProducts {
                products(first: 100) { nodes { id } }
                productVariants(first: 100) { nodes { id product { id } } }
              }
              ... on DiscountCollections {
                collections(first: 100) { nodes { id } }
              }
            }
          }
        }
      }
    }
  }
}`;

const COLLECTION_PRODUCTS_QUERY = `#graphql
query ($id: ID!, $cursor: String) {
  collection(id: $id) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id }
    }
  }
}`;

const PRODUCTS_QUERY = `#graphql
query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      handle
      variants(first: 100) { nodes { id price } }
    }
  }
}`;

const SHOP_QUERY = `#graphql
query {
  shop {
    id
    metafield(namespace: "${NS}", key: "settings") { value }
  }
}`;

const SET_MUTATION = `#graphql
mutation ($m: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $m) {
    userErrors { field message }
  }
}`;

export const DEFAULT_SETTINGS = {
  enabled: false,
  showOnCards: true,
  showOnProductPage: true,
  saleColor: "#d82c0d",
  cardSelectors: [".price"],
  productSelectors: [".price"],
};

const numId = (gid) => gid.split("/").pop();

async function readGraphQL(admin, query, variables) {
  const response = variables
    ? await admin.graphql(query, { variables })
    : await admin.graphql(query);
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  if (!json.data)
    throw new Error("Shopify returned no data for a GraphQL request.");
  return json.data;
}

function getSelectors(settings, pluralKey, legacyKey, fallback) {
  const saved = settings[pluralKey];
  const values = Array.isArray(saved) ? saved : [settings[legacyKey]];
  const selectors = values
    .filter((selector) => typeof selector === "string")
    .map((selector) => selector.trim())
    .filter(Boolean);
  return selectors.length ? selectors : fallback;
}

export async function loadSettings(admin) {
  const data = await readGraphQL(admin, SHOP_QUERY);
  const raw = data.shop.metafield?.value;
  const saved = raw ? JSON.parse(raw) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    cardSelectors: getSelectors(
      saved,
      "cardSelectors",
      "cardSelector",
      DEFAULT_SETTINGS.cardSelectors,
    ),
    productSelectors: getSelectors(
      saved,
      "productSelectors",
      "productSelector",
      DEFAULT_SETTINGS.productSelectors,
    ),
  };
}

export async function saveSettings(admin, settings) {
  const data = await readGraphQL(admin, SHOP_QUERY);
  const result = await readGraphQL(admin, SET_MUTATION, {
    m: [
      {
        ownerId: data.shop.id,
        namespace: NS,
        key: "settings",
        type: "json",
        value: JSON.stringify(settings),
      },
    ],
  });
  const errors = result.metafieldsSet?.userErrors || [];
  if (errors.length)
    throw new Error(errors.map((error) => error.message).join(", "));
  if (!result.metafieldsSet)
    throw new Error("Shopify did not save the discount settings.");
}

function applyValue(price, value) {
  if (value.percentage !== undefined) return price * (1 - value.percentage);
  if (value.amount) return Math.max(0, price - parseFloat(value.amount.amount));
  return price;
}

async function productsInCollection(admin, collectionId, maxProducts = 500) {
  const ids = [];
  let cursor = null;
  while (ids.length < maxProducts) {
    const data = await readGraphQL(admin, COLLECTION_PRODUCTS_QUERY, {
      id: collectionId,
      cursor,
    });
    const connection = data.collection?.products;
    if (!connection) {
      throw new Error(
        `Shopify could not load products for collection ${collectionId}.`,
      );
    }
    for (const p of connection.nodes) {
      if (p?.id) ids.push(p.id);
      if (ids.length >= maxProducts) break;
    }
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
    if (!cursor)
      throw new Error(
        `Shopify returned no product cursor for collection ${collectionId}.`,
      );
  }
  return ids;
}

export async function syncDiscounts(admin) {
  // 1. Read active basic automatic and code discounts.
  const rules = [];
  const collectionCache = new Map();
  let discountCursor = null;
  let hasMoreDiscounts = true;

  while (hasMoreDiscounts) {
    const data = await readGraphQL(admin, DISCOUNTS_QUERY, {
      after: discountCursor,
    });
    const connection = data.discountNodes;
    if (!connection) throw new Error("Shopify did not return discount data.");

    for (const node of connection.nodes) {
      const discount = node.discount;
      if (!discount || discount.status !== "ACTIVE" || !discount.customerGets)
        continue;
      const value = discount.customerGets.value;
      if (!value || (value.percentage === undefined && !value.amount)) continue;

      const items = discount.customerGets.items;
      if (!items) continue;

      const productIds = [];
      const variantIds = [];
      const variantProductIds = [];

      if (items.products) {
        for (const product of items.products.nodes || []) {
          if (product?.id) productIds.push(product.id);
        }
        for (const variant of items.productVariants.nodes || []) {
          if (!variant?.id) continue;
          variantIds.push(variant.id);
          if (variant.product?.id) variantProductIds.push(variant.product.id);
        }
      }

      if (items.collections) {
        for (const collection of items.collections.nodes || []) {
          if (!collection?.id) continue;
          let ids = collectionCache.get(collection.id);
          if (!ids) {
            ids = await productsInCollection(admin, collection.id);
            collectionCache.set(collection.id, ids);
          }
          productIds.push(...ids);
        }
      }

      if (productIds.length || variantIds.length) {
        rules.push({ value, productIds, variantIds, variantProductIds });
      }
    }

    hasMoreDiscounts = connection.pageInfo.hasNextPage;
    if (hasMoreDiscounts) {
      discountCursor = connection.pageInfo.endCursor;
      if (!discountCursor) {
        throw new Error("Shopify returned no cursor for additional discounts.");
      }
    }
  }

  // 2. Collect all product ids
  const allIds = new Set();
  rules.forEach((r) => {
    r.productIds.forEach((id) => allIds.add(id));
    r.variantProductIds.forEach((id) => allIds.add(id));
  });
  const ids = [...allIds];

  // 3. Load product prices (50 at a time)
  const products = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await readGraphQL(admin, PRODUCTS_QUERY, {
      ids: ids.slice(i, i + 50),
    });
    data.nodes.forEach((product) => product && products.push(product));
  }

  // 4. Calculate sale prices (best discount wins)
  const out = {};
  for (const p of products) {
    const variants = {};
    for (const v of p.variants.nodes) {
      const orig = parseFloat(v.price);
      let best = null;
      for (const r of rules) {
        const applies =
          r.productIds.includes(p.id) || r.variantIds.includes(v.id);
        if (!applies) continue;
        const sale = applyValue(orig, r.value);
        if (best === null || sale < best) best = sale;
      }
      if (best !== null && best < orig) {
        variants[numId(v.id)] = {
          o: orig,
          s: Math.round(best * 100) / 100,
        };
      }
    }
    const list = Object.values(variants);
    if (list.length === 0) continue;
    const lowest = list.reduce((a, b) => (b.s < a.s ? b : a));
    out[p.handle] = { variants, o: lowest.o, s: lowest.s };
  }

  // 5. Save to a shop metafield
  const shopData = await readGraphQL(admin, SHOP_QUERY);
  const saveResult = await readGraphQL(admin, SET_MUTATION, {
    m: [
      {
        ownerId: shopData.shop.id,
        namespace: NS,
        key: "prices",
        type: "json",
        value: JSON.stringify(out),
      },
    ],
  });
  const errors = saveResult.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
  if (!saveResult.metafieldsSet)
    throw new Error("Shopify did not save the synced prices.");

  return { count: Object.keys(out).length };
}
