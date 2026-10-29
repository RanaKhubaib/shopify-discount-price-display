import { useState } from "react";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  loadSettings,
  saveSettings,
  syncDiscounts,
} from "../discount-sync.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return { settings: await loadSettings(admin) };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const f = await request.formData();
  const cardSelectors = f
    .getAll("cardSelectors")
    .map((selector) => String(selector).trim())
    .filter(Boolean);
  const productSelectors = f
    .getAll("productSelectors")
    .map((selector) => String(selector).trim())
    .filter(Boolean);

  if (cardSelectors.length === 0 || productSelectors.length === 0) {
    return {
      ok: false,
      error:
        "Add at least one CSS selector for product cards and product pages.",
    };
  }

  const settings = {
    enabled: f.get("enabled") === "on",
    showOnCards: f.get("showOnCards") === "on",
    showOnProductPage: f.get("showOnProductPage") === "on",
    saleColor: String(f.get("saleColor") || "#d82c0d"),
    cardSelectors,
    productSelectors,
  };
  await saveSettings(admin, settings);

  try {
    const result = await syncDiscounts(admin);
    return { ok: true, count: result.count };
  } catch (error) {
    return {
      ok: false,
      settingsSaved: true,
      error:
        error instanceof Error
          ? error.message
          : "Settings were saved, but Shopify discount sync failed.",
    };
  }
};

export default function Settings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";
  const [cardSelectors, setCardSelectors] = useState(settings.cardSelectors);
  const [productSelectors, setProductSelectors] = useState(
    settings.productSelectors,
  );

  const updateSelector = (setSelectors, index, value) => {
    setSelectors((current) =>
      current.map((selector, selectorIndex) =>
        selectorIndex === index ? value : selector,
      ),
    );
  };

  const renderSelectors = (
    label,
    name,
    selectors,
    setSelectors,
    placeholder,
  ) => (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{label}</h3>
      <p style={{ margin: "0 0 12px", color: "#616161", fontSize: 14 }}>
        Add every CSS selector your theme uses. Each selector is checked.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {selectors.map((selector, index) => (
          <div
            key={`${name}-${index}`}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <input
              id={`${name}-${index}`}
              aria-label={`${label} selector ${index + 1}`}
              name={name}
              value={selector}
              onChange={(event) =>
                updateSelector(setSelectors, index, event.target.value)
              }
              placeholder={placeholder}
              style={{
                boxSizing: "border-box",
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                border: "1px solid #8c9196",
                borderRadius: 8,
                font: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() =>
                setSelectors((current) =>
                  current.filter((_, selectorIndex) => selectorIndex !== index),
                )
              }
              disabled={selectors.length === 1}
              aria-label={`Remove ${label.toLowerCase()} selector ${index + 1}`}
              style={{
                padding: "8px 10px",
                border: "1px solid #c9cccf",
                borderRadius: 8,
                background: "white",
                cursor: selectors.length === 1 ? "not-allowed" : "pointer",
                opacity: selectors.length === 1 ? 0.5 : 1,
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setSelectors((current) => [...current, ""])}
        style={{
          marginTop: 10,
          padding: "8px 12px",
          border: "1px solid #8c9196",
          borderRadius: 8,
          background: "white",
          cursor: "pointer",
        }}
      >
        Add selector
      </button>
    </div>
  );

  return (
    <s-page heading="Discount price settings">
      <div
        style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 40px" }}
      >
        <p style={{ margin: "0 0 20px", color: "#616161", lineHeight: 1.5 }}>
          Choose how discounted prices appear in your storefront and sync active
          Shopify discounts.
        </p>

        {fetcher.data?.ok && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              background: "#eaf7ed",
              color: "#1a5e2a",
            }}
          >
            Settings saved. {fetcher.data.count} discounted product(s) synced.
          </div>
        )}
        {fetcher.data?.error && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              background: "#fff1f0",
              color: "#8e1f0b",
            }}
          >
            {fetcher.data.settingsSaved
              ? "Settings were saved, but discount sync failed: "
              : ""}
            {fetcher.data.error}
          </div>
        )}

        <fetcher.Form method="post">
          <s-section heading="Display">
            <div style={{ display: "grid", gap: 16, padding: 4 }}>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <input
                  id="settings-enabled"
                  aria-label="Enable discounted price display"
                  type="checkbox"
                  name="enabled"
                  defaultChecked={settings.enabled}
                />
                <span>
                  <strong>Enable discounted price display</strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    Show synced sale prices on your online store.
                  </span>
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <input
                  id="settings-show-on-cards"
                  aria-label="Show discounted prices on product cards"
                  type="checkbox"
                  name="showOnCards"
                  defaultChecked={settings.showOnCards}
                />
                <span>
                  <strong>Product cards</strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    Show sale prices on collection and home page cards.
                  </span>
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <input
                  id="settings-show-on-product-page"
                  aria-label="Show discounted prices on product pages"
                  type="checkbox"
                  name="showOnProductPage"
                  defaultChecked={settings.showOnProductPage}
                />
                <span>
                  <strong>Product pages</strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    Show sale prices on the main product page.
                  </span>
                </span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <strong>Sale price color</strong>
                <input
                  type="color"
                  name="saleColor"
                  defaultValue={settings.saleColor}
                  aria-label="Sale price color"
                  style={{
                    width: 48,
                    height: 40,
                    padding: 2,
                    border: "1px solid #8c9196",
                    borderRadius: 8,
                  }}
                />
              </label>
            </div>
          </s-section>

          <s-section heading="Theme price selectors">
            <div style={{ padding: 4 }}>
              {renderSelectors(
                "Product card price selectors",
                "cardSelectors",
                cardSelectors,
                setCardSelectors,
                ".price-item--regular",
              )}
              {renderSelectors(
                "Product page price selectors",
                "productSelectors",
                productSelectors,
                setProductSelectors,
                ".price-item--regular",
              )}
            </div>
          </s-section>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "11px 18px",
                border: 0,
                borderRadius: 8,
                background: saving ? "#8c9196" : "#008060",
                color: "white",
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving and syncing..." : "Save and sync discounts"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
