import { BadRequestException, Injectable } from '@nestjs/common';
import type { WhatsappConnectionStatus } from '../inbox/whatsapp/entities/user-whatsapp-connection.entity';
import { getSenderRemainingDailyCapacity } from '../whatsapp-sender-connections/utils/sender-daily.util';
import { WhatsappSenderConnectionRepository } from '../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import type { WhatsappCampaignStatus } from './entities/whatsapp-campaign.entity';
import {
  WHATSAPP_DASHBOARD_DEFAULT_DAYS,
  WHATSAPP_DASHBOARD_MAX_DAYS,
  type WhatsappDashboardQueryDto,
} from './dto/whatsapp-dashboard-query.dto';
import type { WhatsappDashboardExportQueryDto } from './dto/whatsapp-dashboard-export-query.dto';
import type { WhatsappDashboardScope } from './types/whatsapp-dashboard-scope.types';
import { renderWhatsappDashboardReportCsv } from './utils/whatsapp-dashboard-report-csv.util';
import {
  buildWhatsappDashboardReportFilename,
  renderWhatsappDashboardReportPdf,
} from './utils/whatsapp-dashboard-report-pdf.util';
import { WhatsappDashboardRepository } from './whatsapp-dashboard.repository';

export interface WhatsappDashboardExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface WhatsappDashboardSummary {
  messagesSent: number;
  replies: number;
  campaignsRunning: number;
  campaignsScheduled: number;
  campaignsCompleted: number;
  campaignsDraft: number;
  campaignsStopped: number;
  sendersReady: number;
  sendersTotal: number;
}

export interface WhatsappDashboardStatusSlice {
  status: string;
  count: number;
}

export interface WhatsappDashboardDailyTrendPoint {
  date: string;
  messagesSent: number;
  replies: number;
}

export interface WhatsappDashboardCampaignRow {
  id: string;
  name: string;
  status: WhatsappCampaignStatus;
  messagesSent: number;
  replies: number;
  recipientsSent: number;
}

export interface WhatsappDashboardSenderRow {
  id: string;
  label: string;
  status: WhatsappConnectionStatus;
  messagesSent: number;
  sendsTodayCount: number;
  dailySendLimit: number | null;
  remainingDailyCapacity: number | null;
}

export interface WhatsappDashboardResponse {
  summary: WhatsappDashboardSummary;
  campaignStatusSlices: WhatsappDashboardStatusSlice[];
  dailySendTrend: WhatsappDashboardDailyTrendPoint[];
  campaigns: WhatsappDashboardCampaignRow[];
  senders: WhatsappDashboardSenderRow[];
  dateFrom: string;
  dateTo: string;
}

export interface WhatsappDashboardDateRange {
  dateFrom: string;
  dateTo: string;
  startUtc: Date;
  endUtcExclusive: Date;
  dateKeys: string[];
}

function parseCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSenderLabel(input: {
  displayName: string | null;
  phone: string | null;
  pushName: string | null;
}): string {
  const display = input.displayName?.trim();
  if (display) {
    return display;
  }
  const phone = input.phone?.trim();
  if (phone) {
    return phone;
  }
  const pushName = input.pushName?.trim();
  if (pushName) {
    return pushName;
  }
  return 'Sender';
}

export function resolveWhatsappDashboardDays(days: number | undefined): number {
  if (days == null || !Number.isFinite(days)) {
    return WHATSAPP_DASHBOARD_DEFAULT_DAYS;
  }
  const rounded = Math.floor(days);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > WHATSAPP_DASHBOARD_MAX_DAYS) {
    return WHATSAPP_DASHBOARD_MAX_DAYS;
  }
  return rounded;
}

function parseIsoDateKey(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return value;
}

