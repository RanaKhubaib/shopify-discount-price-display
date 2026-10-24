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
  const settings = {
    enabled: f.get("enabled") === "on",
    showOnCards: f.get("showOnCards") === "on",
    showOnProductPage: f.get("showOnProductPage") === "on",
    saleColor: String(f.get("saleColor") || "#d82c0d"),
    cardSelector: String(f.get("cardSelector") || ".price"),
    productSelector: String(f.get("productSelector") || ".price"),
  };
  await saveSettings(admin, settings);
  const result = await syncDiscounts(admin);
  return { ok: true, count: result.count };
};

export default function Settings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";

  return (
    <s-page heading="Discount price display">
      <div style={{ padding: 16, maxWidth: 520 }}>
        <fetcher.Form method="post">
          <p>
            <label>
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />{" "}
              Enable discounted price display
            </label>
          </p>
          <p><b>Where to show the discounted price</b></p>
          <p>
            <label>
              <input type="checkbox" name="showOnCards" defaultChecked={settings.showOnCards} />{" "}
              Product cards (collections, home page)
            </label>
          </p>
          <p>
            <label>
              <input type="checkbox" name="showOnProductPage" defaultChecked={settings.showOnProductPage} />{" "}
              Main product page
            </label>
          </p>
          <p>
            <label>Sale price color{" "}
              <input type="color" name="saleColor" defaultValue={settings.saleColor} />
            </label>
          </p>
          <p>
            <label>Product card price selector<br />
              <input name="cardSelector" defaultValue={settings.cardSelector} style={{ width: "100%" }} />
            </label>
          </p>
          <p>
            <label>Product page price selector<br />
              <input name="productSelector" defaultValue={settings.productSelector} style={{ width: "100%" }} />
            </label>
          </p>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save & sync discounts"}
          </button>
        </fetcher.Form>
        {fetcher.data?.ok && (
          <p>Saved. {fetcher.data.count} discounted product(s) synced.</p>
        )}
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);