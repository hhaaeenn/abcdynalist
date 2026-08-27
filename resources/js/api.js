const TOKEN_KEY = 'abclist_token';
const USER_KEY = 'abclist_user';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

export function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
        return null;
    }
}

export function setUser(user) {
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_KEY);
    }
}

export function clearAuth() {
    setToken(null);
    setUser(null);
}

// Pemetaan item sementara (temp id) -> id asli setelah create selesai.
// Dipakai untuk UI optimistik: operasi apa pun yang menyentuh item temp
// menunggu create selesai lalu otomatis memakai id asli.
const pendingItems = new Map();

export function registerPendingItem(tempId, promise) {
    pendingItems.set(tempId, promise);
}

export function unregisterPendingItem(tempId) {
    pendingItems.delete(tempId);
}

async function resolvePendingId(value) {
    if (typeof value !== 'string' || !pendingItems.has(value)) return value;
    return pendingItems.get(value);
}

async function resolvePendingBody(body) {
    if (!body || typeof body !== 'object' || body instanceof FormData) return body;
    if (Array.isArray(body)) return Promise.all(body.map((value) => resolvePendingBody(value)));

    const resolved = { ...body };
    for (const [key, value] of Object.entries(resolved)) {
        if (typeof value === 'string' && /(?:^|_)id$/i.test(key)) {
            resolved[key] = await resolvePendingId(value);
        } else if (value && typeof value === 'object') {
            resolved[key] = await resolvePendingBody(value);
        }
    }
    return resolved;
}

export async function request(path, { method = 'GET', body } = {}) {
    if (pendingItems.size) {
        const segs = path.split('/');
        for (let i = 0; i < segs.length; i++) {
            if (i > 0 && (segs[i - 1] === 'items' || segs[i - 1] === 'documents') && pendingItems.has(segs[i])) {
                const real = await resolvePendingId(segs[i]);
                if (real !== segs[i]) segs[i] = real;
            }
        }
        path = segs.join('/');
    }
    body = await resolvePendingBody(body);
    const headers = { Accept: 'application/json' };
    const isFormData = body instanceof FormData;
    if (body && !isFormData) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/v1${path}`, {
        method,
        headers,
        body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
        data = await res.json();
    } catch {
        // ignore non-JSON body
    }

    if (res.status === 401) {
        clearAuth();
        window.location.href = '/login';
        const err = new Error('Sesi berakhir. Silakan masuk kembali.');
        err.status = 401;
        throw err;
    }

    if (!res.ok) {
        const err = new Error(data?.message || `Request gagal (${res.status})`);
        err.status = res.status;
        err.data = data;
        throw err;
    }

    return data;
}

export const api = {
    get: (path) => request(path),
    post: (path, body) => writeWithStatus(() => request(path, { method: 'POST', body })),
    put: (path, body) => writeWithStatus(() => request(path, { method: 'PUT', body })),
    patch: (path, body) => writeWithStatus(() => request(path, { method: 'PATCH', body })),
    delete: (path, body) => writeWithStatus(() => request(path, { method: 'DELETE', body })),
};

async function writeWithStatus(run) {
    window.dispatchEvent(new CustomEvent('dyn:save-start'));
    try {
        return await run();
    } finally {
        window.dispatchEvent(new CustomEvent('dyn:save-end'));
    }
}
