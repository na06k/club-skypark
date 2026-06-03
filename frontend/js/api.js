const API_BASE = window.location.port === '3000'
  ? '/api'
  : 'http://localhost:3000/api';

const api = {
  get token() {
    return sessionStorage.getItem('token');
  },

  get user() {
    const value = sessionStorage.getItem('user');
    return value ? JSON.parse(value) : null;
  },

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Backend request timed out. Please restart the backend server and try again.');
      }
      throw new Error('Backend is not running. Start it with: cd backend && npm start');
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (response.status === 204) return null;

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }
    return data;
  },

  get(path) {
    return this.request(path);
  },

  post(path, body) {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  patch(path, body) {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  put(path, body) {
    return this.request(path, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(path) {
    return this.request(path, { method: 'DELETE' });
  },

  saveSession(token, user) {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem('role', user.role);
  },

  clearSession() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('role');
  }
};
