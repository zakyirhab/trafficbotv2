import { UserAgentService } from './UserAgentService';
import { DeviceProfile, generateDeviceProfile, getRngForSeed } from '../../core/DeviceProfile';

export interface Fingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  platform: string;
  languages: string[];
  webgl: {
    vendor: string;
    renderer: string;
  };
}

export class FingerprintService {
  private profile: DeviceProfile | null = null;

  /**
   * Set the device profile for this instance.
   * All subsequent fingerprinting will use this profile's values.
   */
  setProfile(profile: DeviceProfile): void {
    this.profile = profile;
  }

  static generateDefault(): Fingerprint {
    // Fallback for when no profile is set (legacy behavior)
    const hostPlatform = process.platform;
    const { ua, platform: uaPlatform } = UserAgentService.getRandomUA('most-common', hostPlatform);
    
    let navPlatform = 'Win32';
    if (ua.includes('Macintosh')) navPlatform = 'MacIntel';
    if (ua.includes('Linux')) navPlatform = 'Linux x86_64';

    return {
      userAgent: ua,
      viewport: {
        width: 1280 + Math.floor(Math.random() * 200),
        height: 720 + Math.floor(Math.random() * 200),
      },
      deviceScaleFactor: 1,
      hardwareConcurrency: 8,
      deviceMemory: 16,
      platform: navPlatform,
      languages: ['en-US', 'en'],
      webgl: {
        vendor: 'Google Inc. (Intel)',
        renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
      },
    };
  }

  generate(): Fingerprint {
    if (!this.profile) {
      return FingerprintService.generateDefault();
    }

    const profile = this.profile;
    return {
      userAgent: profile.userAgent,
      viewport: {
        width: profile.screenWidth,
        height: profile.screenHeight,
      },
      deviceScaleFactor: 1,
      hardwareConcurrency: profile.hardwareConcurrency,
      deviceMemory: profile.deviceMemory,
      platform: profile.platform,
      languages: [profile.language, profile.language.split('-')[0]],
      webgl: {
        vendor: profile.gpuVendor,
        renderer: profile.gpuRenderer,
      },
    };
  }

