import type {
  RecommendationAlgorithm,
  ABTestConfig,
  ABTestMetrics,
  ABTestVariant,
} from '../../../shared/types.js';
import { FileStorageService } from '../FileStorageService.js';

const METRICS_FILE = 'abtest_metrics.json';
const CONFIG_FILE = 'abtest_config.json';

interface VariantMetrics {
  A: ABTestMetrics;
  B: ABTestMetrics;
}

const DEFAULT_CONFIG: ABTestConfig = {
  enabled: false,
  variantA: 'hybrid',
  variantB: 'rule',
  trafficSplit: 0.5,
};

export class ABTestService {
  private static config: ABTestConfig | null = null;
  private static metricsCache: VariantMetrics | null = null;

  static async getConfig(): Promise<ABTestConfig> {
    if (!this.config) {
      this.config = await FileStorageService.readRecommendationJson<ABTestConfig>(
        CONFIG_FILE,
        DEFAULT_CONFIG
      );
    }
    return this.config;
  }

  static async setConfig(config: ABTestConfig): Promise<ABTestConfig> {
    this.config = config;
    await FileStorageService.writeRecommendationJson(CONFIG_FILE, config);
    return config;
  }

  static async assignVariant(sessionId: string): Promise<{
    variant: ABTestVariant;
    algorithm: RecommendationAlgorithm;
  }> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return { variant: 'A', algorithm: 'hybrid' };
    }

    const hash = this.simpleHash(sessionId);
    const variant: ABTestVariant = hash < config.trafficSplit ? 'A' : 'B';
    const algorithm = variant === 'A' ? config.variantA : config.variantB;
    return { variant, algorithm };
  }

  static async getMetrics(): Promise<VariantMetrics> {
    if (!this.metricsCache) {
      this.metricsCache = await FileStorageService.readRecommendationJson<VariantMetrics>(
        METRICS_FILE,
        this.getDefaultMetrics()
      );
    }
    return this.metricsCache;
  }

  static async recordRecommendation(
    variant: ABTestVariant,
    algorithm: RecommendationAlgorithm,
    confidence: number
  ): Promise<void> {
    const metrics = await this.getMetrics();
    const target = metrics[variant];
    target.totalRecommendations++;
    target.avgConfidence =
      (target.avgConfidence * (target.totalRecommendations - 1) + confidence) /
      target.totalRecommendations;
    await this.saveMetrics(metrics);
  }

  static async recordAdoption(
    variant: ABTestVariant,
    adopted: boolean
  ): Promise<void> {
    const metrics = await this.getMetrics();
    if (adopted) {
      metrics[variant].adoptedCount++;
    }
    metrics[variant].adoptionRate =
      metrics[variant].totalRecommendations > 0
        ? metrics[variant].adoptedCount / metrics[variant].totalRecommendations
        : 0;
    await this.saveMetrics(metrics);
  }

  static async resetMetrics(): Promise<void> {
    this.metricsCache = this.getDefaultMetrics();
    await FileStorageService.writeRecommendationJson(METRICS_FILE, this.metricsCache);
  }

  private static getDefaultMetrics(): VariantMetrics {
    return {
      A: {
        variant: 'A',
        algorithm: 'hybrid',
        totalRecommendations: 0,
        adoptedCount: 0,
        adoptionRate: 0,
        avgConfidence: 0,
      },
      B: {
        variant: 'B',
        algorithm: 'rule',
        totalRecommendations: 0,
        adoptedCount: 0,
        adoptionRate: 0,
        avgConfidence: 0,
      },
    };
  }

  private static async saveMetrics(metrics: VariantMetrics): Promise<void> {
    this.metricsCache = metrics;
    await FileStorageService.writeRecommendationJson(METRICS_FILE, metrics);
  }

  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 1000) / 1000;
  }
}
