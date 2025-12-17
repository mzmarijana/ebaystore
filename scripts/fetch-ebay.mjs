import fs from "fs/promises";

const EBAY_APP_ID = process.env.EBAY_APP_ID;       // from GitHub Secrets
const EBAY_SELLER = process.env.EBAY_SELLER || "kareanna65";
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 24);

if (!EBAY_APP_ID) {
  throw new Error("Missing EBAY_APP_ID (set it in GitHub repo Secrets).");
}

const endpoint = "https://svcs.ebay.com/services/search/FindingService/v1";

function buildUrl(pageNumber = 1) {
  const u = new URL(endpoint);
  u.searchParams.set("OPERATION-NAME", "findItemsAdvanced");
  u.searchParams.set("SERVICE-VERSION", "1.13.0");
  u.searchParams.set("SECURITY-APPNAME", EBAY_APP_ID);
  u.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
  u.searchParams.set("REST-PAYLOAD", "true");

  // Filter to your seller (and worldwide location, per eBay guidance)
  u.searchParams.set("itemFilter(0).name", "Seller");
  u.searchParams.set("itemFilter(0).value", EBAY_SELLER);
  u.searchParams.set("itemFilter(1).name", "LocatedIn");
  u.searchParams.set("itemFilter(1).value", "WorldWide"); // helps return all active items :contentReference[oaicite:2]{index=2}

  u.searchParams.set("paginationInput.entriesPerPage", "50");
  u.searchParams.set("paginationInput.pageNumber", String(pageNumber));

  // Ask for better images when available
  u.searchParams.set("outputSelector(0)", "PictureURLLarge");
  u.searchParams.set("outputSelector(1)", "PictureURLSuperSize");

  return u.toString();
}

async function fetchPage(page) {
  const res = await fetch(buildUrl(page));
  if (!res.ok) throw new Error(`eBay API error: ${res.status} ${res.statusText}`);
  return res.json();
}

function normalize(item) {
  const title = item?.title?.[0] ?? "";
  const url = item?.viewItemURL?.[0] ?? "#";
  const price = item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? "";
  const currency = item?.sellingStatus?.[0]?.currentPrice?.[0]?.["@currencyId"] ?? "";

  const img =
    item?.pictureURLSuperSize?.[0] ||
    item?.pictureURLLarge?.[0] ||
    item?.galleryURL?.[0] ||
    "";

  return { title, url, price: price ? `${price} ${currency}`.trim() : "", image: img };
}

async function run() {
  let all = [];
  let page = 1;

  while (all.length < MAX_ITEMS && page <= 5) {
    const data = await fetchPage(page);
    const items = data?.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item ?? [];
    all.push(...items.map(normalize).filter(x => x.url && x.image));
    page++;
    if (items.length === 0) break;
  }

  all = all.slice(0, MAX_ITEMS);

  const out = {
    seller: EBAY_SELLER,
    updatedAt: new Date().toISOString(),
    items: all
  };

  await fs.mkdir("assets", { recursive: true });
  await fs.writeFile("assets/ebay-listings.json", JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${all.length} items to assets/ebay-listings.json`);
}

run();
