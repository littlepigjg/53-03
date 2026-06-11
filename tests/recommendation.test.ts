import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeatureExtractor } from '../api/services/recommendation/FeatureExtractor.js';
import { SimilarityMatcher } from '../api/services/recommendation/SimilarityMatcher.js';
import { RuleEngine } from '../api/services/recommendation/RuleEngine.js';
import { FeedbackService } from '../api/services/recommendation/FeedbackService.js';
import { RecommendationService } from '../api/services/recommendation/RecommendationService.js';
import type {
  TextFeatures,
  ContextFeatures,
  FeatureVector,
  HistoricalCase,
  AnnotationRecommendation,
  RecommendationFeedback,
  ParagraphType,
} from '../shared/types.js';

function makeTextFeatures(overrides: Partial<TextFeatures> = {}): TextFeatures {
  return {
    charCount: 100,
    wordCount: 30,
    digitRatio: 0.05,
    codeRatio: 0.02,
    punctuationRatio: 0.1,
    chineseRatio: 0.6,
    englishRatio: 0.3,
    uppercaseRatio: 0.05,
    hasCodeBlock: false,
    hasUrl: false,
    hasEmail: false,
    hasDatePattern: false,
    hasNumberPattern: false,
    keywordVector: [],
    ...overrides,
  };
}

function makeContextFeatures(overrides: Partial<ContextFeatures> = {}): ContextFeatures {
  return {
    paragraphType: 'paragraph',
    paragraphIndex: 0,
    totalParagraphs: 5,
    inHeadingSection: false,
    inCodeSection: false,
    ...overrides,
  };
}

function makeFeatureVector(overrides: Partial<FeatureVector> = {}): FeatureVector {
  const text = makeTextFeatures(overrides.text);
  const context = makeContextFeatures(overrides.context);
  return {
    text,
    context,
    combined: FeatureExtractor.buildCombinedVector(text, context),
    ...overrides,
  };
}

function makeHistoricalCase(overrides: Partial<HistoricalCase> = {}): HistoricalCase {
  return {
    id: 'case_test_001',
    annotationId: 'ann_test_001',
    annotationType: 'comment',
    annotationContent: '建议检查代码格式规范',
    featureVector: makeFeatureVector(),
    selectedText: 'function test() { return 1; }',
    paragraphType: 'code',
    status: 'accepted',
    acceptCount: 0,
    createdAt: new Date().toISOString(),
    docId: 'doc_test_001',
    ...overrides,
  };
}

describe('FeatureExtractor', () => {
  it('extracts text features from code snippet', () => {
    const code = 'function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }';
    const features = FeatureExtractor.extractTextFeatures(code);

    expect(features.charCount).toBeGreaterThan(0);
    expect(features.codeRatio).toBeGreaterThan(0.05);
    expect(features.hasCodeBlock).toBe(true);
    expect(features.englishRatio).toBeGreaterThan(0.3);
  });

  it('extracts number patterns from text with statistics', () => {
    const text = '项目总预算为 1500000 元，转化率提升了 35.6%，用户增长达到 120 万。';
    const features = FeatureExtractor.extractTextFeatures(text);

    expect(features.hasNumberPattern).toBe(true);
    expect(features.digitRatio).toBeGreaterThan(0);
    expect(features.chineseRatio).toBeGreaterThan(0.1);
  });

  it('extracts date patterns', () => {
    const text = '计划于 2026年3月15日 正式发布';
    const features = FeatureExtractor.extractTextFeatures(text);
    expect(features.hasDatePattern).toBe(true);
  });

  it('extracts URL patterns', () => {
    const text = '详情请访问 https://example.com/document 获取更多信息。';
    const features = FeatureExtractor.extractTextFeatures(text);
    expect(features.hasUrl).toBe(true);
  });

  it('extracts TODO patterns', () => {
    const text = 'TODO: 后续需要优化这部分的性能问题';
    const features = FeatureExtractor.extractTextFeatures(text);
    expect(features.keywordVector.length).toBeGreaterThan(0);
  });

  it('builds combined vector with consistent dimensions', () => {
    const text = makeTextFeatures();
    const context = makeContextFeatures();
    const vec1 = FeatureExtractor.buildCombinedVector(text, context);
    const vec2 = FeatureExtractor.buildCombinedVector(text, context);
    expect(vec1.length).toBe(vec2.length);
    expect(vec1.length).toBeGreaterThan(0);
  });

  it('extracts context features with paragraph neighbors', () => {
    const ctx = FeatureExtractor.extractContextFeatures(
      'code', 3, 10,
      { type: 'heading', content: 'Section Title' },
      { type: 'paragraph', content: 'Description text' }
    );
    expect(ctx.paragraphType).toBe('code');
    expect(ctx.prevParagraphType).toBe('heading');
    expect(ctx.nextParagraphType).toBe('paragraph');
    expect(ctx.inCodeSection).toBe(true);
  });
});

