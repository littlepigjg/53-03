import { Router } from 'express';
import { RecommendationService } from '../services/recommendation/RecommendationService.js';
import { ABTestService } from '../services/recommendation/ABTestService.js';
import { FeedbackService } from '../services/recommendation/FeedbackService.js';
import type {
  RecommendationRequest,
  RecommendationFeedback,
  ABTestConfig,
} from '../../shared/types.js';

const router = Router();

router.post('/recommend', async (req, res, next) => {
  try {
    const body = req.body as RecommendationRequest & { sessionId?: string };
    if (!body.docId || !body.paragraphId) {
      return res.status(400).json({ error: 'Missing docId or paragraphId' });
    }
    const sessionId = body.sessionId || (req.headers['x-session-id'] as string) || `anon_${Date.now()}`;
    const result = await RecommendationService.getRecommendations(body, sessionId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/feedback', async (req, res, next) => {
  try {
    const body = req.body as RecommendationFeedback & { variant: 'A' | 'B' };
    if (!body.recommendationId) {
      return res.status(400).json({ error: 'Missing recommendationId' });
    }
    const variant = body.variant || 'A';
    const processed = await FeedbackService.process(body, variant);
    res.json({
      ok: true,
      caseUpdated: processed.caseUpdated,
      updatedCaseId: processed.updatedCaseId,
      acceptCountDelta: processed.acceptCountDelta,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/index', async (req, res, next) => {
  try {
    const body = req.body as {
      annotation: {
        id: string;
        docId: string;
        paragraphId: string;
        type: 'comment' | 'suggestion';
        content: string;
        suggestedText?: string;
        originalText?: string;
        status: 'pending' | 'accepted' | 'rejected';
      };
      request: RecommendationRequest;
      matchedCaseId?: string;
      ruleId?: string;
    };
    if (!body.annotation || !body.request) {
      return res.status(400).json({ error: 'Missing annotation or request' });
    }
    const caseItem = await RecommendationService.indexAnnotation(
      body.annotation,
      body.request,
      body.matchedCaseId,
      body.ruleId
    );
    res.json(caseItem);
  } catch (e) {
    next(e);
  }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const caseCount = await RecommendationService.getHistoricalCasesCount();
    const metrics = await ABTestService.getMetrics();
    const config = await ABTestService.getConfig();
    const feedbackStats = await FeedbackService.getFeedbackStats();
    res.json({ caseCount, metrics, config, feedbackStats });
  } catch (e) {
    next(e);
  }
});

router.get('/feedback/stats', async (_req, res, next) => {
  try {
    const stats = await FeedbackService.getFeedbackStats();
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

router.get('/abtest/config', async (_req, res, next) => {
  try {
    const config = await ABTestService.getConfig();
    res.json(config);
  } catch (e) {
    next(e);
  }
});

router.put('/abtest/config', async (req, res, next) => {
  try {
    const body = req.body as Partial<ABTestConfig>;
    const current = await ABTestService.getConfig();
    const merged: ABTestConfig = { ...current, ...body };
    const config = await ABTestService.setConfig(merged);
    res.json(config);
  } catch (e) {
    next(e);
  }
});

router.get('/abtest/metrics', async (_req, res, next) => {
  try {
    const metrics = await ABTestService.getMetrics();
    res.json(metrics);
  } catch (e) {
    next(e);
  }
});

router.post('/abtest/reset', async (_req, res, next) => {
  try {
    await ABTestService.resetMetrics();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
