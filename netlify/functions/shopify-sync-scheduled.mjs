import { loadSettings } from '../lib/shared.mjs';
import { syncFromShopify } from '../lib/shopify.mjs';

// Runs every hour on Netlify and pulls the latest products from Shopify
// (only when "Sync automatically" is on and a Shopify domain is set).
export const config = { schedule: '@hourly' };

export default async () => {
    const settings = await loadSettings();
    if (!settings.shopifySync?.auto || !settings.commerce?.shopifyDomain) {
        return new Response('Auto sync is off.');
    }
    const result = await syncFromShopify({ trigger: 'hourly' });
    console.log('Shopify sync:', JSON.stringify(result));
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
