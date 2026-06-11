import { useEffect, useState } from 'react';
import {
  Lightbulb,
  Sparkles,
  Check,
  X,
  Eye,
  Code2,
  TrendingUp,
  BarChart3,
  Beaker,
} from 'lucide-react';
import type {
  AnnotationRecommendation,
  AnnotationType,
  RecommendationAlgorithm,
  ABTestVariant,
  RecommendationRequest,
  Paragraph,
} from '../types';
import { recommendationApi } from '../utils/api';

const algorithmLabel: Record<RecommendationAlgorithm, { label: string; icon: typeof Lightbulb; color: string }> = {
  similarity: { label: '相似匹配', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  rule: { label: '规则引擎', icon: Code2, color: 'text-sky-600 bg-sky-50' },
  hybrid: { label: '混合推荐', icon: Sparkles, color: 'text-violet-600 bg-violet-50' },
};

const typeLabel: Record<AnnotationType, { label: string; color: string }> = {
  comment: { label: '意见', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  suggestion: { label: '建议修改', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const confidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return 'bg-emerald-500';
  if (confidence >= 0.6) return 'bg-amber-500';
  return 'bg-slate-400';
};

const confidenceLabel = (confidence: number) => {
  if (confidence >= 0.8) return '高';
  if (confidence >= 0.6) return '中';
  return '低';
};

export interface RecommendationPanelProps {
  docId: string;
  selectedParagraph: Paragraph | null;
  selectedText: string | null;
  paragraphs: Paragraph[];
  sessionId: string;
  reviewerName: string;
  onAdopt: (rec: AnnotationRecommendation) => void;
  onClose?: () => void;
}

export function RecommendationPanel({
  docId,
  selectedParagraph,
  selectedText,
  paragraphs,
  sessionId,
  onAdopt,
  onClose,
}: RecommendationPanelProps) {
  const [recommendations, setRecommendations] = useState<AnnotationRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [variant, setVariant] = useState<ABTestVariant>('A');
  const [algorithm, setAlgorithm] = useState<RecommendationAlgorithm>('hybrid');
  const [, setLastReqId] = useState<string>('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedParagraph || (!selectedText && selectedParagraph.content.length < 10)) {
      setRecommendations([]);
      return;
    }

    let cancelled = false;
    const reqId = `${selectedParagraph.id}_${selectedText || 'full'}_${Date.now()}`;
    setLastReqId(reqId);

    const pIdx = paragraphs.findIndex((p) => p.id === selectedParagraph.id);
    const prev = pIdx > 0 ? { type: paragraphs[pIdx - 1].type, content: paragraphs[pIdx - 1].content } : null;
    const next = pIdx >= 0 && pIdx < paragraphs.length - 1 ? { type: paragraphs[pIdx + 1].type, content: paragraphs[pIdx + 1].content } : null;

    const request: RecommendationRequest = {
      docId,
      paragraphId: selectedParagraph.id,
      selectedText: selectedText || '',
      fullContent: selectedParagraph.content,
      paragraphType: selectedParagraph.type,
      paragraphIndex: pIdx >= 0 ? pIdx : 0,
      totalParagraphs: paragraphs.length,
      prevParagraph: prev as RecommendationRequest['prevParagraph'],
      nextParagraph: next as RecommendationRequest['nextParagraph'],
    };

    setLoading(true);

    recommendationApi
      .getRecommendations(request, sessionId)
      .then((result) => {
        if (cancelled) return;
        setRecommendations(result.recommendations.filter((r) => !dismissed.has(r.id)));
        setVariant(result.variant);
        setAlgorithm(result.algorithm);
      })
      .catch(() => {
        if (!cancelled) setRecommendations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docId, selectedParagraph, selectedText, paragraphs, sessionId, dismissed]);

  const handleDismiss = (rec: AnnotationRecommendation) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(rec.id);
    setDismissed(newDismissed);
    setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));

    recommendationApi.sendFeedback({
      recommendationId: rec.id,
      annotationId: '',
      adopted: false,
      variant,
    }).catch(() => {});
  };

  const handleAdopt = (rec: AnnotationRecommendation) => {
    recommendationApi.sendFeedback({
      recommendationId: rec.id,
      annotationId: '',
      adopted: true,
      variant,
    }).catch(() => {});
    onAdopt(rec);
  };

  const algoConfig = algorithmLabel[algorithm];
  const AlgoIcon = algoConfig.icon;

  if (!selectedParagraph) return null;

  const hasRecs = recommendations.length > 0;
  const shouldShow = hasRecs || loading;

  if (!shouldShow) return null;

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-slate-50 shadow-sm">
      <div className="flex items-center justify-between border-b border-violet-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">智能批注推荐</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center gap-1 rounded px-1.5 px-2 text-[10px] font-medium ${algoConfig.color}`}>
                <AlgoIcon size={10} />
                {algoConfig.label}
              </span>
              {variant && (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  <Beaker size={10} />
                  实验组 {variant}
                </span>
              )}
              {selectedText && (
                <span className="text-[10px] text-slate-500">基于选中文本</span>
              )}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="space-y-3 p-4">
        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
            <p className="text-sm text-slate-500">正在分析内容生成推荐...</p>
          </div>
        )}

        {!loading && recommendations.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Lightbulb size={18} />
            </div>
            <p className="text-sm font-medium text-slate-600">暂无匹配的推荐</p>
            <p className="text-xs text-slate-400">继续批注系统将自动学习您的偏好</p>
          </div>
        )}

        {!loading &&
          recommendations.map((rec, idx) => {
            const tc = typeLabel[rec.type];
            return (
              <div
                key={rec.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: confidenceColor(rec.confidence) }} />
                <div className="px-4 py-3 pl-5">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      <BarChart3 size={10} className="mr-1" />
                      #{idx + 1}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${tc.color}`}>
                      {tc.label}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <span
                        className={`h-2 w-2 rounded-full ${confidenceColor(rec.confidence)}`}
                        title={`置信度: ${(rec.confidence * 100).toFixed(0)}%`}
                      />
                      <span className="text-[11px] font-medium text-slate-600">
                        {confidenceLabel(rec.confidence)}置信度 {(rec.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <p className="mb-2 text-sm leading-relaxed text-slate-800">{rec.content}</p>

                  {rec.type === 'suggestion' && rec.suggestedText && selectedText && (
                    <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-slate-500">原选中文本</p>
                        <p className="text-sm text-red-700 line-through decoration-red-400">{selectedText}</p>
                      </div>
                    </div>
                  )}

                  {rec.type === 'suggestion' && rec.suggestedText && (
                    <div className="mb-3 rounded-lg bg-emerald-50/50 p-3">
                      <p className="mb-1 text-[11px] font-medium text-emerald-600">建议内容</p>
                      <p className="text-sm text-emerald-800">{rec.suggestedText}</p>
                    </div>
                  )}

                  <p className="mb-3 text-xs text-slate-500 flex items-start gap-1.5">
                    <Eye size={12} className="mt-0.5 flex-shrink-0" />
                    {rec.reason}
                  </p>

                  <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
                    <button
                      onClick={() => handleAdopt(rec)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
                    >
                      <Check size={13} />
                      采纳推荐
                    </button>
                    <button
                      onClick={() => handleDismiss(rec)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <X size={13} />
                      不适用
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
