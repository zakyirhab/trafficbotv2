import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { logger } from '../logging/logger';
import { ProxyService } from '../proxy/ProxyService';

// @ts-ignore
puppeteer.use(StealthPlugin());

// @ts-ignore
export class PuppeteerStealthEngine implements BrowserEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(options: BrowserOptions): Promise<void> {
    const args = [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--ignore-certificate-errors',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--mute-audio'
    ];

    const proxyToUse = options.proxy || await ProxyService.getNextProxy();
    const launchOptions: any = {
      headless: process.env.NODE_ENV === 'production' ? true : (options.headless === false ? false : 'new'),
      args: [...args],
      ignoreDefaultArgs: ['--enable-automation'],
      defaultViewport: options.viewport || { width: 1280, height: 720 },
      defaultNavigationTimeout: 60000,
      defaultTimeout: 60000,
    };

    if (proxyToUse) {
      const proxyServer = ProxyService.normalizeProxyString(proxyToUse);
      launchOptions.args.push(`--proxy-server=${proxyServer}`);
    }

    if (options.userDataDir) launchOptions.userDataDir = options.userDataDir;

    try {
      this.browser = await (puppeteer as any).launch(launchOptions);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_FAILED|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENOTFOUND|ERR_.*|Failed to launch the browser/i.test(message)) {
        logger.warn('⚠️ Proxy ampas/failed, falling back to DIRECT connection.', { error: message });
        const fallbackArgs = launchOptions.args.filter((arg: string) => !arg.startsWith('--proxy-server='));
        const fallbackLaunchOptions = { ...launchOptions, args: fallbackArgs };
        this.browser = await (puppeteer as any).launch(fallbackLaunchOptions);
      } else {
        throw error;
      }
    }
    const pages = await this.browser!.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser!.newPage();

    // Set global timeouts for all page operations
    this.page!.setDefaultNavigationTimeout(60000);
    this.page!.setDefaultTimeout(60000);

    await this.page!.setCacheEnabled(false);

    if (options.userAgent) await this.page!.setUserAgent(options.userAgent);

    if (options.fingerprintScript) {
        await this.page!.evaluateOnNewDocument(options.fingerprintScript);
    }

    logger.debug('🚀 Puppeteer Stealth Engine Ready');
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  }

  async searchKeyword(keyword: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    const selector = 'textarea[name="q"], input[name="q"]';
    await this.page.waitForSelector(selector, { timeout: 60000 });
    
    // Human-like typing with random delays
    for (const char of keyword) {
      await this.page.type(selector, char);
      const delay = Math.floor(Math.random() * 200) + 50; // 50-250ms per character
      await this.wait(delay);
    }
    
    await this.page.keyboard.press('Enter');
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  }

  async clickSearchResult(pattern: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    const links = await this.page.$$('a');
    for (const link of links) {
      const href = await this.page.evaluate(el => el.getAttribute('href'), link);
      if (href && href.toLowerCase().includes(pattern.toLowerCase())) {
        await this.page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.wait(1000);
        await link.click({ timeout: 60000 });
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

  // --- Bypass Interface Missing Methods ---
  async mouseMove(): Promise<void> {}
  async click(): Promise<void> {}
  async setExtraHeaders(): Promise<void> {}
  async waitForNetworkIdle(): Promise<void> {}
}