import type {
  TextFeatures,
  ContextFeatures,
  FeatureVector,
  ParagraphType,
  RecommendationRequest,
} from '../../../shared/types.js';

const KEYWORDS = [
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'class',
  'import', 'export', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this',
  '错误', '问题', '建议', '修改', '注意', '确认', '检查', '验证', '测试', '优化',
  '性能', '安全', '规范', '格式', '代码', '文档', '数据', '配置', '接口', '参数',
  'TODO', 'FIXME', 'HACK', 'BUG', 'NOTE', 'XXX',
  'http', 'https', 'www', '.com', '.cn', '.org',
  '@', 'email', '邮箱',
  '年', '月', '日', '2024', '2025', '2026',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  '￥', '$', '%', '元', '万', '亿',
];

const PARAGRAPH_TYPE_VECTOR: Record<ParagraphType, number[]> = {
  heading: [1, 0, 0, 0, 0, 0],
  paragraph: [0, 1, 0, 0, 0, 0],
  list: [0, 0, 1, 0, 0, 0],
  code: [0, 0, 0, 1, 0, 0],
  quote: [0, 0, 0, 0, 1, 0],
  table: [0, 0, 0, 0, 0, 1],
};

export class FeatureExtractor {
  static extractTextFeatures(text: string): TextFeatures {
    const cleanText = text || '';
    const charCount = cleanText.length;
    const wordCount = this.countWords(cleanText);

    const digits = (cleanText.match(/\d/g) || []).length;
    const codeChars = (cleanText.match(/[{}[\]();=<>+\-*/&|!@#$%^~`\\]/g) || []).length;
    const punctuations = (cleanText.match(/[，。！？、；：""''「」『』（）《》【】,.!?;:"'()<>[\]]/g) || []).length;
    const chinese = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const english = (cleanText.match(/[a-zA-Z]/g) || []).length;
    const uppercase = (cleanText.match(/[A-Z]/g) || []).length;

    return {
      charCount,
      wordCount,
      digitRatio: charCount > 0 ? digits / charCount : 0,
      codeRatio: charCount > 0 ? codeChars / charCount : 0,
      punctuationRatio: charCount > 0 ? punctuations / charCount : 0,
      chineseRatio: charCount > 0 ? chinese / charCount : 0,
      englishRatio: charCount > 0 ? english / charCount : 0,
      uppercaseRatio: charCount > 0 ? uppercase / charCount : 0,
      hasCodeBlock: /```[\s\S]*?```|<code[\s\S]*?<\/code>|^\s*(const|let|var|function|class|if|for|while|return|import|export)\s/m.test(cleanText),
      hasUrl: /https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+/i.test(cleanText),
      hasEmail: /[\w.-]+@[\w.-]+\.\w+/i.test(cleanText),
      hasDatePattern: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}[月/-]\d{1,2}[日号]?/.test(cleanText),
      hasNumberPattern: /[\d,，]+(\.\d+)?[%％元$￥万]|\d+\s*(个|人|次|天|小时|分钟|秒)/.test(cleanText),
      keywordVector: this.extractKeywordVector(cleanText),
    };
  }

  static extractContextFeatures(
    paragraphType: ParagraphType,
    paragraphIndex: number,
    totalParagraphs: number,
    prevParagraph?: { type: ParagraphType; content: string } | null,
    nextParagraph?: { type: ParagraphType; content: string } | null
  ): ContextFeatures {
    return {
      paragraphType,
      prevParagraphType: prevParagraph?.type,
      nextParagraphType: nextParagraph?.type,
      paragraphIndex,
      totalParagraphs,
      inHeadingSection: prevParagraph?.type === 'heading' || paragraphType === 'heading',
      inCodeSection: prevParagraph?.type === 'code' || paragraphType === 'code' || nextParagraph?.type === 'code',
      prevContent: prevParagraph?.content,
      nextContent: nextParagraph?.content,
    };
  }

  static buildCombinedVector(textFeatures: TextFeatures, contextFeatures: ContextFeatures): number[] {
    const textBasic = [
      this.normalize(textFeatures.charCount, 0, 5000),
      this.normalize(textFeatures.wordCount, 0, 1000),
      textFeatures.digitRatio,
      textFeatures.codeRatio,
      textFeatures.punctuationRatio,
      textFeatures.chineseRatio,
      textFeatures.englishRatio,
      textFeatures.uppercaseRatio,
      textFeatures.hasCodeBlock ? 1 : 0,
      textFeatures.hasUrl ? 1 : 0,
      textFeatures.hasEmail ? 1 : 0,
      textFeatures.hasDatePattern ? 1 : 0,
      textFeatures.hasNumberPattern ? 1 : 0,
    ];

    const typeVec = PARAGRAPH_TYPE_VECTOR[contextFeatures.paragraphType] || [0, 0, 0, 0, 0, 0];
    const prevTypeVec = contextFeatures.prevParagraphType
      ? PARAGRAPH_TYPE_VECTOR[contextFeatures.prevParagraphType]
      : [0, 0, 0, 0, 0, 0];
    const nextTypeVec = contextFeatures.nextParagraphType
      ? PARAGRAPH_TYPE_VECTOR[contextFeatures.nextParagraphType]
      : [0, 0, 0, 0, 0, 0];

    const contextBasic = [
      contextFeatures.totalParagraphs > 0 ? contextFeatures.paragraphIndex / contextFeatures.totalParagraphs : 0,
      contextFeatures.inHeadingSection ? 1 : 0,
      contextFeatures.inCodeSection ? 1 : 0,
    ];

    return [
      ...textBasic,
      ...typeVec,
      ...prevTypeVec,
      ...nextTypeVec,
      ...contextBasic,
      ...textFeatures.keywordVector,
    ];
  }

  static extractFromRequest(req: RecommendationRequest): FeatureVector {
    const targetText = req.selectedText || req.fullContent;
    const textFeatures = this.extractTextFeatures(targetText);
    const contextFeatures = this.extractContextFeatures(
      req.paragraphType,
      req.paragraphIndex,
      req.totalParagraphs,
      req.prevParagraph,
      req.nextParagraph
    );
    const combined = this.buildCombinedVector(textFeatures, contextFeatures);
    return { text: textFeatures, context: contextFeatures, combined };
  }

  private static countWords(text: string): number {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const numbers = (text.match(/\d+/g) || []).length;
    return chineseChars + englishWords + numbers;
  }

  private static extractKeywordVector(text: string): number[] {
    const lowerText = text.toLowerCase();
    return KEYWORDS.map((kw) => {
      const count = (lowerText.match(new RegExp(this.escapeRegex(kw.toLowerCase()), 'g')) || []).length;
      return Math.min(count / 5, 1);
    });
  }

  private static normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
