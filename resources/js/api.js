const TOKEN_KEY = 'dynalist_token';
const USER_KEY = 'dynalist_user';

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

export async function request(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    const isFormData = body instanceof FormData;
    if (body && !isFormData) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, {
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
    post: (path, body) => request(path, { method: 'POST', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    delete: (path, body) => request(path, { method: 'DELETE', body }),
};
