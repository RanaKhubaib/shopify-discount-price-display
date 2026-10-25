import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const raw = process.argv[2];
if (!raw) {
  console.error(
    "Usage: node scripts/set-app-url.mjs https://your-service.onrender.com",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error(`Invalid URL: ${raw}`);
  process.exit(1);
}

if (parsed.protocol !== "https:") {
  console.error("SHOPIFY_APP_URL must use https");
  process.exit(1);
}

const url = parsed.origin;
const tomlPath = resolve("shopify.app.toml");
let toml = readFileSync(tomlPath, "utf8");

if (!/application_url\s*=/.test(toml)) {
  console.error("shopify.app.toml is missing application_url");
  process.exit(1);
}

toml = toml.replace(
  /application_url\s*=\s*".*"/,
  `application_url = "${url}"`,
);

if (!/\[auth\][\s\S]*redirect_urls\s*=/.test(toml)) {
  console.error("shopify.app.toml is missing [auth] redirect_urls");
  process.exit(1);
}

toml = toml.replace(
  /\[auth\]\s*redirect_urls\s*=\s*\[[^\]]*\]/,
  `[auth]\nredirect_urls = [\n  "${url}/auth/callback",\n]`,
);

writeFileSync(tomlPath, toml);
console.log(`Updated shopify.app.toml application_url to ${url}`);
console.log("Next: shopify app deploy");
