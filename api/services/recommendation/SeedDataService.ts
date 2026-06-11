import type { HistoricalCase, ParagraphType, AnnotationType } from '../../../shared/types.js';
import { FeatureExtractor } from './FeatureExtractor.js';
import { SimilarityMatcher } from './SimilarityMatcher.js';

interface SeedCaseTemplate {
  selectedText: string;
  paragraphType: ParagraphType;
  annotationType: AnnotationType;
  annotationContent: string;
  suggestedText?: string;
  originalText?: string;
  status: 'accepted';
  acceptCount: number;
}

const SEED_TEMPLATES: SeedCaseTemplate[] = [
  {
    selectedText: 'function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }',
    paragraphType: 'code',
    annotationType: 'suggestion',
    annotationContent: '建议为代码添加类型注解和输入参数校验，提升代码的健壮性和可维护性。复杂计算逻辑应添加注释说明。',
    suggestedText: 'function calculateTotal(items: Array<{price: number}>): number {\n  if (!Array.isArray(items)) return 0;\n  // 计算商品总价，过滤无效价格\n  return items.reduce((sum, item) => {\n    const price = typeof item?.price === \'number\' ? item.price : 0;\n    return sum + Math.max(0, price);\n  }, 0);\n}',
    originalText: 'function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }',
    status: 'accepted',
    acceptCount: 5,
  },
  {
    selectedText: 'const data = await fetch(url); const result = data.json();',
    paragraphType: 'code',
    annotationType: 'comment',
    annotationContent: '建议添加错误处理机制：1) fetch 请求需要 try-catch 包裹；2) 检查 HTTP 响应状态码；3) 处理解析 JSON 可能失败的情况。网络请求失败时应有降级策略或用户友好提示。',
    status: 'accepted',
    acceptCount: 8,
  },
  {
    selectedText: '项目总预算为 1500000 元，预计完成时间 90 天。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '建议核实预算金额和工期的准确性：1) 150万预算是否包含所有成本项（人力、设备、外包、风险预备金等）；2) 90天工期是否考虑了节假日、风险缓冲、验收环节；3) 关键数据建议附上计算依据或引用来源。',
    status: 'accepted',
    acceptCount: 12,
  },
  {
    selectedText: '根据统计数据显示，转化率提升了 35.6%，用户增长达到 120 万。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '检测到重要统计数据，建议确认：1) 数据来源及统计口径是否标注清楚；2) 35.6% 的转化率提升与哪个基准期对比（环比/同比）；3) 120万用户是累计、新增还是活跃用户；4) 关键数据建议保留溯源链接或出处。',
    status: 'accepted',
    acceptCount: 10,
  },
  {
    selectedText: '计划于 2026年3月15日 正式发布，届时将同步上线新版本。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '建议确认发布日期的合理性：1) 2026年3月15日是周日，是否确认为正式发布日期（通常发布选择工作日）；2) 发布计划是否包含回滚方案和应急预案；3) 如有里程碑节点，建议与团队确认进度是否匹配。',
    status: 'accepted',
    acceptCount: 6,
  },
  {
    selectedText: '详情请访问官网 https://example.com/document 获取更多信息。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '建议检查链接的可访问性和准确性：1) 链接是否为正式环境地址（非测试/开发环境）；2) 文档链接是否需要权限控制；3) 链接失效时是否有备用信息；4) 重要文档建议同时提供关键内容摘要，而非仅提供链接。',
    status: 'accepted',
    acceptCount: 4,
  },
  {
    selectedText: 'TODO: 后续需要优化这部分的性能问题，当前实现不够高效。',
    paragraphType: 'paragraph',
    annotationType: 'suggestion',
    annotationContent: '检测到 TODO 待办标记，建议在文档正式发布前处理完毕。如需保留，请补充具体的优化计划、责任人、预期时间节点，避免待办事项无限期搁置。',
    suggestedText: '【性能优化计划】当前实现可通过以下方式优化：1) 引入缓存机制降低重复计算；2) 批量处理减少 I/O 次数；3) 优化算法时间复杂度。预期优化周期 2 周，责任人 XXX，预计完成日期 2026-06-30。',
    originalText: 'TODO: 后续需要优化这部分的性能问题，当前实现不够高效。',
    status: 'accepted',
    acceptCount: 7,
  },
  {
    selectedText: '# 第三章 详细设计方案 我们将在本节讨论系统的架构设计。',
    paragraphType: 'heading',
    annotationType: 'comment',
    annotationContent: '建议检查标题层级结构的正确性：第三章作为一级章节应使用 H1，其下小节应依次使用 H2-H4。避免层级跳跃（如直接从 H1 跳到 H3），合理的标题结构有利于文档导航和自动生成目录。',
    status: 'accepted',
    acceptCount: 3,
  },
  {
    selectedText: '系统采用微服务架构设计，主要包含用户服务、订单服务、支付服务、消息服务、通知服务、日志服务、监控服务、配置服务等多个模块。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '该段落内容较长且列举了多个模块，建议考虑：1) 使用无序列表逐项列出各服务并简要说明职责，提升可读性；2) 如有架构图，建议在此处引用；3) 可以拆分为两个段落，前半段讲架构模式，后半段讲各模块说明。',
    status: 'accepted',
    acceptCount: 2,
  },
  {
    selectedText: '产品支持 English 和 中文 两种语言，满足多语言需求。同时提供 RESTful API 接口供第三方系统集成使用。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '检测到中英文混排内容，建议遵循规范：1) 中英文之间添加空格（如"English 和中文"改为"English 和 中文"）；2) 技术术语（如 RESTful API）保持一致性，首次出现时可添加中文说明；3) 产品名称、专有名词的大小写保持统一。',
    status: 'accepted',
    acceptCount: 2,
  },
  {
    selectedText: '| 功能模块 | 优先级 | 预计工时 |\n| --- | --- | --- |\n| 用户登录 | P0 | 5天 |\n| 订单管理 | P0 | 10天 |\n| 支付功能 | P1 | 8天 |',
    paragraphType: 'table',
    annotationType: 'comment',
    annotationContent: '建议核实表格数据的一致性：1) 工时估算的合理性（是否考虑了设计、开发、测试、联调全流程）；2) P0 优先级功能的合计工时是否匹配总工期；3) 表格中缺少"负责人"和"依赖项"列，复杂项目建议补充；4) 合计工时建议汇总展示。',
    status: 'accepted',
    acceptCount: 5,
  },
  {
    selectedText: '如有问题请联系技术支持 team-support@company.com 或产品经理 pm@company.com。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '建议确认联系方式的有效性和适用性：1) 邮箱地址是否为正式公开的对外联系方式；2) 是否需要区分不同场景的对接人（技术问题、商务合作等）；3) 重要文档建议同时提供备用联系人或响应时效说明。',
    status: 'accepted',
    acceptCount: 3,
  },
  {
    selectedText: 'let x = 10;\nfor(let i=0;i<x;i++){\nconsole.log(i);\n}',
    paragraphType: 'code',
    annotationType: 'suggestion',
    annotationContent: '建议优化代码格式和风格：1) 运算符两侧添加空格；2) 使用 const 替代 let（当变量不重新赋值时）；3) for 循环内部语句缩进；4) 箭头函数和换行保持一致风格。统一的代码规范有利于团队协作。',
    suggestedText: 'const MAX_COUNT = 10;\nfor (let i = 0; i < MAX_COUNT; i++) {\n  console.log(i);\n}',
    originalText: 'let x = 10;\nfor(let i=0;i<x;i++){\nconsole.log(i);\n}',
    status: 'accepted',
    acceptCount: 9,
  },
  {
    selectedText: '活动期间全场商品 8.5 折优惠，订单金额超过 500 元再减 50 元，预计吸引约 10 万人次参与。',
    paragraphType: 'paragraph',
    annotationType: 'comment',
    annotationContent: '检测到营销活动相关数字，请重点核实：1) 折扣计算逻辑（叠加顺序是先打折再满减还是反之）；2) 500元门槛是实付还是商品总价；3) 10万人次预估依据是什么，是否有同类活动历史数据支撑；4) 促销成本和预期收益是否做过测算。',
    status: 'accepted',
    acceptCount: 6,
  },
  {
    selectedText: '> 引用某位专家的话："这个方案非常具有创新性，值得推广应用。"',
    paragraphType: 'quote',
    annotationType: 'comment',
    annotationContent: '建议完善引用内容：1) 注明引用来源出处（作者姓名、职务/机构、发布渠道、时间）；2) 如为非正式场合言论，建议标注；3) 关键引言建议提供原文链接或上下文，避免断章取义。',
    status: 'accepted',
    acceptCount: 2,
  },
];

