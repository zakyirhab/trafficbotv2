import { BrowserEngine } from '../../domain/interfaces/BrowserEngine';
import { logger } from '../logging/logger';

export interface BehaviorOptions {
  intensity: 'low' | 'medium' | 'high';
}

export class BehaviorService {
  /**
   * Performs a random human-like action (scroll, move, or wait)
   */
  static async simulateRandomAction(
    engine: BrowserEngine, 
    viewport: { width: number, height: number },
    options: BehaviorOptions
  ): Promise<void> {
    const rand = Math.random();
    
    // Adjust probability based on intensity
    const thresholds = options.intensity === 'high' 
      ? { scroll: 0.35, move: 0.7, pause: 0.9 } 
      : options.intensity === 'medium' 
        ? { scroll: 0.25, move: 0.5, pause: 0.8 }
        : { scroll: 0.1, move: 0.2, pause: 0.7 };

    if (rand < thresholds.scroll) {
      await this.simulateScroll(engine);
    } else if (rand < thresholds.move) {
      await this.simulateMouseMove(engine, viewport);
    } else if (rand < thresholds.pause) {
      // Simulate "Reading" - long pause with micro-jitters
      logger.debug('Simulating reading pause...');
      const pauseDuration = Math.floor(Math.random() * 3000) + 2000;
      const start = Date.now();
      while (Date.now() - start < pauseDuration) {
        // Occasional tiny mouse nudge while reading
        if (Math.random() > 0.8) {
          const nudgeX = Math.floor(Math.random() * 10) - 5;
          const nudgeY = Math.floor(Math.random() * 10) - 5;
          await engine.mouseMove(viewport.width / 2 + nudgeX, viewport.height / 2 + nudgeY);
        }
        await engine.wait(500);
      }
    } else {
      // Micro-wait
      await engine.wait(Math.floor(Math.random() * 500) + 100);
    }
  }

  private static async simulateScroll(engine: BrowserEngine): Promise<void> {
    const direction = Math.random() > 0.3 ? 1 : -1; // Mostly scroll down
    const distance = Math.floor(Math.random() * 400) + 100;
    logger.debug(`Simulating scroll: ${direction * distance}px`);
    
    // Smooth scroll simulation via steps
    const steps = 5;
    const stepDistance = Math.floor(distance / steps);
    for (let i = 0; i < steps; i++) {
      await engine.scroll(0, direction * stepDistance);
      await engine.wait(Math.floor(Math.random() * 50) + 20);
    }
  }

  private static async simulateMouseMove(
    engine: BrowserEngine, 
    viewport: { width: number, height: number }
  ): Promise<void> {
    const startX = Math.floor(Math.random() * viewport.width);
    const startY = Math.floor(Math.random() * viewport.height);
    const targetX = Math.floor(Math.random() * viewport.width);
    const targetY = Math.floor(Math.random() * viewport.height);
    
    logger.debug(`Simulating human-like mouse move from (${startX}, ${startY}) to (${targetX}, ${targetY})`);
    
    // Use bezier curve for natural movement
    await this.bezierMouseMove(engine, startX, startY, targetX, targetY);
  }

  /**
   * Simulates human-like mouse movement using bezier curve
   */
  private static async bezierMouseMove(
    engine: BrowserEngine,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    const steps = 20 + Math.floor(Math.random() * 30); // 20-50 steps for smoothness
    const duration = 500 + Math.floor(Math.random() * 1000); // 500-1500ms total duration
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      // Quadratic bezier curve with random control point
      const controlX = (startX + endX) / 2 + (Math.random() - 0.5) * 100;
      const controlY = (startY + endY) / 2 + (Math.random() - 0.5) * 100;
      
      const x = Math.pow(1 - t, 2) * startX + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * endX;
      const y = Math.pow(1 - t, 2) * startY + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * endY;
      
      await engine.mouseMove(Math.round(x), Math.round(y));
      
      // Variable step delay for natural feel
      const stepDelay = (duration / steps) + (Math.random() - 0.5) * 50;
      await engine.wait(Math.max(10, stepDelay));
    }
  }
}
