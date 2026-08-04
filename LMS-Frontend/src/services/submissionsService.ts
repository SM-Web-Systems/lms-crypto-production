import api, { getAuthToken } from './api';
import { ApiRequestError, assertApiOk, assertApiSuccess, messageFromFailedFetchResponse } from '../utils/apiError';
import {
  ApiResponse,
  Submission,
  CreateSubmissionData,
  ReviewSubmissionData,
  SubmissionQueryParams,
  Pagination,
} from '../types/api';

interface SubmissionsResponse {
  submissions: Submission[];
  pagination: Pagination;
}

export const submissionsService = {
  async getAll(params?: SubmissionQueryParams): Promise<SubmissionsResponse> {
    const response = await api.get<ApiResponse<SubmissionsResponse>>('/submissions', {
      params,
    });
    return assertApiSuccess(response, 'Could not load submissions.');
  },

  async getById(id: string): Promise<Submission> {
    const response = await api.get<ApiResponse<Submission>>(`/submissions/${id}`);
    return assertApiSuccess(response, 'Could not load that submission.');
  },

  async create(data: CreateSubmissionData): Promise<Submission> {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('file', data.file);
    if (data.courseId) formData.append('courseId', data.courseId);
    if (data.weekId) formData.append('weekId', data.weekId);
    if (data.itemId) formData.append('itemId', data.itemId);

    const response = await api.post<ApiResponse<Submission>>('/submissions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return assertApiSuccess(response, 'Could not submit your work. Check the file and fields, then try again.');
  },

  async update(id: string, data: { title?: string; description?: string }): Promise<Submission> {
    const response = await api.put<ApiResponse<Submission>>(`/submissions/${id}`, data);
    return assertApiSuccess(response, 'Could not update the submission.');
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(`/submissions/${id}`);
    assertApiOk(response, 'Could not delete the submission.');
  },

  async review(id: string, data: ReviewSubmissionData): Promise<Submission> {
    const response = await api.post<ApiResponse<Submission>>(
      `/submissions/${id}/review`,
      data
    );
    return assertApiSuccess(response, 'Could not save the review.');
  },

  getDownloadUrl(id: string): string {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';
    return `${baseUrl}/submissions/${id}/download`;
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
};




