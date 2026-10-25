const REQUIRED_IN_PRODUCTION = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
];

export function assertProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}. Set them on the host, then run: node scripts/set-app-url.mjs <public-https-url> && shopify app deploy`,
    );
  }

  let parsed;
  try {
    parsed = new URL(process.env.SHOPIFY_APP_URL);
  } catch {
    throw new Error(
      `SHOPIFY_APP_URL is not a valid URL: ${process.env.SHOPIFY_APP_URL}`,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error("SHOPIFY_APP_URL must use https in production");
  }
}
