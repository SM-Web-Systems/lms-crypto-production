import api from './api';
import { assertApiOk, assertApiSuccess } from '../utils/apiError';
import {
  ApiResponse,
  Student,
  CreateStudentData,
  UpdateStudentData,
  StudentQueryParams,
  Pagination,
} from '../types/api';

interface StudentsResponse {
  students: Student[];
  pagination: Pagination;
}

export const studentsService = {
  async getAll(params?: StudentQueryParams): Promise<StudentsResponse> {
    const response = await api.get<ApiResponse<StudentsResponse>>('/students', {
      params,
    });
    return assertApiSuccess(response, 'Could not load students.');
  },

  async getById(id: string): Promise<Student> {
    const response = await api.get<ApiResponse<Student>>(`/students/${id}`);
    return assertApiSuccess(response, 'Could not load that student.');
  },

  async create(data: CreateStudentData): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>('/students', data);
    return assertApiSuccess(response, 'Could not add the student.');
  },

  async update(id: string, data: UpdateStudentData): Promise<Student> {
    const response = await api.put<ApiResponse<Student>>(`/students/${id}`, data);
    return assertApiSuccess(response, 'Could not update the student.');
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(`/students/${id}`);
    assertApiOk(response, 'Could not delete the student.');
  },

  async importBulk(rows: CreateStudentData[]): Promise<{
    created: number;
    skipped: number;
    results: Array<{ row: number; status: 'created' | 'skipped'; name: string; email: string; reason?: string }>;
  }> {
    const response = await api.post<ApiResponse<{
      created: number;
      skipped: number;
      results: Array<{ row: number; status: 'created' | 'skipped'; name: string; email: string; reason?: string }>;
    }>>('/students/import', { students: rows });
    return assertApiSuccess(response, 'Import failed.');
  },
};




