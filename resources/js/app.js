import './bootstrap';
import { getToken } from './api';
import { initLogin, initRegister } from './auth';
import { init as initSidebar, togglePane, loadTree, findNode, selectDocument } from './sidebar';
import { init as initQuickFinder, open as openQuickFinder } from './quick-finder';
import { init as initBookmarks, open as openBookmarks, close as closeBookmarks } from './bookmarks';
import { init as initDocument, isDocOpen, openSearch, openDocument, zoomToItem, openSr } from './document';
import { init as initContextMenu } from './context-menu';
import { init as initTags } from './tags';
import { init as initTrashDocs } from './trash-docs';
import { init as initHelp } from './help';
import { init as initBacklinks } from './backlinks';
import { init as initTagColors } from './tag-colors';

const page = document.body.dataset.page;

async function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get('doc');
    if (!doc) return;
    try {
        await loadTree();
        const node = findNode(doc);
        if (!node || node.type !== 'document') return;
        selectDocument(node);
        await openDocument(doc);
        const item = params.get('item');
        if (item) await zoomToItem(item);
    } catch {}
}
if (page === 'login') {
    initLogin();
} else if (page === 'register') {
    initRegister();
} else if (page === 'app') {
    if (!getToken()) {
        window.location.href = '/login';
    } else {
        initSidebar();
        initQuickFinder();
        initBookmarks();
        initDocument();
        initContextMenu();
        initTags();
        initTrashDocs();
        initHelp();
        initBacklinks();
        initTagColors();

        handleDeepLink();

        document.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            if (e.shiftKey && key === 'b') {
                e.preventDefault();
                const panel = document.getElementById('bookmarks-panel');
                if (panel.classList.contains('hidden')) openBookmarks();
                else closeBookmarks();
            } else if (e.shiftKey && key === 'f') {
                e.preventDefault();
                togglePane();
            } else if (e.shiftKey && (key === 'o' || key === 'p')) {
                e.preventDefault();
                openQuickFinder('item');
            } else if (key === 'p' || key === 'o') {
                e.preventDefault();
                openQuickFinder();
            } else if (key === 'f' && isDocOpen()) {
                e.preventDefault();
                openSearch();
            } else if (key === 'h' && isDocOpen()) {
                e.preventDefault();
                openSr();
            }
        });
    }
}
