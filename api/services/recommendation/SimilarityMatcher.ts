import type { HistoricalCase, AnnotationRecommendation, FeatureVector } from '../../../shared/types.js';
import { FileStorageService } from '../FileStorageService.js';

export class SimilarityMatcher {
  private static readonly CASES_FILE = 'historical_cases.json';
  private static readonly TOP_K = 20;
  private static readonly MIN_SIMILARITY = 0.3;

  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i] || 0;
      const b = vecB[i] || 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  static textSimilarity(textA: string, textB: string): number {
    if (!textA || !textB) return 0;
    const setA = this.buildShingleSet(textA, 2);
    const setB = this.buildShingleSet(textB, 2);
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const shingle of setA) {
      if (setB.has(shingle)) intersection++;
    }
    return intersection / Math.sqrt(setA.size * setB.size);
  }

  static combinedSimilarity(
    targetVec: FeatureVector,
    targetText: string,
    caseItem: HistoricalCase
  ): number {
    const vecSim = this.cosineSimilarity(targetVec.combined, caseItem.featureVector.combined);
    const textSim = this.textSimilarity(targetText, caseItem.selectedText);
    const typeBoost = targetVec.context.paragraphType === caseItem.paragraphType ? 0.1 : 0;
    return vecSim * 0.6 + textSim * 0.4 + typeBoost;
  }

  static async getHistoricalCases(): Promise<HistoricalCase[]> {
    try {
      return await FileStorageService.readGlobalJson<HistoricalCase[]>(this.CASES_FILE, []);
    } catch {
      return [];
    }
  }

  static async saveHistoricalCase(caseItem: HistoricalCase): Promise<void> {
    const cases = await this.getHistoricalCases();
    const existingIndex = cases.findIndex((c) => c.id === caseItem.id);
    if (existingIndex >= 0) {
      cases[existingIndex] = caseItem;
    } else {
      cases.push(caseItem);
    }
    await FileStorageService.writeGlobalJson(this.CASES_FILE, cases);
  }

  static async updateCaseAcceptCount(annotationId: string, increment: number = 1): Promise<void> {
    const cases = await this.getHistoricalCases();
    const caseItem = cases.find((c) => c.annotationId === annotationId);
    if (caseItem) {
      caseItem.acceptCount += increment;
      await FileStorageService.writeGlobalJson(this.CASES_FILE, cases);
    }
  }

  static async findSimilarCases(
    targetVec: FeatureVector,
    targetText: string,
    limit: number = this.TOP_K
  ): Promise<Array<{ caseItem: HistoricalCase; similarity: number }>> {
    const cases = await this.getHistoricalCases();
    const results: Array<{ caseItem: HistoricalCase; similarity: number }> = [];

    for (const caseItem of cases) {
      const similarity = this.combinedSimilarity(targetVec, targetText, caseItem);
      if (similarity >= this.MIN_SIMILARITY) {
        results.push({ caseItem, similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  static generateRecommendations(
    similarCases: Array<{ caseItem: HistoricalCase; similarity: number }>,
    maxResults: number = 3
  ): AnnotationRecommendation[] {
    const clusters = new Map<string, Array<{ caseItem: HistoricalCase; similarity: number }>>();

    for (const item of similarCases) {
      const key = `${item.caseItem.annotationType}|${item.caseItem.annotationContent}`;
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(item);
    }

    const recommendations: AnnotationRecommendation[] = [];

    for (const [, cluster] of clusters) {
      if (cluster.length === 0) continue;

      const top = cluster.sort((a, b) => b.similarity - a.similarity)[0];
      const avgSim = cluster.reduce((sum, c) => sum + c.similarity, 0) / cluster.length;
      const acceptBoost = Math.min(top.caseItem.acceptCount * 0.05, 0.2);
      const confidence = Math.min(avgSim * 0.8 + acceptBoost + (cluster.length > 1 ? 0.05 : 0), 0.99);

      recommendations.push({
        id: `rec_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        type: top.caseItem.annotationType,
        content: top.caseItem.annotationContent,
        suggestedText: top.caseItem.suggestedText,
        confidence,
        algorithm: 'similarity',
        matchedCaseId: top.caseItem.id,
        matchedSimilarity: top.similarity,
        reason: `匹配到${cluster.length}个历史案例，最高相似度${(top.similarity * 100).toFixed(1)}%${top.caseItem.acceptCount > 0 ? `，该批注曾被采纳${top.caseItem.acceptCount}次` : ''}`,
      });
    }

    recommendations.sort((a, b) => b.confidence - a.confidence);
    return recommendations.slice(0, maxResults);
  }

  private static buildShingleSet(text: string, k: number): Set<string> {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ');
    const shingles = new Set<string>();
    for (let i = 0; i <= normalized.length - k; i++) {
      shingles.add(normalized.slice(i, i + k));
    }
    return shingles;
  }
}
