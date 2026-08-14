import { api } from './api';

let colors = {};

export async function load() {
    try {
        const res = await api.get('/tag-colors');
        colors = {};
        (res.data || []).forEach((c) => {
            if (c.tag) colors[c.tag] = c.color;
        });
    } catch {
        colors = {};
    }
    return colors;
}

export function getColor(tag) {
    return colors[String(tag || '').replace(/^#/, '').toLowerCase()] || null;
}

export function applyTo(root) {
    if (!root) return;
    root.querySelectorAll('.item-tag').forEach((span) => {
        const c = getColor(span.textContent);
        span.style.color = c || '';
    });
}

export async function setColor(tag, color) {
    const key = String(tag || '').replace(/^#/, '').toLowerCase();
    await api.put(`/tag-colors/${encodeURIComponent(key)}`, { color: color || null });
    if (color) colors[key] = color;
    else delete colors[key];
}

export function init() {
    load();
}
