import type { WhatsappDashboardResponse } from '../whatsapp-dashboard.service';

function sanitizeFilenameSegment(value: string): string {
  return (
    value
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'report'
  );
}

export function buildWhatsappDashboardReportFilename(
  dateFrom: string,
  dateTo: string,
  campaignScopeLabel: string,
  format: 'csv' | 'pdf',
): string {
  const scope =
    campaignScopeLabel === 'All campaigns'
      ? 'all-campaigns'
      : sanitizeFilenameSegment(campaignScopeLabel);
  const extension = format === 'csv' ? 'csv' : 'pdf';
  return `whatsapp-dashboard-${dateFrom}-to-${dateTo}-${scope}.${extension}`;
}

export async function renderWhatsappDashboardReportPdf(
  data: WhatsappDashboardResponse,
  campaignScopeLabel: string,
): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('WhatsApp dashboard report');
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor('#444444')
      .text(
        `Date range: ${data.dateFrom} to ${data.dateTo} · Scope: ${campaignScopeLabel} · Exported: ${new Date().toLocaleString()}`,
      );
    doc.moveDown(1.2);
    doc.fillColor('#000000');

    doc.fontSize(12).text('Summary', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10);
    doc.text(`Messages sent: ${data.summary.messagesSent.toLocaleString()}`);
    doc.text(`Replies: ${data.summary.replies.toLocaleString()}`);
    doc.text(
      `Campaign status (current): running ${data.summary.campaignsRunning}, scheduled ${data.summary.campaignsScheduled}, completed ${data.summary.campaignsCompleted}, draft ${data.summary.campaignsDraft}, stopped ${data.summary.campaignsStopped}`,
    );
    doc.moveDown(1);

    doc.fontSize(12).text('Daily trend', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9);
    for (const point of data.dailySendTrend) {
      doc.text(
        `${point.date}: ${point.messagesSent} sent, ${point.replies} replies`,
      );
    }
    doc.moveDown(1);

    doc.fontSize(12).text('Campaign breakdown', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9);
    if (data.campaigns.length === 0) {
      doc.text('No campaign activity in this range.');
    } else {
      for (const row of data.campaigns) {
        doc.text(
          `${row.name} (${row.status}): ${row.messagesSent} sent, ${row.replies} replies, ${row.recipientsSent} recipients sent`,
        );
      }
    }

    doc.end();
  });
}
