export function toast(message, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    el.style.background = type === 'error' ? '#b91c1c' : '#24221f';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.add('hidden'), 2600);
}
