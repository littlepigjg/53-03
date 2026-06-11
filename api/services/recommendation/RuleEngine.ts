import type {
  TextFeatures,
  ContextFeatures,
  AnnotationRecommendation,
} from '../../../shared/types.js';

interface RuleMatch {
  id: string;
  name: string;
  priority: number;
  confidence: number;
  build: () => Omit<AnnotationRecommendation, 'id' | 'confidence' | 'algorithm'>;
}

export class RuleEngine {
  private static rules: RuleMatch[] = [];

  static getRules(
    text: string,
    features: TextFeatures,
    context: ContextFeatures
  ): RuleMatch[] {
    const matches: RuleMatch[] = [];

    if (this.matchCodePattern(text, features, context)) {
      matches.push({
        id: 'rule_code_format',
        name: '代码格式规范',
        priority: 100,
        confidence: 0.85,
        build: () => ({
          type: 'suggestion',
          content: '建议检查代码格式规范，使用一致的缩进、命名风格和注释格式。代码风格统一有助于团队协作和后期维护。',
          suggestedText: this.formatCodeSuggestion(text),
          reason: '检测到代码片段特征，匹配格式规范规则',
        }),
      });
    }

    if (this.matchNumberPattern(text, features, context)) {
      matches.push({
        id: 'rule_number_accuracy',
        name: '数据准确性验证',
        priority: 95,
        confidence: 0.8,
        build: () => ({
          type: 'comment',
          content: '检测到文中包含数字/统计数据，建议核对数据来源和准确性，确保数字表述无误后再定稿。可标注数据出处或引用来源。',
          reason: '检测到数字/金额/百分比模式，匹配数据验证规则',
        }),
      });
    }

    if (this.matchDatePattern(text, features, context)) {
      matches.push({
        id: 'rule_date_validity',
        name: '日期时效性检查',
        priority: 90,
        confidence: 0.75,
        build: () => ({
          type: 'comment',
          content: '检测到文中包含日期信息，建议确认日期是否已过期或需要更新。如涉及项目里程碑、合同期限等关键日期请特别关注。',
          reason: '检测到日期模式，匹配时效性检查规则',
        }),
      });
    }

    if (this.matchUrlPattern(text, features, context)) {
      matches.push({
        id: 'rule_url_alive',
        name: '链接可访问性验证',
        priority: 85,
        confidence: 0.7,
        build: () => ({
          type: 'comment',
          content: '检测到文中包含外部链接，建议确认链接可正常访问且内容准确有效。链接失效会影响文档质量和用户体验。',
          reason: '检测到 URL 链接，匹配链接验证规则',
        }),
      });
    }

    if (this.matchEmailPattern(text, features, context)) {
      matches.push({
        id: 'rule_email_valid',
        name: '邮箱地址验证',
        priority: 80,
        confidence: 0.65,
        build: () => ({
          type: 'comment',
          content: '检测到文中包含邮箱地址，建议确认邮箱格式正确且为有效联系方式。重要文档中的联系方式应经过核实。',
          reason: '检测到邮箱地址，匹配邮箱验证规则',
        }),
      });
    }

    if (this.matchHeadingPattern(text, features, context)) {
      matches.push({
        id: 'rule_heading_hierarchy',
        name: '标题层级检查',
        priority: 75,
        confidence: 0.7,
        build: () => ({
          type: 'comment',
          content: '建议检查标题层级是否正确，H1-H6 应按逻辑顺序递进使用，避免跳过层级（如 H1 直接跳到 H3），保持文档结构清晰。',
          reason: '检测到标题段落，匹配标题层级规则',
        }),
      });
    }

    if (this.matchTodoPattern(text, features, context)) {
      matches.push({
        id: 'rule_todo_resolve',
        name: '待办事项处理',
        priority: 88,
        confidence: 0.9,
        build: () => ({
          type: 'suggestion',
          content: '检测到待办标记（TODO/FIXME/HACK/BUG 等），建议在发布前确认这些待办事项已处理，如无需保留请移除相关标记。',
          suggestedText: text.replace(/TODO|FIXME|HACK|BUG|NOTE|XXX/gi, '').replace(/\s+/g, ' ').trim(),
          reason: '检测到 TODO/FIXME 等待办标记，匹配待办处理规则',
        }),
      });
    }

    if (this.matchLongParagraph(text, features, context)) {
      matches.push({
        id: 'rule_long_readability',
        name: '长段落可读性优化',
        priority: 70,
        confidence: 0.6,
        build: () => ({
          type: 'comment',
          content: '该段落内容较长，建议考虑拆分为多个短段落或使用列表/小标题组织内容，以提升可读性和用户阅读体验。',
          reason: '检测到长段落（>300字），匹配可读性优化规则',
        }),
      });
    }

    if (this.matchTablePattern(context)) {
      matches.push({
        id: 'rule_table_consistency',
        name: '表格数据一致性',
        priority: 78,
        confidence: 0.72,
        build: () => ({
          type: 'comment',
          content: '检测到表格内容，建议检查表格数据的一致性：行列对齐是否正确、表头与数据是否匹配、合计/汇总数字是否准确。',
          reason: '检测到表格段落类型，匹配表格一致性规则',
        }),
      });
    }

    if (this.matchEnglishMixed(text, features, context)) {
      matches.push({
        id: 'rule_english_consistency',
        name: '中英文混排规范',
        priority: 65,
        confidence: 0.58,
        build: () => ({
          type: 'comment',
          content: '检测到中英文混排内容，建议遵循规范：英文与中文之间加空格、专有名词大小写一致、英文标点在英文语境下使用。',
          reason: '检测到中英文混合特征，匹配混排规范规则',
        }),
      });
    }

    matches.sort((a, b) => b.priority - a.priority);
    return matches;
  }

