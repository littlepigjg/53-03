import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const ANNOTATIONS_DIR = path.join(DATA_DIR, 'annotations');
const PARSED_DIR = path.join(DATA_DIR, 'parsed');
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');
const DOCUMENTS_FILE = path.join(DATA_DIR, 'documents.json');
const GLOBAL_DATA_DIR = path.join(DATA_DIR, 'global');
const RECOMMENDATION_DIR = path.join(DATA_DIR, 'recommendation');

export class FileStorageService {
  static async ensureDirs() {
    await Promise.all([
      fs.mkdir(DATA_DIR, { recursive: true }),
      fs.mkdir(ANNOTATIONS_DIR, { recursive: true }),
      fs.mkdir(PARSED_DIR, { recursive: true }),
      fs.mkdir(UPLOADS_DIR, { recursive: true }),
      fs.mkdir(GLOBAL_DATA_DIR, { recursive: true }),
      fs.mkdir(RECOMMENDATION_DIR, { recursive: true }),
    ]);
    try {
      await fs.access(DOCUMENTS_FILE);
    } catch {
      await fs.writeFile(DOCUMENTS_FILE, '[]', 'utf8');
    }
  }

  static async readJson<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
      await fs.access(filePath);
      const raw = await fs.readFile(filePath, 'utf8');
      return raw.trim() ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static async writeJson<T>(filePath: string, data: T) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  static getDocumentsPath() {
    return DOCUMENTS_FILE;
  }

  static getAnnotationsPath(docId: string) {
    return path.join(ANNOTATIONS_DIR, `${docId}.json`);
  }

  static getParsedPath(docId: string) {
    return path.join(PARSED_DIR, `${docId}.json`);
  }

  static getUploadsPath() {
    return UPLOADS_DIR;
  }

  static getGlobalPath(filename: string) {
    return path.join(GLOBAL_DATA_DIR, filename);
  }

  static getRecommendationPath(filename: string) {
    return path.join(RECOMMENDATION_DIR, filename);
  }

  static async readGlobalJson<T>(filename: string, defaultValue: T): Promise<T> {
    return this.readJson(this.getGlobalPath(filename), defaultValue);
  }

  static async writeGlobalJson<T>(filename: string, data: T) {
    return this.writeJson(this.getGlobalPath(filename), data);
  }

  static async readRecommendationJson<T>(filename: string, defaultValue: T): Promise<T> {
    return this.readJson(this.getRecommendationPath(filename), defaultValue);
  }

  static async writeRecommendationJson<T>(filename: string, data: T) {
    return this.writeJson(this.getRecommendationPath(filename), data);
  }

  static async deleteFile(filePath: string) {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }
}
