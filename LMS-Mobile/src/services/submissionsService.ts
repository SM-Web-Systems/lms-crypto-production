import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, { getAuthToken } from '../lib/api';
import { ApiRequestError, assertApiOk, assertApiSuccess } from '../utils/apiError';
import type {
  ApiResponse,
  Submission,
  CreateSubmissionData,
  SubmissionQueryParams,
  Pagination,
  NativeFile,
} from '../types/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

interface SubmissionsResponse {
  submissions: Submission[];
  pagination: Pagination;
}

function appendNativeFile(formData: FormData, field: string, file: NativeFile) {
  formData.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.type || 'application/octet-stream',
  } as unknown as Blob);
}

async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const token = await getAuthToken();
  const fileUri = `${FileSystem.cacheDirectory}${fallbackName}`;
  const result = await FileSystem.downloadAsync(url, fileUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status !== 200) {
    throw new ApiRequestError({ message: 'Could not download the file.', status: result.status });
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri);
  }
}

export const submissionsService = {
  async getAll(params?: SubmissionQueryParams): Promise<SubmissionsResponse> {
    const response = await api.get<ApiResponse<SubmissionsResponse>>('/submissions', { params });
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
    appendNativeFile(formData, 'file', data.file);
    const response = await api.post<ApiResponse<Submission>>('/submissions', formData);
    return assertApiSuccess(response, 'Could not submit your work.');
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(`/submissions/${id}`);
    assertApiOk(response, 'Could not delete the submission.');
  },

  getDownloadUrl(id: string): string {
    return `${API_BASE_URL}/submissions/${id}/download`;
  },

  async download(id: string): Promise<void> {
    await downloadFile(this.getDownloadUrl(id), `submission-${id}`);
  },
};
