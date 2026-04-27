import { Config } from '../config/config';
import fs from 'fs';
import path from 'path';

export interface ProxyConfig {
  server: string; // full string like http://host:port
  username?: string;
  password?: string;
}

interface ManualProxyEntry {
  ip_address: string;
  port: number;
  username?: string;
  password?: string;
}

export class ProxyService {
  private static readonly PROXY_SCRAPER_URL =
    'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&country=id';

  private static readonly MANUAL_PROXIES_PATH = path.join(__dirname, 'manual_proxies.json');
  private static manualProxiesCache: ManualProxyEntry[] | null = null;

  private static loadManualProxies(): ManualProxyEntry[] {
    if (this.manualProxiesCache !== null) return this.manualProxiesCache;
    try {
      if (fs.existsSync(this.MANUAL_PROXIES_PATH)) {
        const raw = fs.readFileSync(this.MANUAL_PROXIES_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.manualProxiesCache = parsed.filter(p => p && p.ip_address && p.port);
          return this.manualProxiesCache;
        }
      }
    } catch (e) {
      this.manualProxiesCache = [];
      return this.manualProxiesCache;
    }
    this.manualProxiesCache = [];
    return this.manualProxiesCache;
  }

  static async fetchFreeProxies(): Promise<ProxyConfig[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(this.PROXY_SCRAPER_URL, { signal: controller.signal });
      if (!res.ok) return [];
      const body = await res.text();
      return body
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(line => this.parseProxyString(line))
        .filter((p): p is ProxyConfig => p !== null);
    } catch (e) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private static fileProxies(): ProxyConfig[] {
    const entries = this.loadManualProxies();
    return entries.map(e => ({ server: `http://${e.ip_address}:${e.port}`, username: e.username, password: e.password }));
  }

  static async getNextProxy(): Promise<ProxyConfig | null> {
    // 1) Try scraped proxies
    const scraped = await this.fetchFreeProxies();
    if (scraped.length > 0) return scraped[Math.floor(Math.random() * scraped.length)];

    // 2) Try manual JSON file
    const file = this.fileProxies();
    if (file.length > 0) return file[Math.floor(Math.random() * file.length)];

    // 3) Try environment MANUAL_PROXIES
    const envManual = (Config.MANUAL_PROXIES || [])
      .map(p => this.parseProxyString(p))
      .filter((p): p is ProxyConfig => p !== null);
    if (envManual.length > 0) return envManual[Math.floor(Math.random() * envManual.length)];

    // 4) nothing
    return null;
  }

  static parseProxyString(proxy: string): ProxyConfig | null {
    if (!proxy || typeof proxy !== 'string') return null;
    const normalized = proxy.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (!normalized) return null;
    const [hostPart, portPart] = normalized.split(':');
    const host = hostPart?.trim();
    const port = Number(portPart);
    if (!host || !port || Number.isNaN(port)) return null;
    return { server: `http://${host}:${port}` };
  }

  static normalizeProxyString(proxy: ProxyConfig): string {
    const server = proxy.server.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const auth = proxy.username && proxy.password ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@` : '';
    return `http://${auth}${server}`;
  }
}
