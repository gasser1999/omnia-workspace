/**
 * Omnia Workspace — standalone application bridge.
 *
 * This file replaces the Sekai runtime bridge. It provides:
 *   - getConfig / applyAllEditableValues : read the original design tokens
 *   - vibrate                            : native vibration with graceful fallback
 *   - createSaveShare                    : persistence backed by our own API
 *   - OmniaAPI                           : auth + file helpers used by the app
 *
 * No Sekai service, host or SDK is referenced anywhere in this file.
 */

const API_BASE = ''; // same origin as the Express server

/* ------------------------------------------------------------------ */
/* Design tokens (preserved from the original Sekai editable metadata) */
/* ------------------------------------------------------------------ */
export function getConfig(category, id, fallback) {
  try {
    const list = window.sekaiEditable && window.sekaiEditable[category];
    if (Array.isArray(list)) {
      const item = list.find((entry) => entry && entry.id === id);
      if (item && item.value !== undefined && item.value !== '') return item.value;
    }
  } catch (_) {
    /* ignore */
  }
  return fallback;
}

export function applyAllEditableValues() {
  try {
    const colors = (window.sekaiEditable && window.sekaiEditable.colors) || [];
    for (const color of colors) {
      if (color && color.cssVar && color.value) {
        document.documentElement.style.setProperty(color.cssVar, color.value);
      }
    }
  } catch (_) {
    /* ignore */
  }
}

export function vibrate(ms) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch (_) {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */
async function request(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
  });
  let body = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    body = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const error = new Error((body && body.message) || `request_failed_${res.status}`);
    error.status = res.status;
    error.code = body && body.error;
    throw error;
  }
  return body;
}

export const OmniaAPI = {
  async register({ name, email, password }) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },
  async login({ email, password }) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async logout() {
    return request('/api/auth/logout', { method: 'POST' });
  },
  async me() {
    return request('/api/auth/me');
  },
  async uploadFile(file, category = 'admin') {
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    return request('/api/files', { method: 'POST', body: form });
  },
  async deleteFile(id) {
    return request(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async downloadFile(file) {
    const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(file.id)}/download`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('download_failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};

/* ------------------------------------------------------------------ */
/* Persistence adapter (drop-in replacement for Sekai createSaveShare) */
/* ------------------------------------------------------------------ */
export function createSaveShare() {
  const pending = Object.create(null);

  return {
    set(key, value) {
      pending[key] = value;
    },
    async save(key) {
      try {
        await request('/api/workspace', {
          method: 'PUT',
          body: JSON.stringify({ data: pending[key] }),
        });
        return { code: 200 };
      } catch (err) {
        if (err.status === 401) return { code: 401 };
        return { code: 500, error: err.message };
      }
    },
    async load() {
      try {
        const body = await request('/api/workspace');
        return { code: 200, data: { value: body.data || {} } };
      } catch (err) {
        if (err.status === 401) return { code: 401 };
        return { code: 500, error: err.message };
      }
    },
  };
}

/* Kept for backwards compatibility with the original app code. */
export async function invokeCapability(name, input) {
  if (name === 'save-share.v1') {
    return input;
  }
  throw new Error(`unsupported_capability:${name}`);
}

if (typeof window !== 'undefined') {
  window.OmniaAPI = OmniaAPI;
  window.sekaiAppSession = { createSaveShare };
}
