import { Injectable } from '@nestjs/common';
import type { WhatsappContactListMemberEntity } from '../entities/whatsapp-contact-list-member.entity';
import type { WhatsappContactListEntity } from '../entities/whatsapp-contact-list.entity';
import {
  DEFAULT_WHATSAPP_LIST_FIELD_SCHEMA,
  type WhatsappListFieldDefinition,
  type WhatsappListFieldSchema,
} from '../types/whatsapp-list-field-schema';
import type { WhatsappListVisibility } from '../types/whatsapp-list-visibility';

export interface WhatsappContactListResponse {
  id: string;
  name: string;
  contactCount: number;
  visibility: WhatsappListVisibility;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappContactListMemberResponse {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  customFields: Record<string, string>;
  createdAt: string;
}

export interface WhatsappContactListDetailResponse extends WhatsappContactListResponse {
  fieldSchema: WhatsappListFieldSchema;
}

export interface WhatsappContactListMembersPageResponse {
  items: WhatsappContactListMemberResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WhatsappContactListImportResponse {
  list: WhatsappContactListResponse;
  importedCount: number;
  skippedCount: number;
}

export interface WhatsappContactListAppendResponse {
  list: WhatsappContactListResponse;
  importedCount: number;
  skippedCount: number;
  importedPhones: string[];
}

const STANDARD_FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  company: 'Company',
};

@Injectable()
export class WhatsappContactListMapper {
  toResponse(entity: WhatsappContactListEntity): WhatsappContactListResponse {
    return {
      id: entity.id,
      name: entity.name,
      contactCount: entity.contactCount,
      visibility: entity.visibility,
      createdByUserId: entity.createdByUserId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  toDetailResponse(
    entity: WhatsappContactListEntity,
    fieldSchema: WhatsappListFieldSchema,
  ): WhatsappContactListDetailResponse {
    return {
      ...this.toResponse(entity),
      fieldSchema,
    };
  }

  toMemberResponse(
    entity: WhatsappContactListMemberEntity,
  ): WhatsappContactListMemberResponse {
    return {
      id: entity.id,
      phone: entity.phone,
      firstName: entity.firstName,
      lastName: entity.lastName,
      company: entity.company,
      customFields: entity.customFields,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  resolveFieldSchema(
    entity: WhatsappContactListEntity,
    members: WhatsappContactListMemberEntity[],
  ): WhatsappListFieldSchema {
    if (entity.fieldSchema?.phone?.key) {
      return entity.fieldSchema;
    }

    return this.deriveFieldSchemaFromMembers(members);
  }

  deriveFieldSchemaFromMembers(
    members: WhatsappContactListMemberEntity[],
  ): WhatsappListFieldSchema {
    const fields: WhatsappListFieldDefinition[] = [];
    const fieldKeys = new Set<string>();

    for (const key of ['firstName', 'lastName', 'company'] as const) {
      if (members.some((member) => member[key])) {
        fieldKeys.add(key);
        fields.push({
          key,
          label: STANDARD_FIELD_LABELS[key],
        });
      }
    }

    for (const member of members) {
      for (const key of Object.keys(member.customFields ?? {})) {
        if (!fieldKeys.has(key)) {
          fieldKeys.add(key);
          fields.push({ key, label: key });
        }
      }
    }

    return {
      ...DEFAULT_WHATSAPP_LIST_FIELD_SCHEMA,
      fields,
    };
  }
}