export class SeedDataService {
  static async initializeIfEmpty(): Promise<{ seeded: boolean; count: number }> {
    const existing = await SimilarityMatcher.getHistoricalCases();
    if (existing.length > 0) {
      return { seeded: false, count: existing.length };
    }

    const cases: HistoricalCase[] = SEED_TEMPLATES.map((template, index) => {
      const textFeatures = FeatureExtractor.extractTextFeatures(template.selectedText);
      const contextFeatures = FeatureExtractor.extractContextFeatures(
        template.paragraphType,
        index,
        SEED_TEMPLATES.length,
        null,
        null
      );
      const combined = FeatureExtractor.buildCombinedVector(textFeatures, contextFeatures);

      return {
        id: `seed_${Date.now().toString(36)}_${index.toString(36).padStart(4, '0')}`,
        annotationId: `ann_seed_${index}`,
        annotationType: template.annotationType,
        annotationContent: template.annotationContent,
        suggestedText: template.suggestedText,
        originalText: template.originalText,
        featureVector: { text: textFeatures, context: contextFeatures, combined },
        selectedText: template.selectedText,
        paragraphType: template.paragraphType,
        status: template.status,
        acceptCount: template.acceptCount,
        createdAt: new Date().toISOString(),
        docId: 'seed_doc_001',
      };
    });

    for (const c of cases) {
      await SimilarityMatcher.saveHistoricalCase(c);
    }

    return { seeded: true, count: cases.length };
  }
}
