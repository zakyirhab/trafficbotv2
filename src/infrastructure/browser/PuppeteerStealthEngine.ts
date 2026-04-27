import { ProxyPool } from '../proxy/ProxyPool';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { logger } from '../logging/logger';
import { FingerprintService } from './FingerprintService';
import { UserAgentService } from './UserAgentService';
import { generateDeviceProfile, DeviceProfile } from '../../core/DeviceProfile';

// @ts-ignore
puppeteer.use(StealthPlugin());

// @ts-ignore
export class PuppeteerStealthEngine implements BrowserEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private deviceProfile: DeviceProfile | null = null;
  private fingerprintService: FingerprintService;
  private userAgentService: UserAgentService;
  private proxyPool: ProxyPool;

  constructor() {
    this.fingerprintService = new FingerprintService();
    this.userAgentService = new UserAgentService();
    this.proxyPool = new ProxyPool();
  }

  async init(options: BrowserOptions): Promise<void> {
    this.deviceProfile = generateDeviceProfile(options.seed);
    this.fingerprintService.setProfile(this.deviceProfile);
    this.userAgentService.setProfile(this.deviceProfile);

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];

    let browserLaunched = false;
    let lastError: any = null;
    const MAX_PROXY_RETRIES = 15; // Maksimal 5 kali percobaan proxy berbeda

    for (let attempt = 0; attempt < MAX_PROXY_RETRIES; attempt++) {
      let proxyServerStr: string | undefined;

      if (options.proxy) {
        proxyServerStr = typeof options.proxy === 'string' 
          ? options.proxy 
          : (options.proxy as any).server;
      } else {
        const bestProxy = await this.proxyPool.getBestProxy();
        if (bestProxy) {
          proxyServerStr = bestProxy.server;
        }
      }

      const launchOptions: any = {
        headless: false,
        args: [...args],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: {
          width: this.deviceProfile.screenWidth,
          height: this.deviceProfile.screenHeight,
        },
        defaultNavigationTimeout: 30000,
        defaultTimeout: 15000,
      };

      if (proxyServerStr) {
        launchOptions.args.push(`--proxy-server=${proxyServerStr}`);
        logger.info(`Mencoba proxy [percobaan ${attempt+1}/${MAX_PROXY_RETRIES}]: ${proxyServerStr}`);
      } else {
        logger.info(`Mencoba koneksi langsung [percobaan ${attempt+1}/${MAX_PROXY_RETRIES}]`);
      }

      try {
        this.browser = await (puppeteer as any).launch(launchOptions);
        browserLaunched = true;
        logger.info('Browser berhasil diluncurkan.');
        // Jika berhasil, keluar dari loop
        break;
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message || '');
        // Jika gagal karena koneksi proxy, buang proxy itu
        if (proxyServerStr && /ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_FAILED|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENOTFOUND|Failed to launch/i.test(message)) {
          logger.warn(`Proxy gagal: ${proxyServerStr}. Membuang dari pool dan mencoba lagi...`);
          this.proxyPool.removeBadProxy(proxyServerStr);
        } else {
          // Untuk error selain koneksi, langsung lempar saja
          throw error;
        }
      }
    }

    // Jika setelah semua percobaan masih belum berhasil, fallback ke koneksi langsung (sekali lagi)
    if (!browserLaunched) {
      logger.warn('Semua proxy gagal. Mencoba fallback ke koneksi langsung...');
      const fallbackArgs = args.filter((a: string) => !a.startsWith('--proxy-server='));
      const fallbackLaunchOptions: any = {
        headless: false,
        args: fallbackArgs,
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: {
          width: this.deviceProfile.screenWidth,
          height: this.deviceProfile.screenHeight,
        },
        defaultNavigationTimeout: 30000,
        defaultTimeout: 15000,
      };
      try {
        this.browser = await (puppeteer as any).launch(fallbackLaunchOptions);
        browserLaunched = true;
      } catch (finalError: any) {
        throw new Error(`Gagal total meluncurkan browser setelah semua percobaan. Error: ${finalError.message}`);
      }
    }
    
    const pages = await this.browser!.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser!.newPage();

    this.page!.setDefaultNavigationTimeout(30000);
    this.page!.setDefaultTimeout(15000);
    await this.page!.setCacheEnabled(false);
    await this.page!.setUserAgent(this.deviceProfile.userAgent);
    await this.page!.emulateTimezone(this.deviceProfile.timezone);

    const fingerprint = this.fingerprintService.generate();
    const injectionScript = this.fingerprintService.getInjectionScript(fingerprint);
    await this.page!.evaluateOnNewDocument(injectionScript);

    logger.debug('🚀 Puppeteer Stealth Engine Ready with device profile', {
      platform: this.deviceProfile.platform,
      os: this.deviceProfile.os,
      timezone: this.deviceProfile.timezone,
    });
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  async searchKeyword(keyword: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    const selector = 'textarea[name="q"], input[name="q"]';
    await this.page.waitForSelector(selector, { timeout: 60000 });
    
    for (const char of keyword) {
      await this.page.type(selector, char);
      const delay = Math.floor(Math.random() * 200) + 50;
      await this.wait(delay);
    }
    
    await this.page.keyboard.press('Enter');
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  async clickSearchResult(pattern: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    const links = await this.page.$$('a');
    for (const link of links) {
      const href = await this.page.evaluate(el => el.getAttribute('href'), link);
      if (href && href.toLowerCase().includes(pattern.toLowerCase())) {
        await this.page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.wait(1000);
        await link.click();
        return true;
      }
    }
    return false;
  }

  async handleConsentPopups(): Promise<boolean> {
    if (!this.page) return false;
    const selectors = ['#L2AGLb', 'button[aria-label="Accept all"]', 'button:contains("Accept all")'];
    for (const s of selectors) {
      try {
        const btn = await this.page.$(s);
        if (btn) {
          await btn.click();
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  async scroll(deltaX: number, deltaY: number): Promise<void> {
    if (this.page) await (this.page as any).mouse.wheel({ deltaX, deltaY });
  }

  async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
    if (!this.page) throw new Error('Engine not initialized');
    return await this.page.evaluate(fn, ...args);
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }

  async setGeolocation(latitude: number, longitude: number): Promise<void> {
    if (!this.page) return;
    await this.page.setGeolocation({ latitude, longitude, accuracy: 100 });
    const context = this.browser!.defaultBrowserContext();
    await context.overridePermissions(this.page.url(), ['geolocation']);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    if (!this.page) return;
    await this.page.mouse.move(x, y);
  }

  async click(x: number, y: number): Promise<void> {
    if (!this.page) return;
    await this.page.mouse.click(x, y);
  }

  async setExtraHeaders(headers: Record<string, string>): Promise<void> {
    if (!this.page) return;
    await this.page.setExtraHTTPHeaders(headers);
  }

  async waitForNetworkIdle(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    } catch (e) {
      // Network idle timeout is acceptable
    }
  }

  async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.wait(delay);
  }

  async clickLinkByHref(href: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const selector = `a[href="${href}"]`;
      const link = await this.page.$(selector);
      if (link) {
        await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.wait(500);
        await link.click();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async clickLinkContainingHref(hrefPart: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const link = await this.page.$(`a[href*="${hrefPart}"]`);
      if (link) {
        await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.wait(500);
        await link.click();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async clickLinkByText(text: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const link = await this.page.$(`a:has-text("${text}")`);
      if (link) {
        await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.wait(500);
        await link.click();
        return true;
      }
      return false;
    } catch (e) {
      // Fallback: XPath
      try {
        const xpathResult = await this.page.waitForSelector(`::-p-xpath(//a[contains(text(), '${text}')])`, { timeout: 5000 }).catch(() => null);
        if (xpathResult) {
          await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), xpathResult);
          await this.wait(500);
          await xpathResult.click();
          return true;
        }
      } catch (e2) {
        return false;
      }
      return false;
    }
  }

  async clickNextSearchPage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const selectors = [
        'a#pnnext',
        'a[aria-label="Next page"]',
        'a.next'
      ];

      for (const selector of selectors) {
        const link = await this.page.$(selector);
        if (link) {
          await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
          await this.wait(1000);
          await link.click();
          await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}