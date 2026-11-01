/**
 * Cross-window / cross-device sync.
 *
 * Preference order:
 *   1. HTTP relay (SSE) when served by server.mjs — works across machines.
 *   2. BroadcastChannel — two windows/tabs on the same browser.
 *   3. localStorage events — last-resort fallback.
 */
export class SyncBus {
  constructor(role) {
    this.role = role;
    this.id = `${role}-${Math.random().toString(36).slice(2, 9)}`;
    this.handlers = new Map();
    this.lastPeerAt = 0;
    this.mode = 'broadcast';
    this.bc = null;
    this.es = null;
    this.storageKey = 'atlas-drill-sync-v1';
    this.storageHandler = null;
  }

  async init() {
    const params = new URLSearchParams(location.search);
    const forceRelay = params.get('relay') === '1';
    const disableRelay = params.get('relay') === '0';
    const host = location.hostname;
    const localLike = host === 'localhost' || host === '127.0.0.1'
      || /^10\./.test(host) || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!disableRelay && (forceRelay || localLike)
      && (location.protocol === 'http:' || location.protocol === 'https:')) {
      try {
        const r = await fetch('/api/sync/health', { cache: 'no-store' });
        if (r.ok) {
          this.mode = 'sse';
          this.es = new EventSource('/api/sync/events');
          this.es.onmessage = (e) => {
            try { this.dispatch(JSON.parse(e.data)); } catch { /* ignore */ }
          };
          this.es.onerror = () => { /* EventSource reconnects automatically */ };
          return this.mode;
        }
      } catch { /* not served by the relay; fall through */ }
    }

    try {
      this.bc = new BroadcastChannel('atlas-drill-sync');
      this.bc.onmessage = (e) => this.dispatch(e.data);
      this.mode = 'broadcast';
    } catch {
      this.mode = 'storage';
      this.storageHandler = (e) => {
        if (e.key === this.storageKey && e.newValue) {
          try { this.dispatch(JSON.parse(e.newValue)); } catch { /* ignore */ }
        }
      };
      window.addEventListener('storage', this.storageHandler);
    }
    return this.mode;
  }

  send(msg) {
    const data = { ...msg, from: this.id, role: this.role, ts: Date.now() };
    if (this.mode === 'sse') {
      fetch('/api/sync/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
      }).catch(() => {});
    } else if (this.mode === 'broadcast' && this.bc) {
      this.bc.postMessage(data);
    } else {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        localStorage.removeItem(this.storageKey);
      } catch { /* ignore */ }
    }
  }

  on(type, cb) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(cb);
    return this;
  }

  dispatch(msg) {
    if (!msg || msg.from === this.id) return;
    this.lastPeerAt = performance.now();
    const list = this.handlers.get(msg.type);
    if (list) for (const cb of list) cb(msg);
  }

  peerAlive() {
    return this.lastPeerAt > 0 && performance.now() - this.lastPeerAt < 4500;
  }
}
