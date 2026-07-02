import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { documentsService } from '../services/documentsService';
import { getErrorMessage } from '../utils/apiError';
import { CourseDocument } from '../types/api';
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
  X,
  Loader2,
} from 'lucide-react';
import { DocumentsGridSkeleton } from '../components/PageSkeletons';

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <FileText className="h-8 w-8 text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText className="h-8 w-8 text-blue-500" />;
    case 'zip':
    case 'rar':
      return <FileArchive className="h-8 w-8 text-amber-500" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className="h-8 w-8 text-green-500" />;
    default:
      return <File className="h-8 w-8 text-gray-500" />;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const StudentDocuments: React.FC = () => {
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
      setCategories(cats);
    } catch {
      // Categories are optional, don't show error
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchDocuments]);

  const handleDownload = async (doc: CourseDocument): Promise<void> => {
    try {
      setDownloadingId(doc.id);
      await documentsService.download(doc.id);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not download the file.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
  };

  const hasActiveFilters = searchTerm || selectedCategory;

  // Group documents by category
  const groupedDocuments = documents.reduce((acc, doc) => {
    const cat = doc.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {} as Record<string, CourseDocument[]>);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-2">
          <BookOpen className="h-8 w-8 text-primary-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Resources</h1>
        </div>
        <p className="text-gray-600">
          Download learning materials and course documents uploaded by your instructors
        </p>
      </div>

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
                  onChange={(e) => setSelectedCategory(e.target.value)}
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

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && <DocumentsGridSkeleton />}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <FolderOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Documents Found</h3>
              <p className="text-gray-500">
                {hasActiveFilters
                  ? 'No documents match your search criteria. Try adjusting your filters.'
                  : 'No resources have been uploaded yet. Check back later!'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} className="mt-4">
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents Grid */}
      {!loading && documents.length > 0 && (
        <div className="space-y-8">
          {Object.entries(groupedDocuments).map(([category, docs]) => (
            <div key={category}>
              <div className="flex items-center mb-4">
                <FolderOpen className="h-5 w-5 text-primary-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">{category}</h2>
                <span className="ml-2 text-sm text-gray-500">({docs.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {docs.map((doc) => (
                  <Card
                    key={doc.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer group"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 p-2 bg-gray-50 rounded-lg group-hover:bg-primary-50 transition-colors">
                          {getFileIcon(doc.fileName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">
                            {doc.title}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {doc.description}
                          </p>
                          <div className="flex items-center mt-3 text-xs text-gray-400 space-x-3">
                            <span>{formatFileSize(doc.fileSize)}</span>
                            <span>•</span>
                            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                        >
                          {downloadingId === doc.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentDocuments;

