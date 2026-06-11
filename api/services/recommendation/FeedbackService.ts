import type { RecommendationFeedback, ABTestVariant } from '../../../shared/types.js';
import { SimilarityMatcher } from './SimilarityMatcher.js';
import { ABTestService } from './ABTestService.js';
import { FileStorageService } from '../FileStorageService.js';

const FEEDBACK_LOG_FILE = 'feedback_log.json';

export interface ProcessedFeedback {
  feedback: RecommendationFeedback;
  variant: ABTestVariant;
  abTestRecorded: boolean;
  caseUpdated: boolean;
  updatedCaseId?: string;
  acceptCountDelta: number;
  processedAt: string;
}

export class FeedbackService {
  static async process(
    feedback: RecommendationFeedback,
    variant: ABTestVariant
  ): Promise<ProcessedFeedback> {
    const result: ProcessedFeedback = {
      feedback,
      variant,
      abTestRecorded: false,
      caseUpdated: false,
      acceptCountDelta: 0,
      processedAt: new Date().toISOString(),
    };

    try {
      await ABTestService.recordAdoption(variant, feedback.adopted);
      result.abTestRecorded = true;
    } catch {
      // ABTest failure should not block the rest
    }

    if (feedback.adopted) {
      const delta = feedback.feedbackType === 'dismiss' ? -1 : 1;
      const updated = await this.tryUpdateAcceptCount(feedback, delta);
      if (updated) {
        result.caseUpdated = true;
        result.updatedCaseId = updated;
        result.acceptCountDelta = delta;
      }
    }

    await this.appendFeedbackLog(result);

    return result;
  }

  static async tryUpdateAcceptCount(
    feedback: RecommendationFeedback,
    delta: number
  ): Promise<string | null> {
    if (feedback.matchedCaseId) {
      const ok = await SimilarityMatcher.updateCaseAcceptCountByCaseId(feedback.matchedCaseId, delta);
      if (ok) return feedback.matchedCaseId;
    }

    if (feedback.annotationId) {
      const ok = await SimilarityMatcher.updateCaseAcceptCount(feedback.annotationId, delta);
      if (ok) return feedback.annotationId;
    }

    return null;
  }

  static async appendFeedbackLog(entry: ProcessedFeedback): Promise<void> {
    try {
      const log = await FileStorageService.readRecommendationJson<ProcessedFeedback[]>(
        FEEDBACK_LOG_FILE,
        []
      );
      log.push(entry);
      const trimmed = log.slice(-500);
      await FileStorageService.writeRecommendationJson(FEEDBACK_LOG_FILE, trimmed);
    } catch {
      // ignore logging errors
    }
  }

  static async getFeedbackStats(): Promise<{
    total: number;
    adopted: number;
    dismissed: number;
    caseUpdatedCount: number;
    byVariant: Record<string, number>;
  }> {
    const log = await FileStorageService.readRecommendationJson<ProcessedFeedback[]>(
      FEEDBACK_LOG_FILE,
      []
    );
    const stats = {
      total: log.length,
      adopted: log.filter((l) => l.feedback.adopted).length,
      dismissed: log.filter((l) => !l.feedback.adopted).length,
      caseUpdatedCount: log.filter((l) => l.caseUpdated).length,
      byVariant: {} as Record<string, number>,
    };
    for (const l of log) {
      stats.byVariant[l.variant] = (stats.byVariant[l.variant] || 0) + 1;
    }
    return stats;
  }
}
