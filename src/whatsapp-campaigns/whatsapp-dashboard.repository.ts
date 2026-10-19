import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { WhatsappDashboardScope } from './types/whatsapp-dashboard-scope.types';

export interface RawWhatsappDashboardSummaryRow {
  messagesSent: string;
  replies: string;
  campaignsRunning: string;
  campaignsScheduled: string;
  campaignsCompleted: string;
  campaignsDraft: string;
  campaignsStopped: string;
}

export interface RawWhatsappCampaignStatusSliceRow {
  status: string;
  count: string;
}

export interface RawWhatsappDailySendTrendRow {
  date: string;
  messagesSent: string;
}

export interface RawWhatsappDailyReplyTrendRow {
  date: string;
  replies: string;
}

export interface RawWhatsappCampaignBreakdownRow {
  id: string;
  name: string;
  status: string;
  messagesSent: string;
  replies: string;
  recipientsSent: string;
}

export interface RawWhatsappSenderMessageCountRow {
  senderConnectionId: string;
  messagesSent: string;
}

function scopeSqlParams(
  scope: WhatsappDashboardScope,
): [string, Date, Date, string | null] {
  return [
    scope.organizationId,
    scope.startUtc,
    scope.endUtcExclusive,
    scope.campaignId,
  ];
}

