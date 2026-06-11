export type FileType = 'markdown' | 'docx';
export type ParagraphType = 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'table';
export type AnnotationType = 'comment' | 'suggestion';
export type AnnotationStatus = 'pending' | 'accepted' | 'rejected';
export type RecommendationAlgorithm = 'similarity' | 'rule' | 'hybrid';
export type ABTestVariant = 'A' | 'B';

export interface DocumentMeta {
  id: string;
  title: string;
  originalFileName: string;
  fileType: FileType;
  createdAt: string;
  updatedAt: string;
  shareToken?: string;
  sharePassword?: string | null;
  shareExpiresAt?: string | null;
  annotationCount: number;
  reviewerCount: number;
}

export interface Paragraph {
  id: string;
  index: number;
  type: ParagraphType;
  level?: number;
  content: string;
  rawHtml?: string;
}

export interface ParsedDocument {
  docId: string;
  paragraphs: Paragraph[];
}

export interface Annotation {
  id: string;
  docId: string;
  paragraphId: string;
  type: AnnotationType;
  reviewerName: string;
  reviewerEmail?: string;
  content: string;
  suggestedText?: string;
  originalText?: string;
  status: AnnotationStatus;
  ownerNote?: string;
  createdAt: string;
  updatedAt: string;
  recommendedBy?: RecommendationAlgorithm;
  recommendationId?: string;
}

export interface ReviewSummary {
  docId: string;
  totalAnnotations: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  commentCount: number;
  suggestionCount: number;
  byReviewer: { name: string; count: number }[];
  byParagraph: { paragraphId: string; count: number }[];
}

export interface TextFeatures {
  charCount: number;
  wordCount: number;
  digitRatio: number;
  codeRatio: number;
  punctuationRatio: number;
  chineseRatio: number;
  englishRatio: number;
  uppercaseRatio: number;
  hasCodeBlock: boolean;
  hasUrl: boolean;
  hasEmail: boolean;
  hasDatePattern: boolean;
  hasNumberPattern: boolean;
  keywordVector: number[];
}

export interface ContextFeatures {
  paragraphType: ParagraphType;
  prevParagraphType?: ParagraphType;
  nextParagraphType?: ParagraphType;
  paragraphIndex: number;
  totalParagraphs: number;
  inHeadingSection: boolean;
  inCodeSection: boolean;
  prevContent?: string;
  nextContent?: string;
}

export interface FeatureVector {
  text: TextFeatures;
  context: ContextFeatures;
  combined: number[];
}

export interface HistoricalCase {
  id: string;
  annotationId: string;
  annotationType: AnnotationType;
  annotationContent: string;
  suggestedText?: string;
  originalText?: string;
  featureVector: FeatureVector;
  selectedText: string;
  paragraphType: ParagraphType;
  status: AnnotationStatus;
  acceptCount: number;
  createdAt: string;
  docId: string;
  ruleId?: string;
}

export interface AnnotationRecommendation {
  id: string;
  type: AnnotationType;
  content: string;
  suggestedText?: string;
  confidence: number;
  algorithm: RecommendationAlgorithm;
  matchedCaseId?: string;
  matchedSimilarity?: number;
  ruleId?: string;
  reason: string;
}

export interface RecommendationRequest {
  docId: string;
  paragraphId: string;
  selectedText: string;
  fullContent: string;
  paragraphType: ParagraphType;
  paragraphIndex: number;
  totalParagraphs: number;
  prevParagraph?: { type: ParagraphType; content: string } | null;
  nextParagraph?: { type: ParagraphType; content: string } | null;
}

export interface RecommendationFeedback {
  recommendationId: string;
  annotationId?: string;
  matchedCaseId?: string;
  ruleId?: string;
  adopted: boolean;
  adoptedContent?: string;
  adoptedSuggestedText?: string;
  feedbackType: 'adopt' | 'dismiss' | 'submit';
}

export interface ABTestConfig {
  enabled: boolean;
  variantA: RecommendationAlgorithm;
  variantB: RecommendationAlgorithm;
  trafficSplit: number;
}

export interface ABTestMetrics {
  variant: ABTestVariant;
  algorithm: RecommendationAlgorithm;
  totalRecommendations: number;
  adoptedCount: number;
  adoptionRate: number;
  avgConfidence: number;
}

export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  priority: number;
  match: (text: string, features: TextFeatures, context: ContextFeatures) => boolean;
  recommendation: Omit<AnnotationRecommendation, 'id' | 'confidence' | 'algorithm' | 'reason'> & { reason: string };
}
