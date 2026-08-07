/**
 * Certificate PDF generation — Phase 23 C4.
 *
 * Generates PDF certificates for verified NFT credentials.
 * Reuses pdfkit patterns from invoiceService.ts.
 */
import PDFDocument from 'pdfkit';

export interface CertificateData {
  credentialId: string;
  studentName: string;
  courseTitle: string;
  courseCode: string;
  walletAddress: string;
  txHash: string | null;
  contractId: string;
  network: string;
  sorobanTokenId: number | null;
  issuedAt: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate a PDF certificate buffer for a verified NFT credential.
 */
export function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold')
      .text('Certificate of Completion', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').fillColor('#666666')
      .text('SM Web Systems Blockchain Academy', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).text('https://lms.smwebsystems.com', { align: 'center' });
    doc.moveDown(2);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#c9a96e').lineWidth(2).stroke();
    doc.moveDown(2);

    // Body
    doc.fillColor('#000000').fontSize(12).font('Helvetica')
      .text('This certifies that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).font('Helvetica-Bold')
      .text(data.studentName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica')
      .text('has successfully completed', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold')
      .text(data.courseTitle, { align: 'center' });
    if (data.courseCode) {
      doc.fontSize(10).font('Helvetica').fillColor('#666666')
        .text(`(${data.courseCode})`, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').fillColor('#333333')
      .text(`Completed on ${formatDate(data.issuedAt)}`, { align: 'center' });
    doc.moveDown(2);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#c9a96e').lineWidth(1).stroke();
    doc.moveDown(1.5);

    // Blockchain verification section
    doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold')
      .text('Blockchain Verification', { align: 'left' });
    doc.moveDown(0.5);

    const labelX = 50;
    const valueX = 200;

    const addRow = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666666')
        .text(label, labelX, y, { width: 140 });
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
        .text(value, valueX, y, { width: 340 });
      doc.moveDown(0.5);
    };

    if (data.txHash) {
      addRow('Transaction:', data.txHash);
      const network = data.network === 'testnet' ? 'testnet' : 'public';
      addRow('Explorer:', `https://stellar.expert/explorer/${network}/tx/${data.txHash}`);
    }
    addRow('Contract:', data.contractId);
    if (data.sorobanTokenId != null) {
      addRow('Token ID:', String(data.sorobanTokenId));
    }
    addRow('Network:', data.network === 'testnet' ? 'Stellar Testnet' : 'Stellar Mainnet');
    addRow('Wallet:', data.walletAddress);

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#999999')
      .text(`Verify at: https://lms.smwebsystems.com/verify/${data.credentialId}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.text(`Generated on ${new Date().toISOString().slice(0, 10)}. This is a blockchain-verified credential.`, {
      align: 'center',
    });

    doc.end();
  });
}