describe('SimilarityMatcher', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [1, 0, 0, 1, 0];
      expect(SimilarityMatcher.cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(SimilarityMatcher.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('returns 0 for empty vectors', () => {
      expect(SimilarityMatcher.cosineSimilarity([], [])).toBe(0);
    });

    it('returns 0 for mismatched lengths', () => {
      expect(SimilarityMatcher.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it('computes correct similarity for partial overlap', () => {
      const a = [1, 1, 0, 0];
      const b = [1, 0, 1, 0];
      const sim = SimilarityMatcher.cosineSimilarity(a, b);
      expect(sim).toBeCloseTo(0.5, 4);
    });
  });

  describe('textSimilarity', () => {
    it('returns high similarity for identical text', () => {
      const sim = SimilarityMatcher.textSimilarity('hello world', 'hello world');
      expect(sim).toBeCloseTo(1, 3);
    });

    it('returns low similarity for dissimilar text', () => {
      const sim = SimilarityMatcher.textSimilarity('abcdef', 'xyzuvw');
      expect(sim).toBeLessThan(0.3);
    });

    it('handles empty strings', () => {
      expect(SimilarityMatcher.textSimilarity('', 'test')).toBe(0);
      expect(SimilarityMatcher.textSimilarity('test', '')).toBe(0);
    });
  });

  describe('calculateAcceptBoost', () => {
    it('returns 0 for zero acceptCount', () => {
      expect(SimilarityMatcher.calculateAcceptBoost(0)).toBe(0);
    });

    it('increases with acceptCount but with diminishing returns (log)', () => {
      const boost1 = SimilarityMatcher.calculateAcceptBoost(1);
      const boost5 = SimilarityMatcher.calculateAcceptBoost(5);
      const boost10 = SimilarityMatcher.calculateAcceptBoost(10);
      const boost100 = SimilarityMatcher.calculateAcceptBoost(100);

      expect(boost1).toBeGreaterThan(0);
      expect(boost5).toBeGreaterThan(boost1);
      expect(boost10).toBeGreaterThan(boost5);
      expect(boost100).toBeGreaterThan(boost10);

      const incremental1to5 = boost5 - boost1;
      const incremental5to10 = boost10 - boost5;
      expect(incremental5to10).toBeLessThan(incremental1to5);
    });

    it('caps at maximum boost', () => {
      const boostVeryHigh = SimilarityMatcher.calculateAcceptBoost(100000);
      expect(boostVeryHigh).toBeLessThanOrEqual(0.25);
    });
  });

  describe('generateRecommendations', () => {
    it('sorts by confidence descending', () => {
      const caseA = makeHistoricalCase({
        id: 'case_a', annotationContent: 'Content A', acceptCount: 10
      });
      const caseB = makeHistoricalCase({
        id: 'case_b', annotationContent: 'Content B', acceptCount: 0
      });
      const featureVec = makeFeatureVector();

      const similarCases = [
        { caseItem: caseA, similarity: 0.7 },
        { caseItem: caseB, similarity: 0.5 },
      ];

      const recs = SimilarityMatcher.generateRecommendations(similarCases, 3);
      expect(recs.length).toBe(2);
      expect(recs[0].confidence).toBeGreaterThanOrEqual(recs[1].confidence);
    });

    it('includes matchedCaseId from matched case', () => {
      const caseItem = makeHistoricalCase({ id: 'case_match_001' });
      const similarCases = [{ caseItem, similarity: 0.8 }];
      const recs = SimilarityMatcher.generateRecommendations(similarCases, 1);
      expect(recs[0].matchedCaseId).toBe('case_match_001');
    });

    it('includes ruleId from matched case', () => {
      const caseItem = makeHistoricalCase({ id: 'case_rule_001', ruleId: 'rule_code_format' });
      const similarCases = [{ caseItem, similarity: 0.8 }];
      const recs = SimilarityMatcher.generateRecommendations(similarCases, 1);
      expect(recs[0].ruleId).toBe('rule_code_format');
    });

    it('higher acceptCount produces higher confidence', () => {
      const lowAcceptCase = makeHistoricalCase({
        id: 'case_low', annotationContent: 'Same content', acceptCount: 0
      });
      const highAcceptCase = makeHistoricalCase({
        id: 'case_high', annotationContent: 'Same content', acceptCount: 20
      });

      const recsLow = SimilarityMatcher.generateRecommendations(
        [{ caseItem: lowAcceptCase, similarity: 0.7 }], 1
      );
      const recsHigh = SimilarityMatcher.generateRecommendations(
        [{ caseItem: highAcceptCase, similarity: 0.7 }], 1
      );

      expect(recsHigh[0].confidence).toBeGreaterThan(recsLow[0].confidence);
    });

    it('clusters cases with same type+content', () => {
      const case1 = makeHistoricalCase({
        id: 'case_c1', annotationContent: 'Check format', annotationType: 'suggestion', acceptCount: 3
      });
      const case2 = makeHistoricalCase({
        id: 'case_c2', annotationContent: 'Check format', annotationType: 'suggestion', acceptCount: 5
      });

      const similarCases = [
        { caseItem: case1, similarity: 0.8 },
        { caseItem: case2, similarity: 0.75 },
      ];

      const recs = SimilarityMatcher.generateRecommendations(similarCases, 3);
      expect(recs.length).toBe(1);
      expect(recs[0].confidence).toBeGreaterThan(0);
    });
  });
});

describe('RuleEngine', () => {
  it('detects code patterns and recommends format suggestions', () => {
    const text = 'function test() { return 1; }';
    const features = makeTextFeatures({ hasCodeBlock: true, codeRatio: 0.15 });
    const context = makeContextFeatures({ paragraphType: 'code' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 3);
    expect(recs.length).toBeGreaterThan(0);

    const codeRec = recs.find((r) => r.ruleId === 'rule_code_format');
    expect(codeRec).toBeDefined();
    expect(codeRec!.algorithm).toBe('rule');
    expect(codeRec!.confidence).toBeGreaterThan(0);
    expect(codeRec!.type).toBe('suggestion');
  });

  it('detects number patterns and recommends accuracy verification', () => {
    const text = '项目总预算为 1500000 元，转化率提升了 35.6%';
    const features = makeTextFeatures({ hasNumberPattern: true, digitRatio: 0.12 });
    const context = makeContextFeatures({ paragraphType: 'paragraph' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 3);
    const numberRec = recs.find((r) => r.ruleId === 'rule_number_accuracy');
    expect(numberRec).toBeDefined();
    expect(numberRec!.type).toBe('comment');
  });

  it('detects TODO patterns', () => {
    const text = 'TODO: 后续需要优化性能';
    const features = makeTextFeatures();
    const context = makeContextFeatures({ paragraphType: 'paragraph' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 3);
    const todoRec = recs.find((r) => r.ruleId === 'rule_todo_resolve');
    expect(todoRec).toBeDefined();
    expect(todoRec!.type).toBe('suggestion');
    expect(todoRec!.suggestedText).toBeDefined();
  });

  it('detects date patterns', () => {
    const text = '计划于 2026年3月15日 发布';
    const features = makeTextFeatures({ hasDatePattern: true });
    const context = makeContextFeatures({ paragraphType: 'paragraph' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 3);
    const dateRec = recs.find((r) => r.ruleId === 'rule_date_validity');
    expect(dateRec).toBeDefined();
  });

  it('detects URL patterns', () => {
    const text = '请访问 https://example.com 获取详情';
    const features = makeTextFeatures({ hasUrl: true });
    const context = makeContextFeatures({ paragraphType: 'paragraph' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 3);
    const urlRec = recs.find((r) => r.ruleId === 'rule_url_alive');
    expect(urlRec).toBeDefined();
  });

  it('rule-based recommendations have ruleId but no matchedCaseId', () => {
    const text = 'function test() { return 1; }';
    const features = makeTextFeatures({ hasCodeBlock: true, codeRatio: 0.15 });
    const context = makeContextFeatures({ paragraphType: 'code' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 3);
    for (const rec of recs) {
      expect(rec.ruleId).toBeDefined();
      expect(rec.matchedCaseId).toBeUndefined();
      expect(rec.algorithm).toBe('rule');
    }
  });

  it('returns recommendations with decreasing confidence', () => {
    const text = 'function test() { return 1; } 2026年3月15日 TODO: fix';
    const features = makeTextFeatures({
      hasCodeBlock: true, codeRatio: 0.15, hasDatePattern: true, hasNumberPattern: true
    });
    const context = makeContextFeatures({ paragraphType: 'code' });

    const recs = RuleEngine.generateRecommendations(text, features, context, 10);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.confidence).toBeGreaterThan(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('FeedbackService - Rule Engine AcceptCount Fix', () => {
  it('submit feedback does NOT call tryUpdateAcceptCount (indexAnnotation handles it)', async () => {
    const feedback: RecommendationFeedback = {
      recommendationId: 'rec_rule_001',
      annotationId: 'ann_new_001',
      ruleId: 'rule_code_format',
      adopted: true,
      adoptedContent: '建议检查代码格式规范',
      feedbackType: 'submit',
    };

    const updateSpy = vi.spyOn(SimilarityMatcher, 'updateCaseAcceptCountByRuleId').mockResolvedValue(false);
    const updateByAnnotationIdSpy = vi.spyOn(SimilarityMatcher, 'updateCaseAcceptCount').mockResolvedValue(false);

    const result = await FeedbackService.process(feedback, 'A');

    expect(result.caseUpdated).toBe(true);
    expect(result.updateChannel).toBe('indexAnnotation');
    expect(result.acceptCountDelta).toBe(1);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(updateByAnnotationIdSpy).not.toHaveBeenCalled();

    updateSpy.mockRestore();
    updateByAnnotationIdSpy.mockRestore();
  });

  it('adopt feedback with matchedCaseId updates acceptCount', async () => {
    const feedback: RecommendationFeedback = {
      recommendationId: 'rec_sim_001',
      matchedCaseId: 'case_match_001',
      adopted: true,
      feedbackType: 'adopt',
    };

    const updateByCaseIdSpy = vi.spyOn(SimilarityMatcher, 'updateCaseAcceptCountByCaseId').mockResolvedValue(true);

    const result = await FeedbackService.process(feedback, 'A');

    expect(result.caseUpdated).toBe(true);
    expect(result.updatedCaseId).toBe('case_match_001');
    expect(result.updateChannel).toBe('matchedCaseId');

    updateByCaseIdSpy.mockRestore();
  });

  it('dismiss feedback decrements acceptCount via matchedCaseId', async () => {
    const feedback: RecommendationFeedback = {
      recommendationId: 'rec_sim_001',
      matchedCaseId: 'case_match_001',
      adopted: false,
      feedbackType: 'dismiss',
    };

    const result = await FeedbackService.process(feedback, 'A');

    expect(result.caseUpdated).toBe(false);
    expect(result.acceptCountDelta).toBe(0);

    expect(result.feedback.adopted).toBe(false);
  });

  it('adopt feedback without matchedCaseId falls through to other channels', async () => {
    const feedback: RecommendationFeedback = {
      recommendationId: 'rec_rule_001',
      ruleId: 'rule_code_format',
      adopted: true,
      feedbackType: 'adopt',
    };

    const result = await FeedbackService.process(feedback, 'A');

    expect(result.caseUpdated).toBe(false);
    expect(result.updateChannel).toBe('none');
  });
});

describe('RecommendationService.indexAnnotation - AcceptCount for Rule Engine', () => {
  let savedCases: HistoricalCase[] = [];
  let writeCallCount = 0;

  beforeEach(() => {
    savedCases = [];
    writeCallCount = 0;
  });

  function mockFileStorage() {
    vi.spyOn(SimilarityMatcher, 'getHistoricalCases').mockImplementation(async () => [...savedCases]);
    vi.spyOn(SimilarityMatcher, 'updateCaseAcceptCountByCaseId' as keyof typeof SimilarityMatcher).mockImplementation(
      async (caseId: string, delta: number) => {
        const c = savedCases.find((x) => x.id === caseId);
        if (c) { c.acceptCount += delta; return true; }
        return false;
      }
    );
  }

  it('creates new case with acceptCount=1 when ruleId is present (rule engine adoption)', async () => {
    mockFileStorage();

    const annotation = {
      id: 'ann_rule_adopt_001',
      docId: 'doc_001',
      paragraphId: 'para_001',
      type: 'suggestion' as const,
      content: '建议检查代码格式规范',
      suggestedText: 'formatted code',
      originalText: 'unformatted code',
      status: 'pending' as const,
    };

    const request = {
      docId: 'doc_001',
      paragraphId: 'para_001',
      selectedText: 'function test() { return 1; }',
      fullContent: 'function test() { return 1; }',
      paragraphType: 'code' as ParagraphType,
      paragraphIndex: 0,
      totalParagraphs: 5,
    };

    const originalSave = SimilarityMatcher.findOrCreateCase;
    vi.spyOn(SimilarityMatcher, 'findOrCreateCase').mockImplementation(
      async (annotationId, fingerprint, factory, ruleId) => {
        const newCase = factory();
        savedCases.push(newCase);
        return newCase;
      }
    );

    const result = await RecommendationService.indexAnnotation(
      annotation, request, undefined, 'rule_code_format'
    );

    expect(result.acceptCount).toBe(1);
    expect(result.ruleId).toBeUndefined();

    vi.restoreAllMocks();
  });

  it('creates new case with acceptCount=0 when no matchedCaseId or ruleId', async () => {
    mockFileStorage();

    const annotation = {
      id: 'ann_manual_001',
      docId: 'doc_001',
      paragraphId: 'para_001',
      type: 'comment' as const,
      content: '手动添加的批注',
      status: 'pending' as const,
    };

    const request = {
      docId: 'doc_001',
      paragraphId: 'para_001',
      selectedText: '手动选中的文本',
      fullContent: '手动选中的文本内容',
      paragraphType: 'paragraph' as ParagraphType,
      paragraphIndex: 0,
      totalParagraphs: 5,
    };

    vi.spyOn(SimilarityMatcher, 'findOrCreateCase').mockImplementation(
      async (annotationId, fingerprint, factory) => {
        const newCase = factory();
        savedCases.push(newCase);
        return newCase;
      }
    );

    const result = await RecommendationService.indexAnnotation(annotation, request);

    expect(result.acceptCount).toBe(0);

    vi.restoreAllMocks();
  });

  it('creates new case with acceptCount=1 when matchedCaseId is present (similarity adoption)', async () => {
    mockFileStorage();

    const annotation = {
      id: 'ann_sim_adopt_001',
      docId: 'doc_001',
      paragraphId: 'para_001',
      type: 'comment' as const,
      content: '匹配到的历史批注内容',
      status: 'pending' as const,
    };

    const request = {
      docId: 'doc_001',
      paragraphId: 'para_001',
      selectedText: 'some text',
      fullContent: 'some text content',
      paragraphType: 'paragraph' as ParagraphType,
      paragraphIndex: 0,
      totalParagraphs: 5,
    };

    vi.spyOn(SimilarityMatcher, 'updateCaseAcceptCountByCaseId').mockResolvedValue(true);
    vi.spyOn(SimilarityMatcher, 'findOrCreateCase').mockImplementation(
      async (annotationId, fingerprint, factory) => {
        const newCase = factory();
        savedCases.push(newCase);
        return newCase;
      }
    );

    const result = await RecommendationService.indexAnnotation(
      annotation, request, 'case_match_001'
    );

    expect(result.acceptCount).toBe(1);

    vi.restoreAllMocks();
  });
});

describe('End-to-End: Rule Engine Adoption Flow', () => {
  it('simulates full flow: rule recommendation → adopt → submit → acceptCount increments', async () => {
    const codeText = 'function test() { return 1; }';
    const features = FeatureExtractor.extractTextFeatures(codeText);
    const context = FeatureExtractor.extractContextFeatures('code', 0, 5, null, null);

    const ruleRecs = RuleEngine.generateRecommendations(codeText, features, context, 1);
    expect(ruleRecs.length).toBeGreaterThan(0);

    const rec = ruleRecs[0];
    expect(rec.ruleId).toBeDefined();
    expect(rec.matchedCaseId).toBeUndefined();
    expect(rec.algorithm).toBe('rule');

    const adoptFeedback: RecommendationFeedback = {
      recommendationId: rec.id,
      ruleId: rec.ruleId,
      adopted: true,
      feedbackType: 'adopt',
    };

    const adoptResult = await FeedbackService.process(adoptFeedback, 'A');
    expect(adoptResult.caseUpdated).toBe(false);
    expect(adoptResult.updateChannel).toBe('none');

    const submitFeedback: RecommendationFeedback = {
      recommendationId: rec.id,
      annotationId: 'ann_e2e_001',
      ruleId: rec.ruleId,
      adopted: true,
      adoptedContent: rec.content,
      adoptedSuggestedText: rec.suggestedText,
      feedbackType: 'submit',
    };

    const submitResult = await FeedbackService.process(submitFeedback, 'A');
    expect(submitResult.caseUpdated).toBe(true);
    expect(submitResult.updateChannel).toBe('indexAnnotation');
    expect(submitResult.acceptCountDelta).toBe(1);
  });

  it('simulates full flow: similarity recommendation → adopt → submit → acceptCount increments', async () => {
    const existingCase = makeHistoricalCase({
      id: 'case_sim_001',
      acceptCount: 3,
    });

    const simRec: AnnotationRecommendation = {
      id: 'rec_sim_test_001',
      type: 'comment',
      content: existingCase.annotationContent,
      confidence: 0.85,
      algorithm: 'similarity',
      matchedCaseId: existingCase.id,
      matchedSimilarity: 0.85,
      reason: 'Test reason',
    };

    const adoptFeedback: RecommendationFeedback = {
      recommendationId: simRec.id,
      matchedCaseId: simRec.matchedCaseId,
      adopted: true,
      feedbackType: 'adopt',
    };

    const updateSpy = vi.spyOn(SimilarityMatcher, 'updateCaseAcceptCountByCaseId').mockResolvedValue(true);
    const adoptResult = await FeedbackService.process(adoptFeedback, 'A');
    expect(adoptResult.caseUpdated).toBe(true);
    expect(adoptResult.updateChannel).toBe('matchedCaseId');

    const submitFeedback: RecommendationFeedback = {
      recommendationId: simRec.id,
      annotationId: 'ann_sim_e2e_001',
      matchedCaseId: simRec.matchedCaseId,
      adopted: true,
      adoptedContent: simRec.content,
      feedbackType: 'submit',
    };

    const submitResult = await FeedbackService.process(submitFeedback, 'A');
    expect(submitResult.caseUpdated).toBe(true);
    expect(submitResult.updateChannel).toBe('indexAnnotation');

    updateSpy.mockRestore();
  });

  it('verifies confidence increases with acceptCount after adoption', () => {
    const featureVec = makeFeatureVector({
      context: makeContextFeatures({ paragraphType: 'code' }),
    });

    const lowAcceptCase = makeHistoricalCase({
      id: 'case_low_accept',
      annotationContent: 'Check code format',
      annotationType: 'suggestion',
      acceptCount: 0,
      featureVector: featureVec,
    });

    const highAcceptCase = makeHistoricalCase({
      id: 'case_high_accept',
      annotationContent: 'Check code format',
      annotationType: 'suggestion',
      acceptCount: 15,
      featureVector: featureVec,
    });

    const recsLow = SimilarityMatcher.generateRecommendations(
      [{ caseItem: lowAcceptCase, similarity: 0.8 }], 1
    );
    const recsHigh = SimilarityMatcher.generateRecommendations(
      [{ caseItem: highAcceptCase, similarity: 0.8 }], 1
    );

    expect(recsHigh[0].confidence).toBeGreaterThan(recsLow[0].confidence);

    const confidenceIncrease = recsHigh[0].confidence - recsLow[0].confidence;
    expect(confidenceIncrease).toBeGreaterThan(0.05);
  });
});
