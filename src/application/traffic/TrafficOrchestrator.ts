import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { Session } from '../../domain/entities/Session';
import { logger } from '../../infrastructure/logging/logger';
import { Config } from '../../infrastructure/config/config';
import { MetricsService } from '../../infrastructure/monitoring/MetricsService';

export class TrafficOrchestrator {
  private blacklistDomains = [
    'beritakeadilan.com',
    'sorotnews.co.id',
    'nusantaraabadinews.com',
    'lintassurabaya.com',
    'seputarindonesia.net',
    'kabarsurabaya.com'
  ];

  private heroLinkPattern = "https://qr.ptsuparmatbk.com/blog/";

  private searchKeywords = Config.SEARCH_KEYWORDS && Config.SEARCH_KEYWORDS.length > 0 
    ? Config.SEARCH_KEYWORDS 
    : [
        "QR Suparma Tbk",
        "PT Suparma Tbk Blog",
        "Qr Suparma Tissue Blog"
      ];

  constructor(private engine: BrowserEngine) {}

  async run(session: Session, options: Partial<BrowserOptions> = {}): Promise<void> {
    const { config } = session;
    const startTime = Date.now();
    
    logger.info('🚀 STARTING MISSION: Ninja SEO Strategy', { id: config.id });

    try {
      const startupDelay = Math.floor(Math.random() * 30000);
      logger.info(`⏳ Waiting for ${startupDelay}ms to randomize startup...`);
      await this.engine.wait(startupDelay);

      const metrics = MetricsService.getInstance();
      metrics.trackSessionStart();

      // Generate deterministic seed from session ID for consistent fingerprints
      const seed = options.seed || this.generateSeedFromSessionId(config.id);

      await this.engine.init({
        userAgent: config.userAgent,
        viewport: config.viewport,
        proxy: config.proxy,
        userDataDir: config.userDataDir,
        headless: options.headless,
        platform: options.platform,
        fingerprintScript: options.fingerprintScript,
        seed,
      });

      if (Config.TRAFFIC_MODE === 'direct') {
        const targetUrl = Config.DEFAULT_URL || session.config.url;
        logger.info(`Direct mode: navigating to ${targetUrl}`);
        await this.engine.navigate(targetUrl);
        // Diam saja, jangan scroll. Biarkan halaman terbuka untuk verifikasi manual.
        logger.info('✅ Direct mode: page loaded. Waiting for 10 seconds...');
        await this.engine.wait(10000);
        return;
      }

      if ((options as any).latitude && (options as any).longitude) {
        await (this.engine as any).setGeolocation((options as any).latitude, (options as any).longitude);
      }

      await this.engine.navigate('https://www.google.com');
      await (this.engine as any).handleConsentPopups();
      await this.engine.wait(2000);

      const keyword = this.searchKeywords[Math.floor(Math.random() * this.searchKeywords.length)];
      logger.info(`⌨️ Searching for: "${keyword}"`);
      await (this.engine as any).searchKeyword(keyword);
      
      await this.engine.wait(Math.floor(Math.random() * 3000) + 2000);

      logger.info("🧐 Scanning search results...");
      const clickedHero = await (this.engine as any).clickSearchResult(this.heroLinkPattern);

      if (clickedHero) {
        logger.info("🎯 HERO FOUND! Boosting Official Site CTR...");
        await this.simulateHumanReading(60000, 90000); 
      } else {
        logger.info("🛡️ Hero not found on Page 1. Executing Blacklist Suppression...");
        const clickedSafe = await this.clickSafeLinkOnly();
        
        if (clickedSafe) {
          logger.info("✅ Safe Portal clicked. Enemy links successfully ghosted.");
          await this.simulateHumanReading(30000, 45000);
        } else {
          logger.warn("⚠️ No safe links found. Performing ghost scroll.");
          await this.engine.scroll(0, 500);
          await this.engine.wait(5000);
        }
      }

      const actualDuration = Date.now() - startTime;
      metrics.trackSessionEnd(true, actualDuration);
      logger.info('✅ Ninja Mission Completed');

    } catch (error: any) {
      logger.error('❌ Mission Failed', { error: error.message });
    } finally {
      await this.engine.close();
    }
  }

  private generateSeedFromSessionId(sessionId: string): number {
    // Convert session ID to deterministic seed
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private async clickSafeLinkOnly(): Promise<boolean> {
    return await this.engine.evaluate((blacklist: string[]) => {
      const links = Array.from(document.querySelectorAll('a'));
      const safeLink = links.find(a => {
        const h = a.href.toLowerCase();
        return h.startsWith('http') && 
               !h.includes('google.com') && 
               !blacklist.some((bad: string) => h.includes(bad.toLowerCase()));
      });
      if (safeLink) {
        (safeLink as any).click();
        return true;
      }
      return false;
    }, this.blacklistDomains);
  }

  private async simulateHumanReading(min: number, max: number) {
    const duration = Math.floor(Math.random() * (max - min + 1)) + min;
    const end = Date.now() + duration;
    let lastScrollTime = Date.now();
    
    while (Date.now() < end) {
      const scrollY = Math.floor(Math.random() * 300) + 100;
      await this.engine.scroll(0, scrollY);
      
      // Randomize wait interval between 1-6 seconds (more human-like)
      const waitTime = Math.floor(Math.random() * 5000) + 1000; // 1-6 seconds
      await this.engine.wait(waitTime);
      
      // Occasional micro-pause (thinking time)
      if (Math.random() > 0.7) {
        await this.engine.wait(Math.floor(Math.random() * 2000) + 500); // 0.5-2.5 seconds
      }
    }
  }

  async runFromJob(jobId: string, data: any): Promise<void> {
    const { FingerprintService } = require('../../infrastructure/browser/FingerprintService');
    const fingerprint = FingerprintService.generate();
    const session = new Session({
      id: jobId,
      url: data.url,
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      durationMs: data.durationMinutes * 60000,
      proxy: data.proxy ? {
        server: `${data.proxy.host}:${data.proxy.port}`,
        username: data.proxy.username,
        password: data.proxy.password
      } : undefined
    });

    await this.run(session, {
      headless: Config.HEADLESS,
      platform: fingerprint.platform,
      fingerprintScript: FingerprintService.getInjectionScript(fingerprint)
    });
  }
}