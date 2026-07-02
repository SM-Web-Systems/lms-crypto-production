import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Card, CardHeader, CardContent, CardTitle } from '../components/Card';
import Button from '../components/Button';
import Input, { TextArea } from '../components/Input';
import Modal from '../components/Modal';
import { getErrorMessage } from '../utils/apiError';
import { Upload, FileText, CheckCircle, XCircle, Clock, Trash2, Loader2 } from 'lucide-react';

const StudentSubmissions: React.FC = () => {
  const { 
    submissions, 
    submissionsLoading, 
    submissionsError, 
    fetchSubmissions, 
    addSubmission, 
    deleteSubmission 
  } = useData();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    file: null as File | null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      setSubmitError('Please select a file');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      await addSubmission({
        title: formData.title,
        description: formData.description,
        file: formData.file,
      });
      setFormData({ title: '', description: '', file: null });
      setIsModalOpen(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Could not submit your work.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this submission?')) {
      try {
        await deleteSubmission(id);
      } catch (error) {
        alert(getErrorMessage(error, 'Could not delete the submission.'));
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  };

  if (submissionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Loading submissions...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Submissions</h1>
          <p className="text-gray-600 mt-1">Manage and track your submitted work</p>
        </div>
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          New Submission
        </Button>
      </div>

      {submissionsError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{submissionsError}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Submissions ({submissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No submissions yet</p>
              <p className="text-sm text-gray-500">Click "New Submission" to upload your first assignment</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {submissions.map((submission) => (
                    <tr key={submission.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{submission.title}</div>
                          <div className="text-sm text-gray-500">{submission.description}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{submission.fileName}</div>
                        <div className="text-xs text-gray-500">{formatFileSize(submission.fileSize)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            submission.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : submission.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {submission.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                          {submission.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {submission.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                          {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                        </span>
                        {submission.feedback && (
                          <div className="mt-1 text-xs text-gray-600">
                            <strong>Feedback:</strong> {submission.feedback}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(submission.submittedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {submission.status === 'pending' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(submission.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Submission Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Submission">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Title"
            placeholder="Assignment title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            maxLength={200}
            required
          />

          <TextArea
            label="Description"
            placeholder="Brief description of your work"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            maxLength={1000}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload File *
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-primary-500 transition-colors">
              <div className="space-y-1 text-center">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500">
                    <span>Upload a file</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.doc,.docx,.zip,.txt"
                      onChange={handleFileChange}
                      required
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PDF, DOC, DOCX, ZIP, TXT up to 10MB</p>
                {formData.file && (
                  <p className="text-sm text-primary-600 font-medium mt-2">
                    Selected: {formData.file.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{submitError}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StudentSubmissions;
