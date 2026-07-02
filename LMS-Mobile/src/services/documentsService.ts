import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, { getAuthToken } from '../lib/api';
import { ApiRequestError, assertApiSuccess } from '../utils/apiError';
import type { ApiResponse, CourseDocument, DocumentQueryParams, Pagination } from '../types/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

interface DocumentsResponse {
  documents: CourseDocument[];
  pagination: Pagination;
}

export const documentsService = {
  async getAll(params?: DocumentQueryParams): Promise<DocumentsResponse> {
    const response = await api.get<ApiResponse<DocumentsResponse>>('/documents', { params });
    return assertApiSuccess(response, 'Could not load documents.');
  },

  async getById(id: string): Promise<CourseDocument> {
    const response = await api.get<ApiResponse<CourseDocument>>(`/documents/${id}`);
    return assertApiSuccess(response, 'Could not load that document.');
  },

  getDownloadUrl(id: string): string {
    return `${API_BASE_URL}/documents/${id}/download`;
  },

  async download(id: string, fallbackName?: string): Promise<void> {
    const token = await getAuthToken();
    const url = this.getDownloadUrl(id);
    const fileUri = `${FileSystem.cacheDirectory}${fallbackName || `document-${id}`}`;
    const result = await FileSystem.downloadAsync(url, fileUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (result.status !== 200) {
      throw new ApiRequestError({ message: 'Could not download the file.', status: result.status });
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri);
    }
  },

  async getCategories(): Promise<string[]> {
    const response = await api.get<ApiResponse<{ categories: string[] }>>('/documents/categories');
    const data = assertApiSuccess(response, 'Could not load document categories.');
    return data.categories ?? [];
  },
};
