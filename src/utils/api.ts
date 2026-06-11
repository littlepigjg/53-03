import type {
  DocumentMeta,
  ParsedDocument,
  Annotation,
  ReviewSummary,
  AnnotationStatus,
  AnnotationRecommendation,
  RecommendationRequest,
  RecommendationFeedback,
  ABTestConfig,
  ABTestMetrics,
  RecommendationAlgorithm,
  ABTestVariant,
} from '../types';

const API_BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const documentsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: form,
    }).then((r) => r.json() as Promise<DocumentMeta>);
  },
  list: () => request<DocumentMeta[]>('/documents'),
  get: (id: string) => request<DocumentMeta>(`/documents/${id}`),
  remove: (id: string) =>
    request<{ ok: true }>(`/documents/${id}`, { method: 'DELETE' }),
  getParsed: (id: string) => request<ParsedDocument>(`/documents/${id}/parsed`),
  createShare: (id: string) =>
    request<{ shareToken: string }>(`/documents/${id}/share`, { method: 'POST' }),
};

export const shareApi = {
  getReviewData: (token: string) =>
    request<{ document: DocumentMeta; parsed: ParsedDocument; annotations: Annotation[] }>(`/share/${token}`),
};

export const annotationsApi = {
  create: (data: {
    documentId: string;
    paragraphId: string;
    type: 'comment' | 'suggestion';
    reviewerName: string;
    reviewerEmail?: string;
    content: string;
    suggestedText?: string;
    originalText?: string;
    recommendedBy?: RecommendationAlgorithm;
    recommendationId?: string;
  }) => request<Annotation>('/annotations', { method: 'POST', body: JSON.stringify(data) }),
  list: (docId: string) => request<Annotation[]>(`/annotations/${docId}`),
  updateStatus: (id: string, status: AnnotationStatus, ownerNote?: string) =>
    request<Annotation>(`/annotations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ownerNote }),
    }),
  remove: (id: string) =>
    request<{ ok: true }>(`/annotations/${id}`, { method: 'DELETE' }),
};

export const reviewApi = {
  summary: (docId: string) => request<ReviewSummary>(`/review/${docId}/summary`),
};

export const exportApi = {
  markdown: (docId: string) =>
    fetch(`${API_BASE}/export/${docId}`).then(async (r) => ({
      filename:
        r.headers.get('Content-Disposition')?.match(/filename="?([^"]+)/)?.[1] ||
        'document.md',
      text: await r.text(),
    })),
};

export const recommendationApi = {
  getRecommendations: (
    req: RecommendationRequest,
    sessionId: string
  ) =>
    request<{
      recommendations: AnnotationRecommendation[];
      variant: ABTestVariant;
      algorithm: RecommendationAlgorithm;
    }>('/recommendation/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...req, sessionId }),
    }),
  sendFeedback: (data: RecommendationFeedback & { variant: ABTestVariant }) =>
    request<{ ok: boolean }>('/recommendation/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  indexAnnotation: (data: {
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
  }) =>
    request<unknown>('/recommendation/index', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStats: () =>
    request<{
      caseCount: number;
      metrics: { A: ABTestMetrics; B: ABTestMetrics };
      config: ABTestConfig;
    }>('/recommendation/stats'),
  getABTestConfig: () => request<ABTestConfig>('/recommendation/abtest/config'),
  setABTestConfig: (config: Partial<ABTestConfig>) =>
    request<ABTestConfig>('/recommendation/abtest/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getABTestMetrics: () =>
    request<{ A: ABTestMetrics; B: ABTestMetrics }>('/recommendation/abtest/metrics'),
  resetABTestMetrics: () =>
    request<{ ok: boolean }>('/recommendation/abtest/reset', { method: 'POST' }),
};
