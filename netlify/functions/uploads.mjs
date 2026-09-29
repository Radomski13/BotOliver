import { imageStore } from '../lib/shared.mjs';

// Serves product photos uploaded in the admin page: /uploads/<file>
export const config = { path: '/uploads/:file' };

export default async (req, context) => {
    const file = context.params.file || '';
    if (!/^[a-z0-9._-]+$/.test(file)) return new Response('Not found', { status: 404 });

    const result = await imageStore().getWithMetadata(file, { type: 'arrayBuffer' });
    if (!result) return new Response('Not found', { status: 404 });

    return new Response(result.data, {
        headers: {
            'Content-Type': result.metadata?.contentType || 'application/octet-stream',
            // File names are unique, so they can be cached for a long time.
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
        },
    });
};