@Injectable()
export class WhatsappDashboardRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getSummary(
    scope: WhatsappDashboardScope,
  ): Promise<RawWhatsappDashboardSummaryRow> {
    const params = scopeSqlParams(scope);
    const rows = await this.dataSource.query<RawWhatsappDashboardSummaryRow[]>(
      `
        SELECT
          COALESCE(msg.messages_sent, 0)::text AS "messagesSent",
          COALESCE(rep.replies, 0)::text AS "replies",
          COALESCE(st.campaigns_running, 0)::text AS "campaignsRunning",
          COALESCE(st.campaigns_scheduled, 0)::text AS "campaignsScheduled",
          COALESCE(st.campaigns_completed, 0)::text AS "campaignsCompleted",
          COALESCE(st.campaigns_draft, 0)::text AS "campaignsDraft",
          COALESCE(st.campaigns_stopped, 0)::text AS "campaignsStopped"
        FROM (SELECT 1) AS anchor
        LEFT JOIN (
          SELECT COUNT(m.id) AS messages_sent
          FROM whatsapp_campaign_messages m
          INNER JOIN whatsapp_campaign_recipients r ON r.id = m.recipient_id
          INNER JOIN whatsapp_campaigns c ON c.id = r.campaign_id
          WHERE c.organization_id = $1
            AND m.created_at >= $2
            AND m.created_at < $3
            AND ($4::uuid IS NULL OR c.id = $4::uuid)
        ) msg ON TRUE
        LEFT JOIN (
          SELECT COUNT(*) AS replies
          FROM whatsapp_campaign_recipients r
          INNER JOIN whatsapp_campaigns c ON c.id = r.campaign_id
          WHERE c.organization_id = $1
            AND r.replied_at IS NOT NULL
            AND r.replied_at >= $2
            AND r.replied_at < $3
            AND ($4::uuid IS NULL OR c.id = $4::uuid)
        ) rep ON TRUE
        LEFT JOIN (
          SELECT
            COUNT(*) FILTER (WHERE status = 'sending') AS campaigns_running,
            COUNT(*) FILTER (WHERE status = 'scheduled') AS campaigns_scheduled,
            COUNT(*) FILTER (WHERE status = 'completed') AS campaigns_completed,
            COUNT(*) FILTER (WHERE status = 'draft') AS campaigns_draft,
            COUNT(*) FILTER (WHERE status = 'stopped') AS campaigns_stopped
          FROM whatsapp_campaigns
          WHERE organization_id = $1
            AND ($4::uuid IS NULL OR id = $4::uuid)
        ) st ON TRUE
      `,
      params,
    );

    return (
      rows[0] ?? {
        messagesSent: '0',
        replies: '0',
        campaignsRunning: '0',
        campaignsScheduled: '0',
        campaignsCompleted: '0',
        campaignsDraft: '0',
        campaignsStopped: '0',
      }
    );
  }

  getCampaignStatusSlices(
    scope: Pick<WhatsappDashboardScope, 'organizationId' | 'campaignId'>,
  ): Promise<RawWhatsappCampaignStatusSliceRow[]> {
    return this.dataSource.query<RawWhatsappCampaignStatusSliceRow[]>(
      `
        SELECT status, COUNT(*)::text AS count
        FROM whatsapp_campaigns
        WHERE organization_id = $1
          AND ($2::uuid IS NULL OR id = $2::uuid)
        GROUP BY status
        ORDER BY status
      `,
      [scope.organizationId, scope.campaignId],
    );
  }

  getDailyMessageTrend(
    scope: WhatsappDashboardScope,
  ): Promise<RawWhatsappDailySendTrendRow[]> {
    const params = scopeSqlParams(scope);
    return this.dataSource.query<RawWhatsappDailySendTrendRow[]>(
      `
        SELECT
          TO_CHAR(DATE(m.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
          COUNT(m.id)::text AS "messagesSent"
        FROM whatsapp_campaign_messages m
        INNER JOIN whatsapp_campaign_recipients r ON r.id = m.recipient_id
        INNER JOIN whatsapp_campaigns c ON c.id = r.campaign_id
        WHERE c.organization_id = $1
          AND m.created_at >= $2
          AND m.created_at < $3
          AND ($4::uuid IS NULL OR c.id = $4::uuid)
        GROUP BY DATE(m.created_at AT TIME ZONE 'UTC')
        ORDER BY DATE(m.created_at AT TIME ZONE 'UTC')
      `,
      params,
    );
  }

  getDailyReplyTrend(
    scope: WhatsappDashboardScope,
  ): Promise<RawWhatsappDailyReplyTrendRow[]> {
    const params = scopeSqlParams(scope);
    return this.dataSource.query<RawWhatsappDailyReplyTrendRow[]>(
      `
        SELECT
          TO_CHAR(DATE(r.replied_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
          COUNT(*)::text AS replies
        FROM whatsapp_campaign_recipients r
        INNER JOIN whatsapp_campaigns c ON c.id = r.campaign_id
        WHERE c.organization_id = $1
          AND r.replied_at IS NOT NULL
          AND r.replied_at >= $2
          AND r.replied_at < $3
          AND ($4::uuid IS NULL OR c.id = $4::uuid)
        GROUP BY DATE(r.replied_at AT TIME ZONE 'UTC')
        ORDER BY DATE(r.replied_at AT TIME ZONE 'UTC')
      `,
      params,
    );
  }

  getCampaignBreakdown(
    scope: WhatsappDashboardScope,
  ): Promise<RawWhatsappCampaignBreakdownRow[]> {
    const params = scopeSqlParams(scope);
    return this.dataSource.query<RawWhatsappCampaignBreakdownRow[]>(
      `
        SELECT
          c.id AS id,
          c.name AS name,
          c.status AS status,
          COALESCE(msg.messages_sent, 0)::text AS "messagesSent",
          COALESCE(rec.replies, 0)::text AS replies,
          COALESCE(rec.recipients_sent, 0)::text AS "recipientsSent"
        FROM whatsapp_campaigns c
        LEFT JOIN (
          SELECT
            r.campaign_id,
            COUNT(m.id) AS messages_sent
          FROM whatsapp_campaign_messages m
          INNER JOIN whatsapp_campaign_recipients r ON r.id = m.recipient_id
          INNER JOIN whatsapp_campaigns camp ON camp.id = r.campaign_id
          WHERE camp.organization_id = $1
            AND m.created_at >= $2
            AND m.created_at < $3
            AND ($4::uuid IS NULL OR camp.id = $4::uuid)
          GROUP BY r.campaign_id
        ) msg ON msg.campaign_id = c.id
        LEFT JOIN (
          SELECT
            r.campaign_id,
            COUNT(*) FILTER (
              WHERE r.replied_at IS NOT NULL
                AND r.replied_at >= $2
                AND r.replied_at < $3
            ) AS replies,
            COUNT(*) FILTER (
              WHERE r.sent_at IS NOT NULL
                AND r.sent_at >= $2
                AND r.sent_at < $3
                AND r.status IN ('sent', 'replied')
            ) AS recipients_sent
          FROM whatsapp_campaign_recipients r
          INNER JOIN whatsapp_campaigns camp ON camp.id = r.campaign_id
          WHERE camp.organization_id = $1
            AND ($4::uuid IS NULL OR camp.id = $4::uuid)
          GROUP BY r.campaign_id
        ) rec ON rec.campaign_id = c.id
        WHERE c.organization_id = $1
          AND ($4::uuid IS NULL OR c.id = $4::uuid)
        ORDER BY c.created_at DESC
      `,
      params,
    );
  }

  getSenderMessageCounts(
    scope: WhatsappDashboardScope,
    senderConnectionIds: string[],
  ): Promise<RawWhatsappSenderMessageCountRow[]> {
    if (senderConnectionIds.length === 0) {
      return Promise.resolve([]);
    }

    const params = [...scopeSqlParams(scope), senderConnectionIds];
    return this.dataSource.query<RawWhatsappSenderMessageCountRow[]>(
      `
        SELECT
          r.sender_connection_id AS "senderConnectionId",
          COUNT(m.id)::text AS "messagesSent"
        FROM whatsapp_campaign_messages m
        INNER JOIN whatsapp_campaign_recipients r ON r.id = m.recipient_id
        INNER JOIN whatsapp_campaigns c ON c.id = r.campaign_id
        WHERE c.organization_id = $1
          AND m.created_at >= $2
          AND m.created_at < $3
          AND ($4::uuid IS NULL OR c.id = $4::uuid)
          AND r.sender_connection_id = ANY($5::uuid[])
        GROUP BY r.sender_connection_id
      `,
      params,
    );
  }
}
