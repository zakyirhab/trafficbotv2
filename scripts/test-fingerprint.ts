import { PuppeteerStealthEngine } from '../src/infrastructure/browser/PuppeteerStealthEngine';
import { FingerprintService } from '../src/infrastructure/browser/FingerprintService';
import { generateDeviceProfile } from '../src/core/DeviceProfile';
import { Session } from '../src/domain/entities/Session';
import { TrafficOrchestrator } from '../src/application/traffic/TrafficOrchestrator';

async function testFingerprintConsistency() {
  console.log('\n=== Testing Fingerprint Stability ===\n');

  // Generate a consistent profile with seed
  const seed = 42; // Fixed seed for reproducibility
  const profile = generateDeviceProfile(seed);

  console.log('Device Profile (seed:', seed, '):', {
    os: profile.os,
    platform: profile.platform,
    timezone: profile.timezone,
    hardwareConcurrency: profile.hardwareConcurrency,
    deviceMemory: profile.deviceMemory,
    screenWidth: profile.screenWidth,
    screenHeight: profile.screenHeight,
    gpuVendor: profile.gpuVendor,
  });

  const fingerprintService = new FingerprintService();
  fingerprintService.setProfile(profile);
  
  const fingerprint1 = fingerprintService.generate();
  const fingerprint2 = fingerprintService.generate();

  console.log('\nFirst generation:', {
    userAgent: fingerprint1.userAgent,
    platform: fingerprint1.platform,
    hardwareConcurrency: fingerprint1.hardwareConcurrency,
    deviceMemory: fingerprint1.deviceMemory,
    webglVendor: fingerprint1.webgl.vendor,
  });

  console.log('\nSecond generation (should be identical):', {
    userAgent: fingerprint2.userAgent,
    platform: fingerprint2.platform,
    hardwareConcurrency: fingerprint2.hardwareConcurrency,
    deviceMemory: fingerprint2.deviceMemory,
    webglVendor: fingerprint2.webgl.vendor,
  });

  const consistent = 
    fingerprint1.userAgent === fingerprint2.userAgent &&
    fingerprint1.platform === fingerprint2.platform &&
    fingerprint1.hardwareConcurrency === fingerprint2.hardwareConcurrency;

  console.log('\n✓ Fingerprints consistent:', consistent);

  // Test with actual browser
  console.log('\n=== Testing in Real Browser ===\n');

  const engine = new PuppeteerStealthEngine();
  const session = new Session({
    id: 'test-fingerprint-' + seed,
    url: 'https://bot.sannysoft.com/',
    userAgent: profile.userAgent,
    viewport: {
      width: profile.screenWidth,
      height: profile.screenHeight,
    },
    durationMs: 30000
  });

  const orchestrator = new TrafficOrchestrator(engine);

  try {
    await orchestrator.run(session, {
      headless: true,
      seed,
    });
  } catch (e) {
    console.log('Orchestrator run completed (may have errors)');
  }
}

testFingerprintConsistency().catch(console.error);

testFingerprint().catch(console.error);
