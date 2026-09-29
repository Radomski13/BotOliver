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
- Add, edit, duplicate and delete products
- Upload photos (big phone photos are shrunk automatically)
- Set sizes and a Shopify variant ID per size
- Mark items Sold out, or Hidden (draft — not shown in the store)
- Reorder with the ▲ ▼ buttons

Changes are live as soon as you click Save — no redeploy needed.

## Where data lives
Products and uploaded photos are stored in Netlify Blobs for your site
(Netlify → your site → **Blobs**). They survive redeploys.
The six starter products in `netlify/lib/seed-products.mjs` are only used until you first save something in the admin.

## Other store settings
Store name, shipping, promo codes, contact info and the Shopify domain are in the
**STORE SETTINGS** block at the top of `src/script.js` (edit, then push/redeploy).

## Turn on checkout (Shopify)
1. Set `shopifyDomain` in `src/script.js` (e.g. `your-store.myshopify.com`).
2. In /admin, enter the Shopify variant ID for each size of each product.
3. Create the same promo codes in Shopify so they apply at checkout.

## Run it on your computer (optional)
```
npm install
ADMIN_PASSWORD=test123 npx netlify dev
```
Then open http://localhost:8888 and http://localhost:8888/admin

## Files
- `src/` — the store (and `src/admin/` for the admin page)
- `netlify/functions/api.mjs` — products, login and upload API
- `netlify/functions/uploads.mjs` — serves uploaded photos at `/uploads/...`
- `netlify/lib/` — shared code and starter products
- `netlify.toml` — Netlify settings

---
UI built on [cs16.css](https://github.com/ekmas/cs16.css) by samke. Based on the MIT-licensed "home" project by Roman Mendaliev (see LICENSE).

Not affiliated with or endorsed by Valve Corporation. Counter-Strike is a trademark of Valve Corporation.
