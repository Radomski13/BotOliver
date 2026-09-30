# Frag Supply Co. — CS-style merch store + product admin (Netlify)

A Counter-Strike 1.6 menu-styled storefront with a password-protected admin page at `/admin`.
Runs on Netlify: the store is static, the admin uses Netlify Functions, and products and
photos are saved in Netlify Blobs (built in, no database to set up).

## Deploy to Netlify

> Drag-and-drop deploys (Netlify Drop) **won't work** — they skip the functions the admin needs.
> Use GitHub (Option A) or the Netlify CLI (Option B).

### Option A — GitHub (recommended, auto-deploys when you push changes)
1. Create a new GitHub repo and upload everything in this folder.
2. In Netlify: **Add new site → Import an existing project → GitHub** → pick the repo.
   Build settings fill in from `netlify.toml` — leave them as-is and click **Deploy**.
3. Set your admin password (next section).

### Option B — Netlify CLI
```
npm install
npx netlify login
npx netlify deploy --build --prod
```

### Set the admin password (required)
Netlify → your site → **Site configuration → Environment variables → Add a variable**
- Key: `ADMIN_PASSWORD`  Value: a strong password
- Then **Deploys → Trigger deploy → Deploy site** so it takes effect.

Optional: `SESSION_SECRET` — any long random text. Changing it (or the password) logs everyone out.

## Using the admin page (yoursite.netlify.app/admin)
Tabs across the top:
- **Products** — add, edit, duplicate, delete, reorder; upload photos; sizes and Shopify variant IDs; Sold out / Hidden
- **Home page** — store name, tagline, browser tab title, Google description, footer text, and the menu
  (rename, reorder, hide items, or add your own links like Instagram or your discount game)
- **Welcome** — the pop-up window: title, map name, headline, text, bullet points, button text, and whether it pops up on first visit
- **Store info** — the tabs in the Store info window (add/remove/reorder tabs; each has text, an optional table and a note)
- **Checkout & promos** — shipping rate, free-shipping amount, currency, Shopify domain, and promo codes

Changes are live as soon as you click Save — no redeploy needed.
In any text you can type `{free_shipping_min}` or `{flat_rate}` and it fills in your current shipping numbers.
Links and email addresses typed in text become clickable automatically.

## Products from Shopify
Products can come straight from your Shopify store:
1. Admin → **Checkout & promos** → enter your Shopify domain (e.g. `your-store.myshopify.com`) → Save.
2. Admin → **Products** → **Sync from Shopify**. After that it syncs automatically every hour
   (turn this off in Checkout & promos).

What comes from Shopify: title, price (per size), description, photos, sizes/options, stock (per size),
product type (as category), vendor (as brand) and the variant IDs checkout needs — so checkout works with no typing.
What you set here and is kept between syncs: Hidden, and the Google & Meta ad details (color, gender, age group,
Google category, GTIN).

Notes:
- Uses Shopify's public product list (`/products.json`) — no API key. The store can't be password protected.
- Products deleted or unpublished in Shopify are removed on the next sync.
- The starter example products are removed on the first sync. Products you add by hand here are kept
  (unless you untick "Keep products I added here").

## Product pages, feed and ad tracking
- Every product has its own page: `yoursite.com/product/<product-id>` (add `?size=XL` to preselect a size).
  Pages include price/stock tags for Meta and Google, and Google's product data (schema.org).
- **Product feed** for Google Merchant Center and Meta catalogs: `yoursite.com/feed.xml`
  (one entry per size; updates automatically). Copy it from Admin → **Ads & feeds**.
- **Sitemap:** `yoursite.com/sitemap.xml` (submit in Google Search Console). `robots.txt` is automatic.
- **Tracking:** add your Meta Pixel ID and/or Google tag ID in Admin → **Ads & feeds**. Sends page views,
  product views, add to cart and checkout, with product IDs that match the feed.
- Google and Meta can't use SVG images — upload JPG/PNG/WEBP photos (the admin warns you).
- For apparel, Google Merchant needs color, size, gender and age group — fill these in each product's
  "Google & Meta ads" section.

## Where data lives
Products and uploaded photos are stored in Netlify Blobs for your site
(Netlify → your site → **Blobs**). They survive redeploys.
The starter products and content in `netlify/lib/seed-products.mjs` and `seed-settings.mjs` are only used
until you first save in the admin.

## Turn on checkout (Shopify)
1. In /admin → **Checkout & promos**, enter your Shopify domain (e.g. `your-store.myshopify.com`).
2. In /admin → **Products**, enter the Shopify variant ID for each size of each product.
3. Create the same promo codes in Shopify so they apply at checkout.
   (Promo codes are checked on the server, so shoppers can't see your list.)

## Run it on your computer (optional)
```
npm install
ADMIN_PASSWORD=test123 npx netlify dev
```
Then open http://localhost:8888 and http://localhost:8888/admin

## Files
- `src/` — the store (and `src/admin/` for the admin page)
- `netlify/functions/api.mjs` — products, site content, promo codes, login and upload API
- `netlify/functions/uploads.mjs` — serves uploaded photos at `/uploads/...`
- `netlify/functions/product.mjs` — product pages at `/product/...`
- `netlify/functions/feed.mjs` — product feed at `/feed.xml`
- `netlify/functions/seo.mjs` — `/sitemap.xml` and `/robots.txt`
- `netlify/functions/shopify-sync-scheduled.mjs` — hourly Shopify sync
- `netlify/lib/shopify.mjs` — Shopify product import
- `netlify/lib/` — shared code, starter products and starter site content
- `netlify.toml` — Netlify settings

---
UI built on [cs16.css](https://github.com/ekmas/cs16.css) by samke. Based on the MIT-licensed "home" project by Roman Mendaliev (see LICENSE).

Not affiliated with or endorsed by Valve Corporation. Counter-Strike is a trademark of Valve Corporation.
