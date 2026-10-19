import type { WhatsappDashboardResponse } from '../whatsapp-dashboard.service';

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvRow(cells: string[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function renderWhatsappDashboardReportCsv(
  data: WhatsappDashboardResponse,
  campaignScopeLabel: string,
): string {
  const lines: string[] = [
    csvRow(['WhatsApp dashboard report']),
    csvRow(['Generated', new Date().toISOString()]),
    csvRow(['Date range', `${data.dateFrom} to ${data.dateTo}`]),
    csvRow(['Campaign scope', campaignScopeLabel]),
    '',
    csvRow(['Summary']),
    csvRow(['Messages sent', String(data.summary.messagesSent)]),
    csvRow(['Replies', String(data.summary.replies)]),
    csvRow(['Running campaigns', String(data.summary.campaignsRunning)]),
    csvRow(['Scheduled campaigns', String(data.summary.campaignsScheduled)]),
    csvRow(['Completed campaigns', String(data.summary.campaignsCompleted)]),
    csvRow(['Draft campaigns', String(data.summary.campaignsDraft)]),
    csvRow(['Stopped campaigns', String(data.summary.campaignsStopped)]),
    '',
    csvRow(['Daily trend']),
    csvRow(['Date', 'Messages sent', 'Replies']),
    ...data.dailySendTrend.map((point) =>
      csvRow([point.date, String(point.messagesSent), String(point.replies)]),
    ),
    '',
    csvRow(['Campaign breakdown']),
    csvRow([
      'Campaign',
      'Status',
      'Messages sent',
      'Replies',
      'Recipients sent',
    ]),
    ...data.campaigns.map((row) =>
      csvRow([
        row.name,
        row.status,
        String(row.messagesSent),
        String(row.replies),
        String(row.recipientsSent),
      ]),
    ),
  ];

  return `\uFEFF${lines.join('\n')}`;
}
