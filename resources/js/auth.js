import { api, setToken, setUser } from './api';

function showError(form, message) {
    const box = form.querySelector('#form-error');
    if (!box) return;
    box.textContent = message;
    box.classList.remove('hidden');
}

function hideError(form) {
    const box = form.querySelector('#form-error');
    if (box) box.classList.add('hidden');
}

function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.textContent = busy ? 'Memproses…' : label;
}

export function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    const btn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError(form);
        setBusy(btn, true, 'Masuk');

        const payload = {
            email: form.email.value.trim(),
            password: form.password.value,
        };

        try {
            const data = await api.post('/auth/login', payload);
            setToken(data.token);
            setUser(data.user);
            window.location.href = '/app';
        } catch (err) {
            showError(form, err.message);
            setBusy(btn, false, 'Masuk');
        }
    });
}

export function initRegister() {
    const form = document.getElementById('register-form');
    if (!form) return;
    const btn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError(form);
        setBusy(btn, true, 'Daftar');

        const payload = {
            name: form.name.value.trim(),
            email: form.email.value.trim(),
            password: form.password.value,
            password_confirmation: form.password_confirmation.value,
        };

        try {
            const data = await api.post('/auth/register', payload);
            setToken(data.token);
            setUser(data.user);
            window.location.href = '/app';
        } catch (err) {
            showError(form, err.message);
            setBusy(btn, false, 'Daftar');
        }
    });
}
