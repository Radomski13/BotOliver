// Starting site content, used until you save anything under "Site content" in the admin.
export default {
    site: {
        name: 'Frag Supply Co.',
        tagline: 'Merch for the clutch',
        pageTitle: 'Frag Supply Co. | Counter-Strike Inspired Merch',
        metaDescription: 'Tees, hoodies, caps, desk mats and stickers for CS players. Built for the grind, made for the clutch.',
        footer: 'Not affiliated with or endorsed by Valve Corporation. Counter-Strike is a trademark of Valve Corporation.',
    },

    // Home page menu, top to bottom.
    // type: buy | cart | info | welcome | link
    menu: [
        { type: 'buy', label: 'Buy menu', visible: true },
        { type: 'cart', label: 'Cart', visible: true },
        { type: 'info', label: 'Store info', visible: true },
        { type: 'welcome', label: 'Welcome', visible: true },
    ],

    welcome: {
        showOnFirstVisit: true,
        windowTitle: 'Join Server',
        mapName: 'de_merch',
        headline: 'Welcome to Frag Supply Co.',
        body: 'Gear for people who have played "one more game" at 3 AM. Tees, hoodies, caps, desk mats and stickers, designed by players, for players.',
        perks: [
            'Free shipping on orders over {free_shipping_min}',
            'Printed to order, ships in 3–5 business days',
            'Easy 30-day returns',
        ],
        hint: 'Hit Start to open the buy menu.',
        startLabel: 'Start',
    },

    info: {
        windowTitle: 'Store Info',
        tabs: [
            {
                title: 'Shipping',
                body: 'Every item is printed to order. Orders ship in 3–5 business days.\n\nUS shipping is a flat {flat_rate}, or free on orders over {free_shipping_min}.\n\nYou\'ll get a tracking number by email as soon as your order ships.',
                table: [],
                note: '',
            },
            {
                title: 'Returns',
                body: 'Not happy? Send it back within 30 days of delivery for a refund or exchange.\n\nItems must be unworn and unwashed. Stickers are final sale.\n\nWrong size? Exchanges are free.',
                table: [],
                note: '',
            },
            {
                title: 'Sizes',
                body: '',
                table: [
                    ['Size', 'Chest (in)', 'Length (in)'],
                    ['S', '34–36', '28'],
                    ['M', '38–40', '29'],
                    ['L', '42–44', '30'],
                    ['XL', '46–48', '31'],
                    ['2XL', '50–52', '32'],
                ],
                note: 'Unisex fit. Between sizes? Size up.',
            },
            {
                title: 'Contact',
                body: 'Email: support@example.com\n\nInstagram: https://instagram.com/yourstore',
                table: [],
                note: 'We reply within one business day.',
            },
        ],
    },

    appearance: {
        // Phone background. zoom 100 = fills the screen (original look).
        mobileBg: { zoom: 100, posX: 50, posY: 50, darken: 0, color: '#0d1420' },
    },

    commerce: {
        currency: 'USD',
        flatRate: 5.99,
        freeOver: 75,
        shopifyDomain: '',
        promoCodes: [
            { code: 'HEADSHOT10', type: 'percent', value: 10 },
            { code: 'CLUTCH15', type: 'percent', value: 15 },
            { code: 'ECO5', type: 'fixed', value: 5 },
        ],
    },
};
