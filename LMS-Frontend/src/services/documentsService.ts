import api, { getAuthToken } from './api';
import { ApiRequestError, assertApiOk, assertApiSuccess, messageFromFailedFetchResponse } from '../utils/apiError';
import {
  ApiResponse,
  CourseDocument,
  CreateDocumentData,
  UpdateDocumentData,
  DocumentQueryParams,
  Pagination,
} from '../types/api';

interface DocumentsResponse {
  documents: CourseDocument[];
  pagination: Pagination;
}

export const documentsService = {
  async getAll(params?: DocumentQueryParams): Promise<DocumentsResponse> {
    const response = await api.get<ApiResponse<DocumentsResponse>>('/documents', {
      params,
    });
    return assertApiSuccess(response, 'Could not load documents.');
  },

  async getById(id: string): Promise<CourseDocument> {
    const response = await api.get<ApiResponse<CourseDocument>>(`/documents/${id}`);
    return assertApiSuccess(response, 'Could not load that document.');
  },

  async create(data: CreateDocumentData): Promise<CourseDocument> {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('category', data.category);
    formData.append('file', data.file);
    if (data.courseIds !== undefined) {
      formData.append('courseIds', JSON.stringify(data.courseIds));
    }

    const response = await api.post<ApiResponse<CourseDocument>>('/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return assertApiSuccess(
      response,
      'Could not upload the document. Check file type and size, then try again.'
    );
  },

  async update(id: string, data: UpdateDocumentData): Promise<CourseDocument> {
    const response = await api.put<ApiResponse<CourseDocument>>(`/documents/${id}`, data);
    return assertApiSuccess(response, 'Could not update the document.');
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(`/documents/${id}`);
    assertApiOk(response, 'Could not delete the document.');
  },

  getDownloadUrl(id: string): string {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';
    return `${baseUrl}/documents/${id}/download`;
  },

  async download(id: string): Promise<void> {
    const token = await getAuthToken();
    const response = await fetch(this.getDownloadUrl(id), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const msg = await messageFromFailedFetchResponse(response, 'Could not download the file.');
      throw new ApiRequestError({ message: msg, status: response.status });
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = contentDisposition
      ?.split('filename=')[1]
      ?.replace(/"/g, '') || 'download';

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async getCategories(): Promise<string[]> {
    const response = await api.get<ApiResponse<{ categories: string[] }>>('/documents/categories');
    const data = assertApiSuccess(response, 'Could not load document categories.');
    return data.categories ?? [];
  },
};

