/**
 * bulkExportService — generates a ZIP archive of certificate PDFs.
 * Uses archiver for streaming ZIP creation and certificatePdfService for PDF generation.
 */

import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { generateCertificatePdf, type CertificateData } from './certificatePdfService.js';
import logger from '../utils/logger.js';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
}

export async function streamCertificateZip(
  credentials: CertificateData[],
  res: Response,
  zipFilename: string,
): Promise<void> {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = new ZipArchive({ zlib: { level: 5 } });
  archive.pipe(res);

  const usedNames = new Set<string>();

  for (const cred of credentials) {
    try {
      const pdfBuffer = await generateCertificatePdf(cred);
      let baseName = sanitizeFilename(
        `${cred.courseCode || 'cert'}-${cred.studentName || 'student'}`,
      );
      let fileName = `${baseName}-certificate.pdf`;
      let counter = 2;
      while (usedNames.has(fileName)) {
        fileName = `${baseName}-certificate-${counter}.pdf`;
        counter++;
      }
      usedNames.add(fileName);
      archive.append(pdfBuffer, { name: fileName });
    } catch (err) {
      logger.error({ err, credentialId: cred.credentialId }, 'Failed to generate PDF for credential');
    }
  }

  await archive.finalize();
}
