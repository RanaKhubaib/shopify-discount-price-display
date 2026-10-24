const NS = "discount_display";

const DISCOUNTS_QUERY = `#graphql
query {
  automaticDiscountNodes(first: 50) {
    nodes {
      automaticDiscount {
        ... on DiscountAutomaticBasic {
          title
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
            }
          }
        }
      }
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
  cardSelector: ".price",
  productSelector: ".price",
};

const numId = (gid) => gid.split("/").pop();

export async function loadSettings(admin) {
  const res = await admin.graphql(SHOP_QUERY);
  const json = await res.json();
  const raw = json.data.shop.metafield?.value;
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveSettings(admin, settings) {
  const res = await admin.graphql(SHOP_QUERY);
  const shopId = (await res.json()).data.shop.id;
  await admin.graphql(SET_MUTATION, {
    variables: {
      m: [{
        ownerId: shopId,
        namespace: NS,
        key: "settings",
        type: "json",
        value: JSON.stringify(settings),
      }],
    },
  });
}

function applyValue(price, value) {
  if (value.percentage !== undefined) return price * (1 - value.percentage);
  if (value.amount) return Math.max(0, price - parseFloat(value.amount.amount));
  return price;
}

export async function syncDiscounts(admin) {
  // 1. Read active automatic discounts
  const dRes = await admin.graphql(DISCOUNTS_QUERY);
  const dJson = await dRes.json();
  const nodes = dJson.data.automaticDiscountNodes.nodes;

  const rules = [];
  for (const n of nodes) {
    const d = n.automaticDiscount;
    if (!d || d.status !== "ACTIVE" || !d.customerGets) continue;
    const items = d.customerGets.items;
    if (!items || !items.products) continue; // only specific products/variants
    const value = d.customerGets.value;
    if (!value || (value.percentage === undefined && !value.amount)) continue;
    rules.push({
      value,
      productIds: items.products.nodes.map((p) => p.id),
      variantIds: items.productVariants.nodes.map((v) => v.id),
      variantProductIds: items.productVariants.nodes.map((v) => v.product.id),
    });
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
    const res = await admin.graphql(PRODUCTS_QUERY, {
      variables: { ids: ids.slice(i, i + 50) },
    });
    const json = await res.json();
    json.data.nodes.forEach((p) => p && products.push(p));
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
  const sRes = await admin.graphql(SHOP_QUERY);
  const shopId = (await sRes.json()).data.shop.id;
  const setRes = await admin.graphql(SET_MUTATION, {
    variables: {
      m: [{
        ownerId: shopId,
        namespace: NS,
        key: "prices",
        type: "json",
        value: JSON.stringify(out),
      }],
    },
  });
  const errors = (await setRes.json()).data.metafieldsSet.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));

  return { count: Object.keys(out).length };
}