function addUtcDays(dateKey: string, days: number): string {
  const cursor = new Date(`${dateKey}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function enumerateDateKeys(dateFrom: string, dateTo: string): string[] {
  const keys: string[] = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    keys.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }
  return keys;
}

export function resolveWhatsappDashboardDateRange(
  query: WhatsappDashboardQueryDto,
  now: Date = new Date(),
): WhatsappDashboardDateRange {
  const hasFrom = Boolean(query.dateFrom?.trim());
  const hasTo = Boolean(query.dateTo?.trim());

  if (hasFrom !== hasTo) {
    throw new BadRequestException(
      'Both dateFrom and dateTo are required for a custom date range',
    );
  }

  let dateFrom: string;
  let dateTo: string;

  if (hasFrom && hasTo) {
    const parsedFrom = parseIsoDateKey(query.dateFrom!.trim());
    const parsedTo = parseIsoDateKey(query.dateTo!.trim());
    if (!parsedFrom || !parsedTo) {
      throw new BadRequestException('Invalid dateFrom or dateTo');
    }
    if (parsedFrom > parsedTo) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
    dateFrom = parsedFrom;
    dateTo = parsedTo;
  } else {
    const days = resolveWhatsappDashboardDays(query.days);
    const end = new Date(now);
    end.setUTCHours(0, 0, 0, 0);
    dateTo = end.toISOString().slice(0, 10);
    dateFrom = addUtcDays(dateTo, -(days - 1));
  }

  const dateKeys = enumerateDateKeys(dateFrom, dateTo);
  if (dateKeys.length > WHATSAPP_DASHBOARD_MAX_DAYS) {
    throw new BadRequestException(
      `Date range cannot exceed ${WHATSAPP_DASHBOARD_MAX_DAYS} days`,
    );
  }

  const startUtc = new Date(`${dateFrom}T00:00:00.000Z`);
  const endUtcExclusive = new Date(`${addUtcDays(dateTo, 1)}T00:00:00.000Z`);

  return {
    dateFrom,
    dateTo,
    startUtc,
    endUtcExclusive,
    dateKeys,
  };
}

export function buildWhatsappDailySendTrend(
  days: number,
  messageRows: { date: string; messagesSent: string }[],
  replyRows: { date: string; replies: string }[],
  now: Date = new Date(),
): WhatsappDashboardDailyTrendPoint[] {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const dateTo = end.toISOString().slice(0, 10);
  const dateFrom = addUtcDays(dateTo, -(days - 1));
  return buildWhatsappDailySendTrendForDateKeys(
    enumerateDateKeys(dateFrom, dateTo),
    messageRows,
    replyRows,
  );
}

export function buildWhatsappDailySendTrendForDateKeys(
  dateKeys: string[],
  messageRows: { date: string; messagesSent: string }[],
  replyRows: { date: string; replies: string }[],
): WhatsappDashboardDailyTrendPoint[] {
  const messageByDate = new Map(
    messageRows.map((row) => [row.date, parseCount(row.messagesSent)]),
  );
  const replyByDate = new Map(
    replyRows.map((row) => [row.date, parseCount(row.replies)]),
  );

  return dateKeys.map((dateKey) => ({
    date: dateKey,
    messagesSent: messageByDate.get(dateKey) ?? 0,
    replies: replyByDate.get(dateKey) ?? 0,
  }));
}

function campaignHasActivityInRange(row: {
  messagesSent: string;
  replies: string;
  recipientsSent: string;
}): boolean {
  return (
    parseCount(row.messagesSent) > 0 ||
    parseCount(row.replies) > 0 ||
    parseCount(row.recipientsSent) > 0
  );
}

@Injectable()
export class WhatsappDashboardService {
  constructor(
    private readonly dashboardRepository: WhatsappDashboardRepository,
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
  ) {}

  async getDashboard(
    organizationId: string,
    userId: string,
    query: WhatsappDashboardQueryDto,
  ): Promise<WhatsappDashboardResponse> {
    const range = resolveWhatsappDashboardDateRange(query);
    const scope: WhatsappDashboardScope = {
      organizationId,
      startUtc: range.startUtc,
      endUtcExclusive: range.endUtcExclusive,
      campaignId: query.campaignId ?? null,
    };

    const [
      summaryRow,
      statusSlices,
      messageTrend,
      replyTrend,
      campaignRows,
      senderConnections,
    ] = await Promise.all([
      this.dashboardRepository.getSummary(scope),
      this.dashboardRepository.getCampaignStatusSlices(scope),
      this.dashboardRepository.getDailyMessageTrend(scope),
      this.dashboardRepository.getDailyReplyTrend(scope),
      this.dashboardRepository.getCampaignBreakdown(scope),
      this.senderConnectionRepository.listByOrgAndUser(organizationId, userId),
    ]);

    const senderIds = senderConnections.map((row) => row.id);
    const senderMessageCounts =
      await this.dashboardRepository.getSenderMessageCounts(scope, senderIds);
    const messagesBySender = new Map(
      senderMessageCounts.map((row) => [
        row.senderConnectionId,
        parseCount(row.messagesSent),
      ]),
    );

    const now = new Date();
    const sendersReady = senderConnections.filter(
      (row) => row.status === 'ready',
    ).length;

    const senders: WhatsappDashboardSenderRow[] = senderConnections.map(
      (row) => ({
        id: row.id,
        label: resolveSenderLabel(row),
        status: row.status,
        messagesSent: messagesBySender.get(row.id) ?? 0,
        sendsTodayCount: row.sendsTodayCount,
        dailySendLimit: row.dailySendLimit,
        remainingDailyCapacity: getSenderRemainingDailyCapacity(row, now),
      }),
    );

    const campaigns = campaignRows
      .filter((row) =>
        scope.campaignId ? true : campaignHasActivityInRange(row),
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status as WhatsappCampaignStatus,
        messagesSent: parseCount(row.messagesSent),
        replies: parseCount(row.replies),
        recipientsSent: parseCount(row.recipientsSent),
      }));

    return {
      summary: {
        messagesSent: parseCount(summaryRow.messagesSent),
        replies: parseCount(summaryRow.replies),
        campaignsRunning: parseCount(summaryRow.campaignsRunning),
        campaignsScheduled: parseCount(summaryRow.campaignsScheduled),
        campaignsCompleted: parseCount(summaryRow.campaignsCompleted),
        campaignsDraft: parseCount(summaryRow.campaignsDraft),
        campaignsStopped: parseCount(summaryRow.campaignsStopped),
        sendersReady,
        sendersTotal: senderConnections.length,
      },
      campaignStatusSlices: statusSlices.map((row) => ({
        status: row.status,
        count: parseCount(row.count),
      })),
      dailySendTrend: buildWhatsappDailySendTrendForDateKeys(
        range.dateKeys,
        messageTrend,
        replyTrend,
      ),
      campaigns,
      senders,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    };
  }

  async exportDashboard(
    organizationId: string,
    userId: string,
    query: WhatsappDashboardExportQueryDto,
  ): Promise<WhatsappDashboardExportResult> {
    const dashboard = await this.getDashboard(organizationId, userId, query);
    const campaignScopeLabel = this.resolveCampaignScopeLabel(
      query.campaignId,
      dashboard.campaigns,
    );
    const filename = buildWhatsappDashboardReportFilename(
      dashboard.dateFrom,
      dashboard.dateTo,
      campaignScopeLabel,
      query.format,
    );

    if (query.format === 'csv') {
      const csv = renderWhatsappDashboardReportCsv(
        dashboard,
        campaignScopeLabel,
      );
      return {
        buffer: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename,
      };
    }

    const pdf = await renderWhatsappDashboardReportPdf(
      dashboard,
      campaignScopeLabel,
    );
    return {
      buffer: pdf,
      contentType: 'application/pdf',
      filename,
    };
  }

  private resolveCampaignScopeLabel(
    campaignId: string | undefined,
    campaigns: WhatsappDashboardCampaignRow[],
  ): string {
    if (!campaignId) {
      return 'All campaigns';
    }
    const match = campaigns.find((row) => row.id === campaignId);
    if (match) {
      return match.name;
    }
    return 'Selected campaign';
  }
}
