import type {
  Annotation,
  AnnotationStatus,
  RecommendationAlgorithm,
} from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';
import { SimilarityMatcher } from './recommendation/SimilarityMatcher.js';

function genId() {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AnnotationService {
  static async list(docId: string): Promise<Annotation[]> {
    return FileStorageService.readJson<Annotation[]>(FileStorageService.getAnnotationsPath(docId), []);
  }

  static async listAll(): Promise<Annotation[]> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const annDir = path.resolve(__dirname, '..', 'data', 'annotations');
    const files = await fs.readdir(annDir).catch(() => [] as string[]);
    const all: Annotation[] = [];
    for (const f of files) {
      const fpath = path.join(annDir, f);
      const list = await FileStorageService.readJson<Annotation[]>(fpath, []);
      all.push(...list);
    }
    return all;
  }

  static async create(data: {
    docId: string;
    paragraphId: string;
    type: Annotation['type'];
    reviewerName: string;
    reviewerEmail?: string;
    content: string;
    suggestedText?: string;
    originalText?: string;
    recommendedBy?: RecommendationAlgorithm;
    recommendationId?: string;
  }): Promise<Annotation> {
    const all = await this.list(data.docId);
    const now = new Date().toISOString();
    const ann: Annotation = {
      id: genId(),
      docId: data.docId,
      paragraphId: data.paragraphId,
      type: data.type,
      reviewerName: data.reviewerName,
      reviewerEmail: data.reviewerEmail,
      content: data.content,
      suggestedText: data.suggestedText,
      originalText: data.originalText,
      status: 'pending',
      recommendedBy: data.recommendedBy,
      recommendationId: data.recommendationId,
      createdAt: now,
      updatedAt: now,
    };
    all.push(ann);
    await FileStorageService.writeJson(FileStorageService.getAnnotationsPath(data.docId), all);
    return ann;
  }

  static async findById(id: string): Promise<{ annotation: Annotation; filePath: string } | null> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const annDir = path.resolve(__dirname, '..', 'data', 'annotations');
    const files = await fs.readdir(annDir).catch(() => [] as string[]);
    for (const f of files) {
      const fpath = path.join(annDir, f);
      const list = await FileStorageService.readJson<Annotation[]>(fpath, []);
      const idx = list.findIndex((a) => a.id === id);
      if (idx >= 0) {
        return { annotation: list[idx], filePath: fpath };
      }
    }
    return null;
  }

  static async updateStatus(id: string, status: AnnotationStatus, ownerNote?: string): Promise<Annotation | null> {
    const found = await this.findById(id);
    if (!found) return null;

    const { annotation, filePath } = found;
    const list = await FileStorageService.readJson<Annotation[]>(filePath, []);
    const idx = list.findIndex((a) => a.id === id);
    if (idx < 0) return null;

    const wasAccepted = annotation.status === 'accepted';
    const becomesAccepted = status === 'accepted';

    list[idx] = {
      ...list[idx],
      status,
      ownerNote,
      updatedAt: new Date().toISOString(),
    };
    await FileStorageService.writeJson(filePath, list);

    if (!wasAccepted && becomesAccepted) {
      await SimilarityMatcher.updateCaseAcceptCount(id, 1);
    } else if (wasAccepted && !becomesAccepted) {
      await SimilarityMatcher.updateCaseAcceptCount(id, -1);
    }

    return list[idx];
  }

  static async remove(id: string): Promise<boolean> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const annDir = path.resolve(__dirname, '..', 'data', 'annotations');
    const files = await fs.readdir(annDir).catch(() => [] as string[]);
    for (const f of files) {
      const fpath = path.join(annDir, f);
      const list = await FileStorageService.readJson<Annotation[]>(fpath, []);
      const filtered = list.filter((a) => a.id !== id);
      if (filtered.length !== list.length) {
        await FileStorageService.writeJson(fpath, filtered);
        return true;
      }
    }
    return false;
  }
}
