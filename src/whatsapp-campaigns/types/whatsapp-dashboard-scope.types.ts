export interface WhatsappDashboardScope {
  organizationId: string;
  startUtc: Date;
  endUtcExclusive: Date;
  campaignId: string | null;
}
