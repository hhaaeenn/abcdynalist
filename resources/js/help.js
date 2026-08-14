let modal = null;

export function open() {
    if (!modal) modal = document.getElementById('help-modal');
    modal.classList.remove('hidden');
}

export function close() {
    if (!modal) modal = document.getElementById('help-modal');
    modal.classList.add('hidden');
}

export function init() {
    modal = document.getElementById('help-modal');

    document.getElementById('help-close').addEventListener('click', close);
    modal.querySelector('[data-help-close]').addEventListener('click', close);
    document.getElementById('help-btn').addEventListener('click', open);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            close();
            return;
        }
        const t = e.target;
        const isEditable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName || ''));
        if (isEditable && !e.ctrlKey && !e.metaKey) return;

        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === '?') {
            e.preventDefault();
            open();
            return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.key === '?') {
            e.preventDefault();
            open();
        }
    });
}
