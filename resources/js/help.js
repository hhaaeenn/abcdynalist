let panel = null;

export function open() {
    if (!panel) panel = document.getElementById('help-panel');
    panel.classList.remove('hidden');
    panel.classList.add('flex');
}

export function close() {
    if (!panel) panel = document.getElementById('help-panel');
    panel.classList.add('hidden');
    panel.classList.remove('flex');
}

export function toggle() {
    if (!panel) panel = document.getElementById('help-panel');
    if (panel.classList.contains('hidden')) open();
    else close();
}

export function init() {
    panel = document.getElementById('help-panel');

    document.getElementById('help-close').addEventListener('click', close);
    document.getElementById('help-btn').addEventListener('click', toggle);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
            close();
            return;
        }
        const t = e.target;
        const isEditable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName || ''));
        if (isEditable && !e.ctrlKey && !e.metaKey) return;

        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === '?') {
            e.preventDefault();
            toggle();
            return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.key === '?') {
            e.preventDefault();
            toggle();
        }
    });
}