  /**
   * Generate injection script for a specific fingerprint.
   * Uses deterministic canvas/webgl noise based on profile seeds.
   */
  getInjectionScript(fingerprint: Fingerprint): string {
    if (!this.profile) {
      return this.getDefaultInjectionScript(fingerprint);
    }

    const profile = this.profile;
    const canvasRng = getRngForSeed(profile.canvasNoiseSeed);
    const webglRng = getRngForSeed(profile.webglNoiseSeed);
    
    // Generate deterministic noise bytes for canvas manipulation
    const canvasNoiseByte = Math.floor(canvasRng() * 256);

    return `
      (() => {
        // --- Utils ---
        const overwriteProperty = (obj, prop, value) => {
          try {
            Object.defineProperty(obj, prop, {
              get: () => value,
              set: () => {},
              configurable: true,
              enumerable: true
            });
          } catch (e) {}
        };

        const makeNative = (fn, name) => {
          const fnName = name || fn.name;
          const wrapper = {
            [fnName]: function() { return fn.apply(this, arguments); }
          }[fnName];
          
          const toString = () => \`function \${fnName}() { [native code] }\`;
          Object.defineProperty(wrapper, 'toString', {
            value: toString,
            configurable: true,
            enumerable: false,
            writable: true
          });
          return wrapper;
        };

        // --- Hardware & Platform Spoofing (from profile) ---
        overwriteProperty(navigator, 'hardwareConcurrency', ${profile.hardwareConcurrency});
        overwriteProperty(navigator, 'deviceMemory', ${profile.deviceMemory});
        overwriteProperty(navigator, 'platform', '${profile.platform}');
        overwriteProperty(navigator, 'userAgent', '${profile.userAgent}');
        overwriteProperty(navigator, 'appVersion', '${profile.userAgent.replace('Mozilla/', '')}');
        overwriteProperty(navigator, 'languages', ${JSON.stringify([profile.language, profile.language.split('-')[0]])});
        overwriteProperty(navigator, 'language', '${profile.language}');

        // --- Viewport & Screen Consistency ---
        const screenWidth = ${profile.screenWidth};
        const screenHeight = ${profile.screenHeight};
        overwriteProperty(screen, 'width', screenWidth);
        overwriteProperty(screen, 'height', screenHeight);
        overwriteProperty(screen, 'availWidth', screenWidth);
        overwriteProperty(screen, 'availHeight', screenHeight);
        overwriteProperty(window, 'innerWidth', screenWidth);
        overwriteProperty(window, 'innerHeight', screenHeight);
        overwriteProperty(window, 'outerWidth', screenWidth);
        overwriteProperty(window, 'outerHeight', screenHeight);
        overwriteProperty(window, 'devicePixelRatio', 1);
        overwriteProperty(screen, 'colorDepth', ${profile.colorDepth});
        overwriteProperty(screen, 'pixelDepth', ${profile.colorDepth});

        // --- Plugins & MimeTypes Spoofing ---
        const mockPlugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
        ];

        const pluginList = mockPlugins.map(p => {
          const plugin = Object.create(Plugin.prototype);
          overwriteProperty(plugin, 'name', p.name);
          overwriteProperty(plugin, 'filename', p.filename);
          overwriteProperty(plugin, 'description', p.description);
          overwriteProperty(plugin, 'length', 0);
          return plugin;
        });

        Object.setPrototypeOf(pluginList, PluginArray.prototype);
        overwriteProperty(navigator, 'plugins', pluginList);
        overwriteProperty(navigator, 'mimeTypes', Object.create(MimeTypeArray.prototype));

        // --- WebGL Spoofing (deterministic, from profile) ---
        const maskWebGL = (proto) => {
          if (!proto) return;
          const getParameter = proto.getParameter;
          proto.getParameter = makeNative(function(parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return '${profile.gpuVendor}';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return '${profile.gpuRenderer}';
            // VENDOR
            if (parameter === 3571) return '${profile.gpuVendor.split(' ')[0]}';
            // RENDERER
            if (parameter === 3572) return '${profile.gpuRenderer}';
            return getParameter.apply(this, arguments);
          }, 'getParameter');
        };

        if (window.WebGLRenderingContext) maskWebGL(WebGLRenderingContext.prototype);
        if (window.WebGL2RenderingContext) maskWebGL(WebGL2RenderingContext.prototype);

        // --- window.chrome Mocking ---
        if (!window.chrome) {
          window.chrome = {
            runtime: {},
            loadTimes: makeNative(() => ({
              requestTime: Date.now() / 1000,
              startLoadTime: Date.now() / 1000,
              commitLoadTime: Date.now() / 1000,
              finishDocumentLoadTime: Date.now() / 1000,
              finishLoadTime: Date.now() / 1000,
              firstPaintTime: Date.now() / 1000,
              wasFetchedViaSpdy: true,
              wasNpnNegotiated: true,
              wasAlternateProtocolAvailable: false,
              connectionInfo: 'h2'
            }), 'loadTimes'),
            csi: makeNative(() => ({
              startE: Date.now(),
              onloadT: Date.now() + 100,
              pageT: 200,
              tran: 15
            }), 'csi')
          };
        }

        // --- Canvas Protection (deterministic noise from seed) ---
        const manipulateCanvas = (proto) => {
          if (!proto) return;
          const getImageData = proto.getImageData;
          proto.getImageData = makeNative(function() {
            const res = getImageData.apply(this, arguments);
            if (res && res.data && res.data.length >= 4) {
              const lastIdx = res.data.length - 4;
              res.data[lastIdx] = ${canvasNoiseByte};
            }
            return res;
          }, 'getImageData');
        };

        if (window.CanvasRenderingContext2D) manipulateCanvas(CanvasRenderingContext2D.prototype);
        
        // --- WebRTC IP Leak Protection ---
        if (window.RTCPeerConnection) {
          const orgRTCPeerConnection = window.RTCPeerConnection;
          window.RTCPeerConnection = makeNative(function(config) {
            const conn = new orgRTCPeerConnection(config);
            const orgAddIceCandidate = conn.addIceCandidate;
            conn.addIceCandidate = makeNative(function() {
              return orgAddIceCandidate.apply(this, arguments);
            }, 'addIceCandidate');
            return conn;
          }, 'RTCPeerConnection');
        }

        // --- WebDriver/Automation Protection ---
        overwriteProperty(navigator, 'webdriver', false);

        // --- Permissions API Hardening ---
        if (navigator.permissions) {
          const orgQuery = navigator.permissions.query;
          navigator.permissions.query = makeNative((parameters) => (
            parameters.name === 'notifications' 
              ? Promise.resolve({ state: 'default', onchange: null }) 
              : orgQuery.apply(navigator.permissions, [parameters])
          ), 'query');
        }
      })();
    `;
  }

