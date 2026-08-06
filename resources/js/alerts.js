import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { request } from './api';

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export function showLoading(title = 'Harap Menunggu!', message = 'Sedang memproses data...') {
    Swal.fire({
        title,
        html: message,
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false,
    });
}

export function showFailedAlert(message) {
    Swal.close();
    return Swal.fire({
        title: 'Gagal!',
        icon: 'error',
        text: message,
        confirmButtonColor: '#b91c1c',
    });
}

export function showSuccess(message, title = 'Berhasil!') {
    Swal.close();
    return Swal.fire({
        title,
        text: message,
        icon: 'success',
        confirmButtonColor: '#c07a12',
        timer: 1800,
        timerProgressBar: true,
    });
}

export function showAlertOnSubmit({ status, message }, onDone = null) {
    if (status === 'success') {
        return showSuccess(message).then(() => onDone && onDone());
    }
    return showFailedAlert(message);
}

export function showPopupWithAction({
    title = 'Apakah Anda Yakin?',
    subtitle = '',
    icon = 'warning',
    method = 'DELETE',
    path,
    body,
    onDone = null,
}) {
    return Swal.fire({
        title,
        html: subtitle,
        icon,
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya!',
        cancelButtonText: 'Batal',
    }).then(async (result) => {
        if (!result.isConfirmed) return;
        showLoading();
        try {
            const data = await request(path, { method, body });
            await showSuccess(data.message || 'Data berhasil diproses.');
            if (onDone) await onDone(data);
        } catch (err) {
            showFailedAlert(err.message);
        }
    });
}
