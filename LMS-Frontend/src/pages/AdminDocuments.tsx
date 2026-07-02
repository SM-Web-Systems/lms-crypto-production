import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { documentsService } from '../services/documentsService';
import { courseService } from '../services/courseService';
import { getCourseIdsFromDocument, documentAccessLabel } from '../services/resourceAccessService';
import { getErrorMessage } from '../utils/apiError';
import { CourseDocument, CreateDocumentData } from '../types/api';
import type { Course } from '../types/course';
import {
  FileText,
  Download,
  Search,
  Filter,
  FolderOpen,
  File,
  FileImage,
  FileArchive,
  AlertCircle,
  BookOpen,
  Plus,
  Trash2,
  Upload,
  X,
  CheckCircle,
  Lock,
  Globe,
  Settings2,
  Loader2,
} from 'lucide-react';
import { DocumentsTableSkeleton } from '../components/PageSkeletons';

const getFileIcon = (fileName: string, size: 'sm' | 'lg' = 'lg') => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const sizeClass = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  switch (ext) {
    case 'pdf':
      return <FileText className={`${sizeClass} text-red-500`} />;
    case 'doc':
    case 'docx':
      return <FileText className={`${sizeClass} text-blue-500`} />;
    case 'ppt':
    case 'pptx':
    case 'ppsx':
      return <FileText className={`${sizeClass} text-orange-500`} />;
    case 'zip':
    case 'rar':
      return <FileArchive className={`${sizeClass} text-amber-500`} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className={`${sizeClass} text-green-500`} />;
    default:
      return <File className={`${sizeClass} text-gray-500`} />;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const PREDEFINED_CATEGORIES = [
  'Lecture Notes',
  'Assignments',
  'Study Guides',
  'Reference Materials',
  'Exam Preparation',
  'Project Resources',
  'Tutorials',
  'Other',
];

const AdminDocuments: React.FC = () => {
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [categories, setCategories] = useState<string[]>(PREDEFINED_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditAccessModalOpen, setIsEditAccessModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<CourseDocument | null>(null);
  const [documentForAccess, setDocumentForAccess] = useState<CourseDocument | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    accessType: 'open' as 'open' | 'courses',
    selectedCourseIds: [] as string[],
  });
  const [editAccessCourseIds, setEditAccessCourseIds] = useState<string[]>([]);
  const [editAccessRestrictToCourses, setEditAccessRestrictToCourses] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { search?: string; category?: string } = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedCategory) params.category = selectedCategory;

      const response = await documentsService.getAll(params);
      setDocuments(response.documents);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load documents.'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await documentsService.getCategories();
      if (cats.length > 0) {
        // Merge fetched categories with predefined ones
        const mergedCategories = [...new Set([...PREDEFINED_CATEGORIES, ...cats])];
        setCategories(mergedCategories);
      }
    } catch {
      // Use predefined categories if fetch fails
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    courseService.fetchCourses().then(setCourses).catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchDocuments]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!formData.title) {
        setFormData((prev) => ({
          ...prev,
          title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for title
        }));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setUploading(true);
      setUploadError(null);

      const courseIds = formData.accessType === 'open' ? [] : formData.selectedCourseIds;
      const data: CreateDocumentData = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        file: selectedFile,
        courseIds,
      };

      await documentsService.create(data);
      setSuccessMessage('Document uploaded successfully!');
      setIsUploadModalOpen(false);
      setUploadError(null);
      resetForm();
      fetchDocuments();
    } catch (err) {
      setUploadError(getErrorMessage(err, 'Could not upload the document.'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      setDeleting(true);
      setError(null);

      await documentsService.delete(documentToDelete.id);
      setSuccessMessage('Document deleted successfully!');
      setIsDeleteModalOpen(false);
      setDocumentToDelete(null);
      fetchDocuments();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the document.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (doc: CourseDocument) => {
    try {
      await documentsService.download(doc.id);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not download the file.'));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: '',
      accessType: 'open',
      selectedCourseIds: [],
    });
    setSelectedFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openEditAccessModal = (doc: CourseDocument) => {
    setDocumentForAccess(doc);
    const ids = getCourseIdsFromDocument(doc);
    setEditAccessCourseIds(ids);
    setEditAccessRestrictToCourses(ids.length > 0);
    setIsEditAccessModalOpen(true);
  };

  const saveEditAccess = async () => {
    if (!documentForAccess) return;
    const courseIds = editAccessRestrictToCourses ? editAccessCourseIds : [];
    try {
      setError(null);
      await documentsService.update(documentForAccess.id, { courseIds });
      setSuccessMessage('Resource access updated.');
      setIsEditAccessModalOpen(false);
      setDocumentForAccess(null);
      fetchDocuments();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update who can access this document.'));
    }
  };

  const getAccessLabel = (doc: CourseDocument): string => documentAccessLabel(doc, courses);

  const openDeleteModal = (doc: CourseDocument) => {
    setDocumentToDelete(doc);
    setIsDeleteModalOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
  };

  const hasActiveFilters = searchTerm || selectedCategory;

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center mb-2">
            <BookOpen className="h-8 w-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Resources</h1>
          </div>
          <p className="text-gray-600">
            Upload and manage learning materials for students
          </p>
        </div>
        <Button onClick={() => setIsUploadModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
          <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={selectedCategory}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none bg-white min-w-[180px]"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && <DocumentsTableSkeleton />}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <FolderOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Documents Found</h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'No documents match your search criteria.'
                  : 'Get started by uploading your first course document.'}
              </p>
              {!hasActiveFilters && (
                <Button onClick={() => setIsUploadModalOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload First Document
                </Button>
              )}
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents Table */}
      {!loading && documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Documents ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="pb-3 font-medium text-gray-600">Document</th>
                    <th className="pb-3 font-medium text-gray-600">Category</th>
                    <th className="pb-3 font-medium text-gray-600">Available to</th>
                    <th className="pb-3 font-medium text-gray-600">Size</th>
                    <th className="pb-3 font-medium text-gray-600">Uploaded</th>
                    <th className="pb-3 font-medium text-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4">
                        <div className="flex items-center space-x-3">
                          {getFileIcon(doc.fileName, 'sm')}
                          <div>
                            <p className="font-medium text-gray-900">{doc.title}</p>
                            <p className="text-sm text-gray-500 truncate max-w-xs">
                              {doc.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                          {doc.category}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-gray-600 max-w-[200px]">
                        {getAccessLabel(doc)}
                      </td>
                      <td className="py-4 text-sm text-gray-600">
                        {formatFileSize(doc.fileSize)}
                      </td>
                      <td className="py-4 text-sm text-gray-600">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => openEditAccessModal(doc)}
                            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit access"
                          >
                            <Settings2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(doc)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          resetForm();
          setUploadError(null);
        }}
        title="Upload Course Document"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Inline error banner */}
          {uploadError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
              <span className="flex-1">{uploadError}</span>
              <button type="button" onClick={() => setUploadError(null)} className="shrink-0">
                <X className="h-4 w-4 text-red-400 hover:text-red-600" />
              </button>
            </div>
          )}

          {/* File Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              selectedFile
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.zip,.txt,.png,.jpg,.jpeg,.gif,.ppt,.pptx,.ppsx"
            />
            {selectedFile ? (
              <div className="flex items-center justify-center space-x-3">
                {getFileIcon(selectedFile.name)}
                <div className="text-left">
                  <p className="font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                >
                  <X className="h-4 w-4 text-red-500" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Click to select a file</p>
                <p className="text-sm text-gray-400 mt-1">
                  PDF, DOC, DOCX, PPT, PPTX, ZIP, TXT, Images (max 10MB)
                </p>
              </>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Title *
            </label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter document title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Description *
              </label>
              <span className={`text-xs tabular-nums ${formData.description.length > 900 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                {formData.description.length}/1000
              </span>
            </div>
            <textarea
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value.slice(0, 1000) })}
              placeholder="Brief description of the document"
              rows={3}
              required
              maxLength={1000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, category: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Available to: Open vs course(s) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available to
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="accessType"
                  checked={formData.accessType === 'open'}
                  onChange={() => setFormData({ ...formData, accessType: 'open', selectedCourseIds: [] })}
                  className="text-primary-600"
                />
                <Globe className="h-4 w-4 text-gray-500" />
                <span>Open to all students</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="accessType"
                  checked={formData.accessType === 'courses'}
                  onChange={() => setFormData({ ...formData, accessType: 'courses' })}
                  className="text-primary-600"
                />
                <Lock className="h-4 w-4 text-gray-500" />
                <span>Only students in selected courses</span>
              </label>
              {formData.accessType === 'courses' && (
                <div className="pl-6 mt-2">
                  <select
                    multiple
                    value={formData.selectedCourseIds}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                      setFormData({ ...formData, selectedCourseIds: selected });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-h-[100px]"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple courses.</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsUploadModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || !selectedFile}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Access Modal */}
      <Modal
        isOpen={isEditAccessModalOpen}
        onClose={() => {
          setIsEditAccessModalOpen(false);
          setDocumentForAccess(null);
        }}
        title="Edit resource access"
      >
        <div className="space-y-4">
          {documentForAccess && (
            <p className="text-sm text-gray-600">
              Who can see <span className="font-medium">{documentForAccess.title}</span>?
            </p>
          )}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="editAccessType"
                checked={!editAccessRestrictToCourses}
                onChange={() => setEditAccessRestrictToCourses(false)}
                className="text-primary-600"
              />
              <Globe className="h-4 w-4 text-gray-500" />
              <span>Open to all students</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="editAccessType"
                checked={editAccessRestrictToCourses}
                onChange={() => setEditAccessRestrictToCourses(true)}
                className="text-primary-600"
              />
              <Lock className="h-4 w-4 text-gray-500" />
              <span>Only students in selected courses</span>
            </label>
            {editAccessRestrictToCourses && (
              <div className="pl-6 mt-2">
                <select
                  multiple
                  value={editAccessCourseIds}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    setEditAccessCourseIds(Array.from(e.target.selectedOptions, (o) => o.value));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-h-[100px]"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple courses.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditAccessModalOpen(false);
                setDocumentForAccess(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveEditAccess}>
              Save access
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDocumentToDelete(null);
        }}
        title="Delete Document"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete{' '}
            <span className="font-semibold">{documentToDelete?.title}</span>? This action cannot be
            undone.
          </p>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDocumentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDocuments;

