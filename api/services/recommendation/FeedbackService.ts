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
  updateChannel: 'matchedCaseId' | 'annotationId' | 'ruleId' | 'contentFingerprint' | 'indexAnnotation' | 'none';
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
      updateChannel: 'none',
      processedAt: new Date().toISOString(),
    };

    try {
      await ABTestService.recordAdoption(variant, feedback.adopted);
      result.abTestRecorded = true;
    } catch {
      // ABTest failure should not block the rest
    }

    if (feedback.adopted && feedback.feedbackType !== 'submit') {
      const delta = feedback.feedbackType === 'dismiss' ? -1 : 1;
      const updateResult = await this.tryUpdateAcceptCount(feedback, delta);
      if (updateResult.updated) {
        result.caseUpdated = true;
        result.updatedCaseId = updateResult.caseId;
        result.acceptCountDelta = delta;
        result.updateChannel = updateResult.channel;
      }
    }

    if (feedback.feedbackType === 'submit') {
      result.caseUpdated = true;
      result.acceptCountDelta = 1;
      result.updateChannel = 'indexAnnotation';
    }

    await this.appendFeedbackLog(result);

    return result;
  }

  static async tryUpdateAcceptCount(
    feedback: RecommendationFeedback,
    delta: number
  ): Promise<{
    updated: boolean;
    caseId?: string;
    channel: ProcessedFeedback['updateChannel'];
  }> {
    if (feedback.matchedCaseId) {
      const ok = await SimilarityMatcher.updateCaseAcceptCountByCaseId(
        feedback.matchedCaseId,
        delta
      );
      if (ok) {
        return { updated: true, caseId: feedback.matchedCaseId, channel: 'matchedCaseId' };
      }
    }

    if (feedback.annotationId) {
      const ok = await SimilarityMatcher.updateCaseAcceptCount(feedback.annotationId, delta);
      if (ok) {
        return { updated: true, caseId: feedback.annotationId, channel: 'annotationId' };
      }
    }

    if (feedback.ruleId && feedback.adoptedContent && feedback.feedbackType === 'submit') {
      const type = feedback.adoptedSuggestedText ? 'suggestion' : 'comment';
      const ok = await SimilarityMatcher.updateCaseAcceptCountByRuleId(
        feedback.ruleId,
        feedback.adoptedContent,
        type,
        delta
      );
      if (ok) {
        return { updated: true, channel: 'ruleId' };
      }
    }

    if (feedback.adoptedContent && feedback.feedbackType === 'submit') {
      const type = feedback.adoptedSuggestedText ? 'suggestion' : 'comment';
      const selectedText = feedback.adoptedContent.substring(0, 50);
      const ok = await SimilarityMatcher.updateCaseAcceptCountByContentFingerprint(
        feedback.adoptedContent,
        type,
        selectedText,
        delta
      );
      if (ok) {
        return { updated: true, channel: 'contentFingerprint' };
      }
    }

    return { updated: false, channel: 'none' };
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
    byChannel: Record<string, number>;
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
      byChannel: {} as Record<string, number>,
    };
    for (const l of log) {
      stats.byVariant[l.variant] = (stats.byVariant[l.variant] || 0) + 1;
      stats.byChannel[l.updateChannel] = (stats.byChannel[l.updateChannel] || 0) + 1;
    }
    return stats;
  }
}
