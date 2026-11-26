import React from 'react';
import { Award } from 'lucide-react';
import { ApplicationsPanel } from './AdminCertificates';

/**
 * Certificate applications for the courses this lecturer teaches. Lecturers approve, recommend or reject;
 * an administrator confirms payment and issues the certificate. The mainnet test found lecturers had no
 * screen for this at all (the Certificates page was admin-only).
 */
const LecturerCertificates: React.FC = () => (
  <div className="pb-10 space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
        <Award className="h-6 w-6 text-accent-teal" aria-hidden />
        Certificates
      </h1>
      <p className="text-sm text-neutral-600 mt-1">
        Review certificate applications for the courses you teach.
      </p>
    </div>
    <ApplicationsPanel role="lecturer" />
  </div>
);

export default LecturerCertificates;
