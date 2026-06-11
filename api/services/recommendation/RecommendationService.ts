import type {
  AnnotationRecommendation,
  RecommendationRequest,
  RecommendationFeedback,
  HistoricalCase,
  RecommendationAlgorithm,
  ABTestVariant,
} from '../../../shared/types.js';
import { FeatureExtractor } from './FeatureExtractor.js';
import { SimilarityMatcher } from './SimilarityMatcher.js';
import { RuleEngine } from './RuleEngine.js';
import { ABTestService } from './ABTestService.js';
import { FeedbackService } from './FeedbackService.js';

export class RecommendationService {
  static async getRecommendations(
    request: RecommendationRequest,
    sessionId: string
  ): Promise<{
    recommendations: AnnotationRecommendation[];
    variant: ABTestVariant;
    algorithm: RecommendationAlgorithm;
  }> {
    const { variant, algorithm } = await ABTestService.assignVariant(sessionId);
    const targetText = request.selectedText || request.fullContent;
    const featureVector = FeatureExtractor.extractFromRequest(request);

    let recommendations: AnnotationRecommendation[] = [];

    switch (algorithm) {
      case 'similarity':
        recommendations = await this.runSimilarityAlgorithm(targetText, featureVector);
        if (recommendations.length === 0) {
          recommendations = this.runRuleAlgorithm(targetText, featureVector);
        }
        break;
      case 'rule':
        recommendations = this.runRuleAlgorithm(targetText, featureVector);
        break;
      case 'hybrid':
      default:
        recommendations = await this.runHybridAlgorithm(targetText, featureVector);
        break;
    }

    recommendations = recommendations.slice(0, 3);

    for (const rec of recommendations) {
      await ABTestService.recordRecommendation(variant, algorithm, rec.confidence);
    }

    return { recommendations, variant, algorithm };
  }

  static async recordFeedback(
    feedback: RecommendationFeedback,
    variant: ABTestVariant
  ): Promise<boolean> {
    const result = await FeedbackService.process(feedback, variant);
    return result.caseUpdated || result.abTestRecorded;
  }

  static async indexAnnotation(
    annotation: {
      id: string;
      docId: string;
      paragraphId: string;
      type: 'comment' | 'suggestion';
      content: string;
      suggestedText?: string;
      originalText?: string;
      status: 'pending' | 'accepted' | 'rejected';
    },
    request: RecommendationRequest,
    matchedCaseId?: string
  ): Promise<HistoricalCase> {
    const targetText = request.selectedText || request.fullContent;
    const featureVector = FeatureExtractor.extractFromRequest(request);

    if (matchedCaseId) {
      await SimilarityMatcher.updateCaseAcceptCountByCaseId(matchedCaseId, 1);
    }

    return SimilarityMatcher.findOrCreateCase(
      annotation.id,
      targetText,
      () => ({
        id: `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        annotationId: annotation.id,
        annotationType: annotation.type,
        annotationContent: annotation.content,
        suggestedText: annotation.suggestedText,
        originalText: annotation.originalText,
        featureVector,
        selectedText: targetText,
        paragraphType: request.paragraphType,
        status: annotation.status,
        acceptCount: annotation.status === 'accepted' ? 1 : 0,
        createdAt: new Date().toISOString(),
        docId: request.docId,
      })
    );
  }

  static async getHistoricalCasesCount(): Promise<number> {
    const cases = await SimilarityMatcher.getHistoricalCases();
    return cases.length;
  }

  private static async runSimilarityAlgorithm(
    targetText: string,
    featureVector: ReturnType<typeof FeatureExtractor.extractFromRequest>
  ): Promise<AnnotationRecommendation[]> {
    const similarCases = await SimilarityMatcher.findSimilarCases(
      featureVector,
      targetText,
      15
    );
    return SimilarityMatcher.generateRecommendations(similarCases, 3);
  }

  private static runRuleAlgorithm(
    targetText: string,
    featureVector: ReturnType<typeof FeatureExtractor.extractFromRequest>
  ): AnnotationRecommendation[] {
    return RuleEngine.generateRecommendations(
      targetText,
      featureVector.text,
      featureVector.context,
      3
    );
  }

  private static async runHybridAlgorithm(
    targetText: string,
    featureVector: ReturnType<typeof FeatureExtractor.extractFromRequest>
  ): Promise<AnnotationRecommendation[]> {
    const [similarRecs, ruleRecs] = await Promise.all([
      this.runSimilarityAlgorithm(targetText, featureVector),
      Promise.resolve(this.runRuleAlgorithm(targetText, featureVector)),
    ]);

    const combined = [...similarRecs, ...ruleRecs];
    const deduplicated = this.deduplicateRecommendations(combined);
    deduplicated.sort((a, b) => b.confidence - a.confidence);
    return deduplicated;
  }

  private static deduplicateRecommendations(
    recs: AnnotationRecommendation[]
  ): AnnotationRecommendation[] {
    const seen = new Map<string, AnnotationRecommendation>();
    for (const rec of recs) {
      const key = `${rec.type}|${rec.content.substring(0, 50)}`;
      const existing = seen.get(key);
      if (!existing || rec.confidence > existing.confidence) {
        seen.set(key, rec);
      }
    }
    return Array.from(seen.values());
  }
}
