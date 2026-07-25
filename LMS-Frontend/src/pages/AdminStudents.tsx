import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Card, CardHeader, CardContent, CardTitle } from '../components/Card';
import Button from '../components/Button';
import Input, { Select } from '../components/Input';
import Modal from '../components/Modal';
import { courseService } from '../services/courseService';
import { userDirectoryService } from '../services/userDirectoryService';
import { usersService } from '../services/usersService';
import { studentsService } from '../services/studentsService';
import { UserPlus, Edit, Trash2, Mail, BookOpen, Loader2, KeyRound, Search, Upload, Download, CheckCircle, AlertCircle, Wallet, XCircle, Copy } from 'lucide-react';
import { Student, CreateStudentData, UpdateStudentData } from '../types/api';
import { getErrorMessage } from '../utils/apiError';

// ─── CSV helpers ────────────────────────────────────────────────────────────

const CSV_HEADERS = ['name', 'email', 'enrollmentNumber', 'department', 'semester'] as const;
const CSV_TEMPLATE = [
  CSV_HEADERS.join(','),
  'Jane Smith,jane@example.com,KCS2024001,Computer Science,1',
  'John Doe,john@example.com,KCS2024002,Information Technology,2',
].join('\n');

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): CreateStudentData[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const dataLines = lines[0].toLowerCase().startsWith('name') ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      name: cols[0] ?? '',
      email: cols[1] ?? '',
      enrollmentNumber: cols[2] ?? '',
      department: cols[3] ?? 'General',
      semester: parseInt(cols[4] ?? '1') || 1,
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const AdminStudents: React.FC = () => {
  const {
    students,
    studentsLoading,
    studentsError,
    fetchStudents,
    addStudent,
    updateStudent,
    deleteStudent,
  } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState<CreateStudentData>({
    name: '',
    email: '',
    enrollmentNumber: '',
    department: 'Computer Science',
    semester: 1,
  });
  const [selectedCourseCodes, setSelectedCourseCodes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [courses, setCourses] = useState<Awaited<ReturnType<typeof courseService.fetchCourses>>>([]);
  const [courseCodesMap, setCourseCodesMap] = useState<Record<string, string[]>>({});

  // Search + wallet filter
  const [searchQuery, setSearchQuery] = useState('');
  const [walletFilter, setWalletFilter] = useState<'all' | 'linked' | 'none' | 'existing_account'>('all');
  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return students.filter((s) => {
      if (q && !(
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.enrollmentNumber.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      )) return false;
      if (walletFilter === 'linked') return s.walletLinkingStatus === 'linked';
      if (walletFilter === 'none') return !s.walletLinkingStatus || s.walletLinkingStatus === 'none';
      if (walletFilter === 'existing_account') return s.walletLinkingStatus === 'existing_account';
      return true;
    });
  }, [students, searchQuery, walletFilter]);

  // CSV import
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<CreateStudentData[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    created: number;
    skipped: number;
    results: Array<{ row: number; status: 'created' | 'skipped'; name: string; email: string; reason?: string }>;
  } | null>(null);
  const [importError, setImportError] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  const courseCodesWithTitles = useMemo(
    () => courses.filter((c) => c.courseCode).map((c) => ({ code: c.courseCode!, title: c.title })),
    [courses]
  );

  const departments = [
    'Computer Science',
    'Information Technology',
    'Electronics',
    'Mechanical Engineering',
    'Civil Engineering',
    'General',
  ];
  const semesters = Array.from({ length: 8 }, (_, i) => i + 1);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    courseService.fetchCourses().then(setCourses).catch(() => setCourses([]));
    usersService.getUsers().then((users) => {
      const map: Record<string, string[]> = {};
      users.forEach((u) => { map[u.id] = u.courseCodes ?? []; });
      setCourseCodesMap(map);
    }).catch(() => {});
  }, []);

  const handleOpenModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        name: student.name,
        email: student.email,
        enrollmentNumber: student.enrollmentNumber,
        department: student.department,
        semester: student.semester,
      });
      setSelectedCourseCodes(courseCodesMap[student.userId || student.id] ?? []);
    } else {
      setEditingStudent(null);
      setFormData({ name: '', email: '', enrollmentNumber: '', department: 'Computer Science', semester: 1 });
      setSelectedCourseCodes([]);
    }
    setSubmitError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      if (editingStudent) {
        const updateData: UpdateStudentData = {
          name: formData.name,
          email: formData.email,
          enrollmentNumber: formData.enrollmentNumber,
          department: formData.department,
          semester: formData.semester,
        };
        await updateStudent(editingStudent.id, updateData);
        const userId = editingStudent.userId || editingStudent.id;
        if (userId) await usersService.patchUserCourseCodes(userId, selectedCourseCodes);
        userDirectoryService.update(userId || editingStudent.id, { name: formData.name, email: formData.email, courseCodes: selectedCourseCodes });
      } else {
        const student = await addStudent(formData);
        const userId = student.userId || student.id;
        if (userId && selectedCourseCodes.length > 0) await usersService.patchUserCourseCodes(userId, selectedCourseCodes);
        userDirectoryService.add({ id: userId || student.id, name: student.name, email: student.email, role: 'student', courseCodes: selectedCourseCodes });
      }
      setIsModalOpen(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Could not save the student.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this student? All their submissions will also be deleted.')) {
      try {
        await deleteStudent(id);
      } catch (error) {
        alert(getErrorMessage(error, 'Could not delete the student.'));
      }
    }
  };

  // ── CSV import handlers ───────────────────────────────────────────────────

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setImportRows(rows);
      setImportResults(null);
      setImportError('');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportError('');
    try {
      const result = await studentsService.importBulk(importRows);
      setImportResults(result);
      fetchStudents();
    } catch (err) {
      setImportError(getErrorMessage(err, 'Import failed.'));
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setImportRows([]);
    setImportResults(null);
    setImportError('');
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  if (studentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Loading students…</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Student Management</h1>
          <p className="text-gray-600 mt-1">Manage student records and information</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => { resetImport(); setImportOpen(true); }}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Student
          </Button>
        </div>
      </div>

      {studentsError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{studentsError}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>All Students ({filteredStudents.length}{(searchQuery || walletFilter !== 'all') ? ` of ${students.length}` : ''})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, email, enrollment…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
                />
              </div>
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value as typeof walletFilter)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="all">All wallets</option>
                <option value="linked">Linked</option>
                <option value="none">No wallet</option>
                <option value="existing_account">Action needed</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">{searchQuery ? 'No students match your search' : 'No students yet'}</p>
              {!searchQuery && <p className="text-sm text-gray-500">Click "Add Student" or "Import CSV" to get started</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrollment No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Semester</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course access</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wallet</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-9 w-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-primary-600 font-semibold text-sm">
                              {student.name.split(' ').map((n) => n[0]).join('')}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" />{student.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{student.enrollmentNumber}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex items-center gap-1">
                          <BookOpen className="h-4 w-4 text-gray-400" />{student.department}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">Semester {student.semester}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {(courseCodesMap[student.userId || student.id] ?? []).length === 0
                          ? '—'
                          : (courseCodesMap[student.userId || student.id] ?? []).join(', ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {student.walletAddress ? (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(student.walletAddress!).catch(() => {});
                            }}
                            className="flex items-center gap-1.5 text-xs font-mono text-neutral-600 hover:text-neutral-900 transition-colors"
                            title={student.walletAddress}
                          >
                            {student.walletAddress.slice(0, 4)}…{student.walletAddress.slice(-4)}
                            <Copy className="h-3 w-3 shrink-0" />
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {student.walletLinkingStatus === 'linked' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
                            <Wallet className="h-3 w-3" />Mainnet
                          </span>
                        ) : student.walletLinkingStatus === 'existing_account' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-medium">
                            <AlertCircle className="h-3 w-3" />Action needed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-xs font-medium">
                            <XCircle className="h-3 w-3" />No wallet
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(student)}>
                            <Edit className="h-3 w-3 mr-1" />Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(student.id)}>
                            <Trash2 className="h-3 w-3 mr-1" />Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingStudent ? 'Edit Student' : 'Add New Student'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Full Name" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          <Input type="email" label="Email Address" placeholder="student@smwebsystems.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
          <Input label="Enrollment Number" placeholder="KCS2024001" value={formData.enrollmentNumber} onChange={(e) => setFormData({ ...formData, enrollmentNumber: e.target.value })} required />
          <Select label="Department" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} options={departments.map((d) => ({ value: d, label: d }))} />
          <Select label="Semester" value={formData.semester} onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })} options={semesters.map((s) => ({ value: s, label: `Semester ${s}` }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <KeyRound className="h-4 w-4 inline mr-1" />Course access
            </label>
            <p className="text-sm text-gray-500 mb-2">Select which courses this student can see (0 to many).</p>
            {courseCodesWithTitles.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No courses with codes yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                {courseCodesWithTitles.map(({ code, title }) => (
                  <label key={code} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCourseCodes.includes(code)} onChange={() => setSelectedCourseCodes((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code])} className="rounded border-gray-300 text-primary-600" />
                    <span className="font-medium text-gray-800 text-sm">{code}</span>
                    <span className="text-gray-500 text-sm">— {title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {submitError && <div className="p-3 bg-red-50 border border-red-200 rounded-md"><p className="text-sm text-red-600">{submitError}</p></div>}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : editingStudent ? 'Update Student' : 'Add Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── CSV Import Modal ───────────────────────────────────────────── */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import Students via CSV">
        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium">Need the format? Download the CSV template first.</p>
            <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap ml-4">
              <Download className="h-4 w-4" />Template
            </button>
          </div>

          {/* File picker */}
          {!importResults && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV file</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 transition-colors">
                <div className="text-center">
                  <Upload className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                  <label className="cursor-pointer text-sm font-medium text-primary-600 hover:text-primary-500">
                    Choose a .csv file
                    <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleCSVFile} />
                  </label>
                  <p className="text-xs text-gray-500 mt-1">Columns: name, email, enrollmentNumber, department, semester</p>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {importRows.length > 0 && !importResults && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{importRows.length} row(s) found — preview:</p>
              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg text-xs">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Name', 'Email', 'Enrollment No.', 'Department', 'Semester'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {importRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">{r.email}</td>
                        <td className="px-3 py-2">{r.enrollmentNumber}</td>
                        <td className="px-3 py-2">{r.department}</td>
                        <td className="px-3 py-2">{r.semester}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results */}
          {importResults && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResults.created}</p>
                  <p className="text-xs text-green-600 font-medium">Created</p>
                </div>
                <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{importResults.skipped}</p>
                  <p className="text-xs text-yellow-600 font-medium">Skipped</p>
                </div>
              </div>
              {importResults.skipped > 0 && (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg text-xs">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Row</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {importResults.results.filter((r) => r.status === 'skipped').map((r) => (
                        <tr key={r.row}>
                          <td className="px-3 py-2">{r.row}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1 text-red-600"><AlertCircle className="h-3 w-3" />Skipped</span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {importError && <div className="p-3 bg-red-50 border border-red-200 rounded-md"><p className="text-sm text-red-600">{importError}</p></div>}

          <div className="flex justify-end gap-3 pt-2">
            {importResults ? (
              <>
                <Button variant="secondary" onClick={resetImport}>Import more</Button>
                <Button variant="primary" onClick={() => setImportOpen(false)}>
                  <CheckCircle className="h-4 w-4 mr-1" />Done
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleImport} disabled={importing || importRows.length === 0}>
                  {importing ? 'Importing…' : `Import ${importRows.length > 0 ? importRows.length + ' students' : ''}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminStudents;
