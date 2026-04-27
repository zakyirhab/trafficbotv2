import seedrandom from 'seedrandom';

export interface DeviceProfile {
  os: string; // 'Windows', 'macOS', 'Linux'
  platform: string; // navigator.platform value
  userAgent: string;
  gpuVendor: string;
  gpuRenderer: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  language: string;
  canvasNoiseSeed: number;
  audioNoiseSeed: number;
  webglNoiseSeed: number;
}

/**
 * Static profile templates for realistic device profiles across platforms.
 * Each profile is internally consistent (OS, platform, GPU match).
 */
const PROFILES: Omit<DeviceProfile, 'canvasNoiseSeed' | 'audioNoiseSeed' | 'webglNoiseSeed'>[] = [
  // Windows Profile 1 - Windows 11 + Chrome on Intel UHD
  {
    os: 'Windows',
    platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    gpuVendor: 'Google Inc. (Intel)',
    gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    hardwareConcurrency: 8,
    deviceMemory: 16,
    screenWidth: 1920,
    screenHeight: 1080,
    colorDepth: 24,
    timezone: 'America/New_York',
    language: 'en-US',
  },
  // Windows Profile 2 - Windows 10 + Chrome on NVIDIA GTX
  {
    os: 'Windows',
    platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    gpuVendor: 'Google Inc. (NVIDIA)',
    gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)',
    hardwareConcurrency: 4,
    deviceMemory: 8,
    screenWidth: 1280,
    screenHeight: 720,
    colorDepth: 24,
    timezone: 'America/Chicago',
    language: 'en-US',
  },
  // macOS Profile - Apple M1 with Safari
  {
    os: 'macOS',
    platform: 'MacIntel',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    gpuVendor: 'Apple Inc.',
    gpuRenderer: 'Apple M1',
    hardwareConcurrency: 8,
    deviceMemory: 16,
    screenWidth: 2560,
    screenHeight: 1440,
    colorDepth: 24,
    timezone: 'America/Los_Angeles',
    language: 'en-US',
  },
  // Linux Profile 1 - Ubuntu + Chrome on Intel
  {
    os: 'Linux',
    platform: 'Linux x86_64',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    gpuVendor: 'Intel Inc.',
    gpuRenderer: 'Intel(R) Iris(TM) Plus Graphics 640',
    hardwareConcurrency: 4,
    deviceMemory: 8,
    screenWidth: 1366,
    screenHeight: 768,
    colorDepth: 24,
    timezone: 'Europe/London',
    language: 'en-GB',
  },
  // Linux Profile 2 - Fedora + Chrome on AMD
  {
    os: 'Linux',
    platform: 'Linux x86_64',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    gpuVendor: 'Google Inc. (AMD)',
    gpuRenderer: 'ANGLE (AMD, Radeon(TM) RX 580 Series Direct3D11 vs_5_0 ps_5_0)',
    hardwareConcurrency: 6,
    deviceMemory: 12,
    screenWidth: 1440,
    screenHeight: 900,
    colorDepth: 24,
    timezone: 'Europe/Berlin',
    language: 'de-DE',
  },
  // Windows Profile 3 - Modern Windows with Edge
  {
    os: 'Windows',
    platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    gpuVendor: 'Google Inc. (Intel)',
    gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(TM) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
    hardwareConcurrency: 12,
    deviceMemory: 16,
    screenWidth: 2560,
    screenHeight: 1440,
    colorDepth: 24,
    timezone: 'America/Denver',
    language: 'en-US',
  },
];

/**
 * Generate a deterministic DeviceProfile based on a seed.
 * The same seed always produces the same profile (for session consistency).
 * If no seed provided, generates a random one.
 * 
 * @param seed Optional seed for reproducible profile generation. If not provided, uses Math.random().
 * @returns A fully initialized DeviceProfile with consistent noise seeds.
 */
export function generateDeviceProfile(seed?: number): DeviceProfile {
  // If no seed provided, generate a random one
  const finalSeed = seed ?? Math.floor(Math.random() * 1000000);
  
  // Use seedrandom for deterministic selection
  const rng = seedrandom(finalSeed.toString());
  
  // Pick a profile template based on seed
  const templateIndex = Math.floor(rng() * PROFILES.length);
  const template = PROFILES[templateIndex];
  
  // Derive noise seeds from the main seed
  const canvasNoiseSeed = finalSeed;
  const audioNoiseSeed = finalSeed + 1;
  const webglNoiseSeed = finalSeed + 2;
  
  return {
    ...template,
    canvasNoiseSeed,
    audioNoiseSeed,
    webglNoiseSeed,
  };
}

/**
 * Get a RNG function for a specific seed.
 * Useful for seeding any randomization within a profile context.
 */
export function getRngForSeed(seed: number) {
  return seedrandom(seed.toString());
}
