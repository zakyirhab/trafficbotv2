import axios from 'axios';

interface ProxyInfo {
  server: string;
  anonymity?: string;
}

export class ProxyPool {
  private proxyList: ProxyInfo[] = [];
  private lastFetchTime = 0;
  private readonly FETCH_INTERVAL_MS = 5 * 60 * 1000; // Refresh stok tiap 5 menit
  private readonly PROXY_SOURCES = [
    // Sumber dari ProxyGather (diperbarui tiap 30 menit)
    'https://raw.githubusercontent.com/Skillter/ProxyGather/refs/heads/master/proxies/working-proxies-all.txt',
    // Sumber dari ProxyNova (diperbarui tiap 60 detik)
    'https://www.proxynova.com/proxy-server-list/country-id/'
  ];

  async getBestProxy(): Promise<{ server: string; protocol: string } | null> {
    const now = Date.now();
    if (this.proxyList.length === 0 || now - this.lastFetchTime > this.FETCH_INTERVAL_MS) {
      await this.fetchProxies();
    }

    if (this.proxyList.length === 0) {
      console.warn('[ProxyPool] Stok proxy habis. Coba lagi nanti.');
      return null;
    }

    const chosen = this.proxyList.shift()!;
    this.proxyList.push(chosen);
    
    let protocol = 'http';
    if (chosen.server.includes('socks5') || chosen.server.endsWith(':1080')) protocol = 'socks5';
    else if (chosen.server.includes('socks4')) protocol = 'socks4';

    console.log(`[ProxyPool] Menggunakan proxy: ${chosen.server}`);
    return { server: chosen.server, protocol };
  }
  
  removeBadProxy(badServer: string): void {
    this.proxyList = this.proxyList.filter(p => p.server !== badServer);
    console.log(`[ProxyPool] Membuang proxy rusak: ${badServer}. Sisa ${this.proxyList.length} proxy.`);
  }

  private async fetchProxies(): Promise<void> {
    console.log('[ProxyPool] Lagi ambil stok proxy terbaru...');
    const newProxies: ProxyInfo[] = [];

    for (const url of this.PROXY_SOURCES) {
      try {
        const response = await axios.get<string>(url, { timeout: 20000 });
        if (url.includes('proxynova.com')) {
            // Logika khusus untuk parsing halaman web dari ProxyNova
            this.parseProxyNovaHtml(response.data, newProxies);
        } else {
            // Logika untuk file teks dari ProxyGather
            const lines = response.data.split('\n');
            for (const line of lines) {
                const cleanLine = line.trim();
                if (!cleanLine || cleanLine.startsWith('#')) continue;
                const server = cleanLine.startsWith('http') ? cleanLine : `http://${cleanLine}`;
                newProxies.push({ server });
            }
        }
      } catch (error) {
        console.warn(`[ProxyPool] Gagal ambil dari ${url.split('/').pop()}`);
      }
    }

    this.proxyList = [...new Map(newProxies.map(item => [item.server, item])).values()];
    this.lastFetchTime = Date.now();
    console.log(`[ProxyPool] Berhasil ngumpulin ${this.proxyList.length} proxy. Siap tempur!`);
  }

  /**
   * Fungsi bantuan untuk mengekstrak proxy dari HTML yang diberikan oleh ProxyNova.
   */
  private parseProxyNovaHtml(html: string, newProxies: ProxyInfo[]): void {
    const regex = /<tr>\s*<td[^>]*>\s*<script[^>]*>document\.write\('([^']+)'\)<\/script>\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        try {
            const decodedIp = match[1]
                .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
            const port = match[2];
            if (decodedIp && port) {
                newProxies.push({ server: `http://${decodedIp}:${port}` });
            }
        } catch (e) {
            // Abaikan jika gagal parsing
        }
    }
  }
}