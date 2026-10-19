import type { FormTableColumnDefinition } from '../../forms/types/form-schema.types';
import type { FieldStoredValue } from '../../common/location/location-field.types';
import type { ProspectFieldDefinition } from '../../prospects/types/prospect-field-schema';
import type { WhatsappListMemberInsert } from '../whatsapp-contact-lists.repository';
import { normalizeWhatsappPhone } from './normalize-whatsapp-phone.util';

const RESERVED_KEY_ALIASES: Record<
  string,
  'firstName' | 'lastName' | 'company'
> = {
  firstname: 'firstName',
  lastname: 'lastName',
  company: 'company',
};

export interface ProspectForWhatsappListImport {
  fullName: string;
  values: Record<string, FieldStoredValue>;
}

function normalizeFieldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function getReservedStandardKey(
  key: string,
): 'firstName' | 'lastName' | 'company' | null {
  return RESERVED_KEY_ALIASES[normalizeFieldKey(key)] ?? null;
}

function fieldValueToString(value: FieldStoredValue | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return '';
  }

  return String(value).trim();
}

export function resolveProspectPhoneRaw(
  prospect: ProspectForWhatsappListImport,
  prospectFields: ProspectFieldDefinition[],
): string {
  const phoneFieldKeys = prospectFields
    .filter((field) => field.type === 'phone')
    .map((field) => field.key);

  for (const key of phoneFieldKeys) {
    const raw = fieldValueToString(prospect.values[key]);
    if (raw) {
      return raw;
    }
  }

  return '';
}

export function mapProspectToWhatsappListMember(
  prospect: ProspectForWhatsappListImport,
  tableColumns: FormTableColumnDefinition[],
  prospectFields: ProspectFieldDefinition[],
): WhatsappListMemberInsert | null {
  const rawPhone = resolveProspectPhoneRaw(prospect, prospectFields);
  const phone = rawPhone ? normalizeWhatsappPhone(rawPhone) : null;

  if (!phone) {
    return null;
  }

  const phoneColumnKey =
    tableColumns.find((column) => column.type === 'phone')?.key ?? 'phone';

  const nameParts = prospect.fullName.trim().split(/\s+/).filter(Boolean);
  const defaultFirstName = nameParts[0] ?? '';
  const defaultLastName = nameParts.slice(1).join(' ');

  const member: WhatsappListMemberInsert = {
    phone,
    firstName: null,
    lastName: null,
    company: null,
    customFields: {},
  };

  for (const column of tableColumns) {
    if (column.key === phoneColumnKey) {
      continue;
    }

    const reserved = getReservedStandardKey(column.key);
    let value = fieldValueToString(prospect.values[column.key]);

    if (!value && reserved === 'firstName') {
      value = defaultFirstName;
    } else if (!value && reserved === 'lastName') {
      value = defaultLastName;
    }

    if (!value) {
      continue;
    }

    switch (reserved) {
      case 'firstName':
        member.firstName = value;
        break;
      case 'lastName':
        member.lastName = value;
        break;
      case 'company':
        member.company = value;
        break;
      default:
        member.customFields[column.key.trim()] = value;
    }
  }

  return member;
}

export interface BuildWhatsappMembersFromProspectIdsResult {
  members: WhatsappListMemberInsert[];
  skippedCount: number;
}

export function buildWhatsappMembersFromProspectIds(
  prospectIds: string[],
  prospectsById: Map<string, ProspectForWhatsappListImport>,
  tableColumns: FormTableColumnDefinition[],
  prospectFields: ProspectFieldDefinition[],
): BuildWhatsappMembersFromProspectIdsResult {
  let skippedCount = prospectIds.length;

  const uniqueIds: string[] = [];
  const seenIds = new Set<string>();

  for (const id of prospectIds) {
    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    uniqueIds.push(id);
  }

  skippedCount -= uniqueIds.length;

  const members: WhatsappListMemberInsert[] = [];
  const seenPhones = new Set<string>();

  for (const id of uniqueIds) {
    const prospect = prospectsById.get(id);

    if (!prospect) {
      skippedCount += 1;
      continue;
    }

    const member = mapProspectToWhatsappListMember(
      prospect,
      tableColumns,
      prospectFields,
    );

    if (!member) {
      skippedCount += 1;
      continue;
    }

    if (seenPhones.has(member.phone)) {
      skippedCount += 1;
      continue;
    }

    seenPhones.add(member.phone);
    members.push(member);
  }

  return { members, skippedCount };
}
