export interface WhatsappListFieldDefinition {
  key: string;
  label: string;
}

export interface WhatsappListFieldSchema {
  phone: WhatsappListFieldDefinition;
  fields: WhatsappListFieldDefinition[];
}

export const DEFAULT_WHATSAPP_LIST_FIELD_SCHEMA: WhatsappListFieldSchema = {
  phone: { key: 'phone', label: 'Phone' },
  fields: [],
};
