import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            output: {
                // Split the two heavy third-party libs out of the app bundle. They rarely
                // change between deploys, so browsers that already cached these chunks skip
                // re-downloading them even when app.js itself changes.
                manualChunks: {
                    katex: ['katex'],
                    sweetalert2: ['sweetalert2'],
                },
            },
        },
    },
});
