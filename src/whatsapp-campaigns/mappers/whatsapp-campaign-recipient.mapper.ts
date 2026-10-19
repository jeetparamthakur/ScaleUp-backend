import { Injectable } from '@nestjs/common';
import { WhatsappContactListMemberEntity } from '../../whatsapp-contact-lists/entities/whatsapp-contact-list-member.entity';
import type { WhatsappCampaignRecipientEntity } from '../entities/whatsapp-campaign-recipient.entity';

export interface WhatsappCampaignRecipientResponse {
  id: string;
  phoneE164: string;
  status: WhatsappCampaignRecipientEntity['status'];
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  replyBody: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface WhatsappCampaignReplyResponse {
  recipientId: string;
  phoneE164: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sentAt: string | null;
  repliedAt: string;
  replyBody: string | null;
}

export interface PaginatedWhatsappCampaignRecipientsResponse {
  items: WhatsappCampaignRecipientResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedWhatsappCampaignRepliesResponse {
  items: WhatsappCampaignReplyResponse[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class WhatsappCampaignRecipientMapper {
  toRecipientResponse(
    recipient: WhatsappCampaignRecipientEntity,
    member: WhatsappContactListMemberEntity | null,
  ): WhatsappCampaignRecipientResponse {
    return {
      id: recipient.id,
      phoneE164: recipient.phoneE164,
      status: recipient.status,
      firstName: member?.firstName ?? null,
      lastName: member?.lastName ?? null,
      company: member?.company ?? null,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      repliedAt: recipient.repliedAt?.toISOString() ?? null,
      replyBody: recipient.replyBody,
      lastError: recipient.lastError,
      createdAt: recipient.createdAt.toISOString(),
    };
  }

  toReplyResponse(
    recipient: WhatsappCampaignRecipientEntity,
    member: WhatsappContactListMemberEntity | null,
  ): WhatsappCampaignReplyResponse {
    const firstName = member?.firstName ?? null;
    const lastName = member?.lastName ?? null;
    const company = member?.company ?? null;
    const nameParts = [firstName, lastName].filter(Boolean);
    const displayName =
      nameParts.length > 0
        ? nameParts.join(' ')
        : (company ?? recipient.phoneE164);

    return {
      recipientId: recipient.id,
      phoneE164: recipient.phoneE164,
      displayName,
      firstName,
      lastName,
      company,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      repliedAt: recipient.repliedAt!.toISOString(),
      replyBody: recipient.replyBody,
    };
  }

  buildMemberMap(
    members: WhatsappContactListMemberEntity[],
  ): Map<string, WhatsappContactListMemberEntity> {
    return new Map(members.map((member) => [member.id, member]));
  }
}