  static generateRecommendations(
    text: string,
    features: TextFeatures,
    context: ContextFeatures,
    maxResults: number = 3
  ): AnnotationRecommendation[] {
    const rules = this.getRules(text, features, context);
    return rules.slice(0, maxResults).map((rule) => {
      const built = rule.build();
      return {
        id: `rec_rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        confidence: rule.confidence,
        algorithm: 'rule',
        ruleId: rule.id,
        ...built,
      };
    });
  }

  private static matchCodePattern(_t: string, f: TextFeatures, c: ContextFeatures): boolean {
    return (
      c.paragraphType === 'code' ||
      f.hasCodeBlock ||
      f.codeRatio > 0.08 ||
      c.inCodeSection
    );
  }

  private static matchNumberPattern(_t: string, f: TextFeatures, c: ContextFeatures | undefined): boolean {
    void c;
    return f.hasNumberPattern || f.digitRatio > 0.06;
  }

  private static matchDatePattern(_t: string, f: TextFeatures, c: ContextFeatures | undefined): boolean {
    void c;
    return f.hasDatePattern;
  }

  private static matchUrlPattern(_t: string, f: TextFeatures, c: ContextFeatures | undefined): boolean {
    void c;
    return f.hasUrl;
  }

  private static matchEmailPattern(_t: string, f: TextFeatures, c: ContextFeatures | undefined): boolean {
    void c;
    return f.hasEmail;
  }

  private static matchHeadingPattern(_t: string, f: TextFeatures | undefined, c: ContextFeatures): boolean {
    void f;
    return c.paragraphType === 'heading';
  }

  private static matchTodoPattern(t: string, f: TextFeatures | undefined, c: ContextFeatures | undefined): boolean {
    void f;
    void c;
    return /TODO|FIXME|HACK|BUG|NOTE|XXX/i.test(t);
  }

  private static matchLongParagraph(t: string, f: TextFeatures, c: ContextFeatures): boolean {
    return c.paragraphType === 'paragraph' && (f.charCount > 300 || t.length > 300);
  }

  private static matchTablePattern(c: ContextFeatures): boolean {
    return c.paragraphType === 'table';
  }

  private static matchEnglishMixed(_t: string, f: TextFeatures, c: ContextFeatures): boolean {
    return (
      c.paragraphType === 'paragraph' &&
      f.chineseRatio > 0.1 &&
      f.englishRatio > 0.1
    );
  }

  private static formatCodeSuggestion(original: string): string {
    let formatted = original.replace(/\t/g, '  ');
    formatted = formatted.replace(/\s+$/gm, '');
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    return formatted.trim();
  }
}
