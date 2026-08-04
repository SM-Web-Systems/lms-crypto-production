import { CheckCircle, XCircle, Clock } from 'lucide-react';

export function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  if (status === 'approved') return <span className={`${base} bg-green-100 text-green-800`}><CheckCircle className="h-3 w-3 mr-1" />Approved</span>;
  if (status === 'rejected') return <span className={`${base} bg-red-100 text-red-800`}><XCircle className="h-3 w-3 mr-1" />Rejected</span>;
  return <span className={`${base} bg-yellow-100 text-yellow-800`}><Clock className="h-3 w-3 mr-1" />Pending</span>;
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