  private getDefaultInjectionScript(fingerprint: Fingerprint): string {
    return `
      (() => {
        // --- Utils ---
        const overwriteProperty = (obj, prop, value) => {
          try {
            Object.defineProperty(obj, prop, {
              get: () => value,
              set: () => {},
              configurable: true,
              enumerable: true
            });
          } catch (e) {}
        };

        const makeNative = (fn, name) => {
          const fnName = name || fn.name;
          const wrapper = {
            [fnName]: function() { return fn.apply(this, arguments); }
          }[fnName];
          
          const toString = () => \`function \${fnName}() { [native code] }\`;
          Object.defineProperty(wrapper, 'toString', {
            value: toString,
            configurable: true,
            enumerable: false,
            writable: true
          });
          return wrapper;
        };

        // --- Hardware & Platform Spoofing ---
        overwriteProperty(navigator, 'hardwareConcurrency', ${fingerprint.hardwareConcurrency});
        overwriteProperty(navigator, 'deviceMemory', ${fingerprint.deviceMemory});
        overwriteProperty(navigator, 'platform', '${fingerprint.platform}');
        overwriteProperty(navigator, 'userAgent', '${fingerprint.userAgent}');
        overwriteProperty(navigator, 'appVersion', '${fingerprint.userAgent.replace('Mozilla/', '')}');
        overwriteProperty(navigator, 'languages', ${JSON.stringify(fingerprint.languages)});
        overwriteProperty(navigator, 'language', '${fingerprint.languages[0]}');

        // --- Viewport & Screen Consistency ---
        const screenWidth = ${fingerprint.viewport.width};
        const screenHeight = ${fingerprint.viewport.height};
        overwriteProperty(screen, 'width', screenWidth);
        overwriteProperty(screen, 'height', screenHeight);
        overwriteProperty(screen, 'availWidth', screenWidth);
        overwriteProperty(screen, 'availHeight', screenHeight);
        overwriteProperty(window, 'innerWidth', screenWidth);
        overwriteProperty(window, 'innerHeight', screenHeight);
        overwriteProperty(window, 'outerWidth', screenWidth);
        overwriteProperty(window, 'outerHeight', screenHeight);
        overwriteProperty(window, 'devicePixelRatio', ${fingerprint.deviceScaleFactor});

        // --- Plugins & MimeTypes Spoofing ---
        const mockPlugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
        ];

        const pluginList = mockPlugins.map(p => {
          const plugin = Object.create(Plugin.prototype);
          overwriteProperty(plugin, 'name', p.name);
          overwriteProperty(plugin, 'filename', p.filename);
          overwriteProperty(plugin, 'description', p.description);
          overwriteProperty(plugin, 'length', 0);
          return plugin;
        });

        Object.setPrototypeOf(pluginList, PluginArray.prototype);
        overwriteProperty(navigator, 'plugins', pluginList);
        overwriteProperty(navigator, 'mimeTypes', Object.create(MimeTypeArray.prototype));

        // --- WebGL Randomization ---
        const maskWebGL = (proto) => {
          if (!proto) return;
          const getParameter = proto.getParameter;
          proto.getParameter = makeNative(function(parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return '${fingerprint.webgl.vendor}';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return '${fingerprint.webgl.renderer}';
            // VENDOR
            if (parameter === 3571) return '${fingerprint.webgl.vendor.split(' ')[0]}';
            // RENDERER
            if (parameter === 3572) return '${fingerprint.webgl.renderer}';
            return getParameter.apply(this, arguments);
          }, 'getParameter');
        };

        if (window.WebGLRenderingContext) maskWebGL(WebGLRenderingContext.prototype);
        if (window.WebGL2RenderingContext) maskWebGL(WebGL2RenderingContext.prototype);

        // --- window.chrome Mocking ---
        if (!window.chrome) {
          window.chrome = {
            runtime: {},
            loadTimes: makeNative(() => ({
              requestTime: Date.now() / 1000,
              startLoadTime: Date.now() / 1000,
              commitLoadTime: Date.now() / 1000,
              finishDocumentLoadTime: Date.now() / 1000,
              finishLoadTime: Date.now() / 1000,
              firstPaintTime: Date.now() / 1000,
              wasFetchedViaSpdy: true,
              wasNpnNegotiated: true,
              wasAlternateProtocolAvailable: false,
              connectionInfo: 'h2'
            }), 'loadTimes'),
            csi: makeNative(() => ({
              startE: Date.now(),
              onloadT: Date.now() + 100,
              pageT: 200,
              tran: 15
            }), 'csi')
          };
        }

        // --- Canvas Protection ---
        const manipulateCanvas = (proto) => {
          if (!proto) return;
          const getImageData = proto.getImageData;
          proto.getImageData = makeNative(function() {
            const res = getImageData.apply(this, arguments);
            if (res && res.data && res.data.length >= 4) {
              const lastIdx = res.data.length - 4;
              res.data[lastIdx] = (res.data[lastIdx] + 1) % 256;
            }
            return res;
          }, 'getImageData');
        };

        if (window.CanvasRenderingContext2D) manipulateCanvas(CanvasRenderingContext2D.prototype);
        
        // --- WebRTC IP Leak Protection ---
        if (window.RTCPeerConnection) {
          const orgRTCPeerConnection = window.RTCPeerConnection;
          window.RTCPeerConnection = makeNative(function(config) {
            const conn = new orgRTCPeerConnection(config);
            const orgAddIceCandidate = conn.addIceCandidate;
            conn.addIceCandidate = makeNative(function() {
              return orgAddIceCandidate.apply(this, arguments);
            }, 'addIceCandidate');
            return conn;
          }, 'RTCPeerConnection');
        }

        // --- WebDriver/Automation Protection ---
        overwriteProperty(navigator, 'webdriver', false);

        // --- Permissions API Hardening ---
        if (navigator.permissions) {
          const orgQuery = navigator.permissions.query;
          navigator.permissions.query = makeNative((parameters) => (
            parameters.name === 'notifications' 
              ? Promise.resolve({ state: 'default', onchange: null }) 
              : orgQuery.apply(navigator.permissions, [parameters])
          ), 'query');
        }
      })();
    `;
  }
}
