import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Wand2, User, Mail, Send, X, Sparkles, RefreshCw } from 'lucide-react';
import type { Annotation, Paragraph, AnnotationType, AnnotationRecommendation, RecommendationRequest } from '../types';
import { AnnotationCard } from './AnnotationCard';
import { RecommendationPanel } from './RecommendationPanel';
import { useReviewStore } from '../store/reviewStore';
import { annotationsApi, recommendationApi } from '../utils/api';

interface ReviewPanelProps {
  paragraphs: Paragraph[];
  annotations: Annotation[];
  selectedText?: string | null;
}

function generateSessionId(): string {
  try {
    let sid = localStorage.getItem('review_session_id');
    if (!sid) {
      sid = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('review_session_id', sid);
    }
    return sid;
  } catch {
    return `sess_${Date.now().toString(36)}`;
  }
}

export function ReviewPanel({ paragraphs, annotations, selectedText }: ReviewPanelProps) {
  const selectedId = useReviewStore((s) => s.selectedParagraphId);
  const reviewerName = useReviewStore((s) => s.reviewerName);
  const reviewerEmail = useReviewStore((s) => s.reviewerEmail);
  const setReviewerName = useReviewStore((s) => s.setReviewerName);
  const setReviewerEmail = useReviewStore((s) => s.setReviewerEmail);
  const addAnnotation = useReviewStore((s) => s.addAnnotation);
  const document = useReviewStore((s) => s.document);

  const selectedParagraph = useMemo(
    () => paragraphs.find((p) => p.id === selectedId) || null,
    [paragraphs, selectedId]
  );

  const paragraphAnnotations = useMemo(
    () => annotations.filter((a) => a.paragraphId === selectedId),
    [annotations, selectedId]
  );

  const [type, setType] = useState<AnnotationType>('comment');
  const [content, setContent] = useState('');
  const [suggestedText, setSuggestedText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessionId] = useState(() => generateSessionId());
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [lastRecommendation, setLastRecommendation] = useState<AnnotationRecommendation | null>(null);

  useEffect(() => {
    if (selectedText) {
      setOriginalText(selectedText);
    }
  }, [selectedText]);

  const handleAdoptRecommendation = (rec: AnnotationRecommendation) => {
    setType(rec.type);
    setContent(rec.content);
    if (rec.type === 'suggestion' && rec.suggestedText) {
      setSuggestedText(rec.suggestedText);
      if (!originalText && selectedText) {
        setOriginalText(selectedText);
      }
    }
    setLastRecommendation(rec);
  };

  const buildIndexRequest = (): RecommendationRequest | null => {
    if (!selectedParagraph || !document) return null;
    const pIdx = paragraphs.findIndex((p) => p.id === selectedParagraph.id);
    const prev = pIdx > 0 ? { type: paragraphs[pIdx - 1].type, content: paragraphs[pIdx - 1].content } : null;
    const next = pIdx >= 0 && pIdx < paragraphs.length - 1 ? { type: paragraphs[pIdx + 1].type, content: paragraphs[pIdx + 1].content } : null;
    return {
      docId: document.id,
      paragraphId: selectedParagraph.id,
      selectedText: originalText || selectedText || '',
      fullContent: selectedParagraph.content,
      paragraphType: selectedParagraph.type,
      paragraphIndex: pIdx >= 0 ? pIdx : 0,
      totalParagraphs: paragraphs.length,
      prevParagraph: prev as RecommendationRequest['prevParagraph'],
      nextParagraph: next as RecommendationRequest['nextParagraph'],
    };
  };

  const submit = async () => {
    if (!reviewerName.trim()) {
      alert('请输入您的姓名');
      return;
    }
    if (!content.trim()) {
      alert('请输入批注内容');
      return;
    }
    if (!selectedParagraph) return;
    if (type === 'suggestion' && !suggestedText.trim()) {
      alert('建议修改请填写建议内容');
      return;
    }
    setSubmitting(true);
    try {
      const docId = document?.id;
      if (!docId) return;
      const ann = await annotationsApi.create({
        documentId: docId,
        paragraphId: selectedParagraph.id,
        type,
        reviewerName: reviewerName.trim(),
        reviewerEmail: reviewerEmail.trim() || undefined,
        content: content.trim(),
        suggestedText: type === 'suggestion' ? suggestedText.trim() : undefined,
        originalText: originalText.trim() || undefined,
        recommendedBy: lastRecommendation?.algorithm,
        recommendationId: lastRecommendation?.id,
      });
      addAnnotation(ann);

      const req = buildIndexRequest();
      if (req) {
        recommendationApi.indexAnnotation({
          annotation: ann,
          request: req,
        }).catch(() => {});
      }

      setContent('');
      setSuggestedText('');
      setOriginalText('');
      setLastRecommendation(null);
    } catch (e) {
      alert((e as Error).message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">审阅面板</h3>
            <p className="mt-0.5 text-xs text-slate-500">点击左侧文档段落添加批注</p>
          </div>
          <button
            onClick={() => setShowRecommendations((s) => !s)}
            title={showRecommendations ? '隐藏推荐' : '显示推荐'}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              showRecommendations
                ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Sparkles size={13} className="inline mr-1" />
            AI推荐{showRecommendations ? '开' : '关'}
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50/60 px-5 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              <User size={12} className="mr-1 inline align-text-bottom" />
              姓名 *
            </label>
            <input
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="您的姓名"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#1e3a5f] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              <Mail size={12} className="mr-1 inline align-text-bottom" />
              邮箱（可选）
            </label>
            <input
              value={reviewerEmail}
              onChange={(e) => setReviewerEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#1e3a5f] focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedParagraph ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
            <div>
              <MessageSquare size={28} strokeWidth={1.2} className="mx-auto mb-2 text-slate-300" />
              请选择左侧文档中的段落
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {showRecommendations && document && (
              <RecommendationPanel
                docId={document.id}
                selectedParagraph={selectedParagraph}
                selectedText={selectedText || null}
                paragraphs={paragraphs}
                sessionId={sessionId}
                reviewerName={reviewerName}
                onAdopt={handleAdoptRecommendation}
              />
            )}

            <div>
              <div className="mb-4 rounded-lg bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">当前段落</p>
                  <button
                    onClick={() => {
                      setContent('');
                      setSuggestedText('');
                      setOriginalText(selectedText || '');
                      setLastRecommendation(null);
                      setType('comment');
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> 重置表单
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-slate-700 line-clamp-3">
                  {selectedParagraph.content}
                </p>
              </div>

              {lastRecommendation && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                  <Sparkles size={12} />
                  已采纳推荐，可直接编辑后提交
                  <button
                    onClick={() => setLastRecommendation(null)}
                    className="ml-auto text-violet-500 hover:text-violet-700"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="mb-4">
                <div className="mb-2 inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    onClick={() => setType('comment')}
                    className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      type === 'comment'
                        ? 'bg-white text-[#1e3a5f] shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <MessageSquare size={12} /> 意见
                  </button>
                  <button
                    onClick={() => setType('suggestion')}
                    className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      type === 'suggestion'
                        ? 'bg-white text-amber-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Wand2 size={12} /> 建议修改
                  </button>
                </div>

                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={type === 'comment' ? '输入您的意见…' : '描述您的修改建议…'}
                  className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
                  rows={3}
                />

                {type === 'suggestion' && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        原文片段（可选）
                      </label>
                      <input
                        value={originalText}
                        onChange={(e) => setOriginalText(e.target.value)}
                        placeholder="选择段落中要修改的原文，方便精确定位"
                        className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-[#1e3a5f] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-emerald-600">
                        建议修改为 *
                      </label>
                      <textarea
                        value={suggestedText}
                        onChange={(e) => setSuggestedText(e.target.value)}
                        placeholder="填写您建议修改后的完整内容"
                        className="w-full resize-none rounded-md border border-emerald-200 bg-emerald-50/30 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={submit}
                  disabled={submitting}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e4e7a] disabled:opacity-60"
                >
                  <Send size={14} />
                  {submitting ? '提交中…' : '提交批注'}
                </button>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500">
                  <MessageSquare size={12} />
                  该段落批注 ({paragraphAnnotations.length})
                </div>
                {paragraphAnnotations.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                    暂无批注，成为第一位审阅者
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {paragraphAnnotations
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((a) => (
                        <AnnotationCard key={a.id} annotation={a} />
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
