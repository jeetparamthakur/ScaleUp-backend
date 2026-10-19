import { DEFAULT_COMPANY_FIELD_SCHEMA } from '../../companies/types/company-field-schema';
import { DEFAULT_PROSPECT_FIELD_SCHEMA } from '../../prospects/types/prospect-field-schema';
import type {
  FormFieldDefinition,
  FormRegistryEntry,
  FormSchemaPayload,
  FormTableColumnDefinition,
  FormWizardStepDefinition,
} from '../types/form-schema.types';

function field(
  partial: Omit<FormFieldDefinition, 'sortOrder'> & { sortOrder?: number },
  sortOrder: number,
): FormFieldDefinition {
  return {
    showInTable: false,
    showInForm: true,
    ...partial,
    sortOrder: partial.sortOrder ?? sortOrder,
  };
}

function simpleForm(
  entries: Array<
    Omit<FormFieldDefinition, 'sortOrder' | 'id'> & { id?: string }
  >,
): FormSchemaPayload {
  return {
    fields: entries.map((entry, index) =>
      field(
        {
          id:
            entry.id ??
            `00000000-0000-4000-a000-${String(index).padStart(12, '0')}`,
          ...entry,
        },
        index,
      ),
    ),
    steps: null,
    layout: null,
  };
}

function wizardForm(
  steps: FormWizardStepDefinition[],
  fields: FormFieldDefinition[],
): FormSchemaPayload {
  return { fields, steps, layout: null };
}

function tableColumn(
  partial: Omit<FormTableColumnDefinition, 'sortOrder'> & {
    sortOrder?: number;
  },
  sortOrder: number,
): FormTableColumnDefinition {
  return {
    ...partial,
    sortOrder: partial.sortOrder ?? sortOrder,
  };
}

function tableColumnsForm(
  columns: Array<
    Omit<FormTableColumnDefinition, 'sortOrder' | 'id'> & { id?: string }
  >,
): FormSchemaPayload {
  return {
    fields: [],
    tableColumns: columns.map((column, index) =>
      tableColumn(
        {
          id:
            column.id ??
            `00000000-0000-4000-b010-${String(index).padStart(12, '0')}`,
          ...column,
        },
        index,
      ),
    ),
    steps: null,
    layout: null,
  };
}

const CRM_PROSPECT_FIELDS = DEFAULT_PROSPECT_FIELD_SCHEMA.fields.map(
  (f, i) => ({
    ...f,
    sortOrder: i,
  }),
) as FormFieldDefinition[];

const CRM_COMPANY_FIELDS = DEFAULT_COMPANY_FIELD_SCHEMA.fields.map((f, i) => ({
  ...f,
  sortOrder: i,
})) as FormFieldDefinition[];

export const FORM_REGISTRY: FormRegistryEntry[] = [
  {
    key: 'crm.prospect.create',
    module: 'crm',
    label: 'Prospect fields',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: { fields: CRM_PROSPECT_FIELDS, steps: null, layout: null },
  },
  {
    key: 'crm.prospect.detail',
    module: 'crm',
    label: 'Prospect Detail',
    formType: 'inline',
    supportsOrgExtensions: true,
    hideFromOrgRegistry: true,
    defaultSchema: { fields: CRM_PROSPECT_FIELDS, steps: null, layout: null },
  },
  {
    key: 'crm.company.create',
    module: 'crm',
    label: 'Company fields',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: { fields: CRM_COMPANY_FIELDS, steps: null, layout: null },
  },
  {
    key: 'crm.company.detail',
    module: 'crm',
    label: 'Company Detail',
    formType: 'inline',
    supportsOrgExtensions: true,
    hideFromOrgRegistry: true,
    defaultSchema: { fields: CRM_COMPANY_FIELDS, steps: null, layout: null },
  },
  {
    key: 'crm.engagement.log',
    module: 'crm',
    label: 'Log Engagement',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      {
        key: 'type',
        label: 'Engagement Type',
        type: 'select',
        required: true,
        options: [
          { value: 'call', label: 'Call' },
          { value: 'email', label: 'Email' },
          { value: 'meeting', label: 'Meeting' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'outcome',
        label: 'Outcome',
        type: 'select',
        required: true,
        options: [
          { value: 'positive', label: 'Positive' },
          { value: 'neutral', label: 'Neutral' },
          { value: 'negative', label: 'Negative' },
        ],
      },
      {
        key: 'prospectId',
        label: 'Prospect',
        type: 'prospect-search',
        required: true,
      },
      {
        key: 'discussion',
        label: 'Discussion',
        type: 'textarea',
        required: true,
        formColSpan: 12,
      },
    ]),
  },
  {
    key: 'crm.meeting.create',
    module: 'crm',
    label: 'Schedule Meeting',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      { key: 'title', label: 'Title', type: 'text', required: true },
      {
        key: 'prospectId',
        label: 'Prospect',
        type: 'prospect-search',
        required: true,
      },
      {
        key: 'platform',
        label: 'Platform',
        type: 'select',
        required: true,
        options: [
          { value: 'google', label: 'Google Meet' },
          { value: 'outlook', label: 'Outlook' },
          { value: 'zoom', label: 'Zoom' },
        ],
      },
      {
        key: 'scheduledAt',
        label: 'Date & Time',
        type: 'date',
        required: true,
      },
    ]),
  },
  {
    key: 'crm.followup.reschedule',
    module: 'crm',
    label: 'Reschedule Follow-up',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      {
        key: 'followUpDue',
        label: 'Follow-up Date',
        type: 'date',
        required: true,
      },
    ]),
  },
  {
    key: 'crm.followup.mark-done',
    module: 'crm',
    label: 'Mark Follow-up Done',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'notes', label: 'Notes', type: 'textarea', formColSpan: 12 },
      {
        key: 'type',
        label: 'Engagement Type',
        type: 'select',
        required: true,
        options: [
          { value: 'call', label: 'Call' },
          { value: 'email', label: 'Email' },
          { value: 'meeting', label: 'Meeting' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'outcome',
        label: 'Outcome',
        type: 'select',
        required: true,
        options: [
          { value: 'positive', label: 'Positive' },
          { value: 'neutral', label: 'Neutral' },
          { value: 'negative', label: 'Negative' },
          { value: 'no-answer', label: 'No answer' },
        ],
      },
      {
        key: 'discussion',
        label: 'Discussion',
        type: 'textarea',
        required: true,
        formColSpan: 12,
      },
    ]),
  },
  {
    key: 'crm.pipeline.add-stage',
    module: 'crm',
    label: 'Add Pipeline Stage',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'label', label: 'Stage Label', type: 'text', required: true },
      { key: 'color', label: 'Color', type: 'color', required: true },
    ]),
  },
  {
    key: 'crm.pipeline.edit-stage-color',
    module: 'crm',
    label: 'Edit Stage Color',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'color', label: 'Color', type: 'color', required: true },
    ]),
  },
  {
    key: 'crm.company-config-option.create',
    module: 'crm',
    label: 'Company Config Option',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
    ]),
  },
  {
    key: 'crm.location-api-settings',
    module: 'crm',
    label: 'Location API Settings',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        required: true,
        options: [{ value: 'geonames', label: 'GeoNames' }],
      },
      { key: 'username', label: 'Username', type: 'text' },
    ]),
  },
  {
    key: 'email.mailbox.create',
    module: 'email',
    label: 'Add Mailbox',
    formType: 'single',
    supportsOrgExtensions: true,
    customWidgets: ['mailbox-oauth'],
    defaultSchema: simpleForm([
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        required: true,
        options: [
          { value: 'gmail', label: 'Gmail' },
          { value: 'outlook', label: 'Outlook' },
          { value: 'smtp', label: 'SMTP' },
        ],
      },
      { key: 'email', label: 'Email', type: 'email', required: true },
      {
        key: 'displayName',
        label: 'Display Name',
        type: 'text',
        required: true,
      },
      { key: 'fromName', label: 'From Name', type: 'text', required: true },
      {
        key: 'dailySendLimit',
        label: 'Daily Send Limit',
        type: 'number',
        required: true,
      },
      { key: 'warmupEnabled', label: 'Warmup Enabled', type: 'checkbox' },
    ]),
  },
  {
    key: 'email.mailbox.edit',
    module: 'email',
    label: 'Edit Mailbox',
    formType: 'single',
    supportsOrgExtensions: true,
    customWidgets: ['mailbox-oauth'],
    defaultSchema: simpleForm([
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        required: true,
        options: [
          { value: 'gmail', label: 'Gmail' },
          { value: 'outlook', label: 'Outlook' },
          { value: 'smtp', label: 'SMTP' },
        ],
      },
      { key: 'email', label: 'Email', type: 'email', required: true },
      {
        key: 'displayName',
        label: 'Display Name',
        type: 'text',
        required: true,
      },
      { key: 'fromName', label: 'From Name', type: 'text', required: true },
      {
        key: 'dailySendLimit',
        label: 'Daily Send Limit',
        type: 'number',
        required: true,
      },
      { key: 'warmupEnabled', label: 'Warmup Enabled', type: 'checkbox' },
    ]),
  },
  {
    key: 'email.template.create',
    module: 'email',
    label: 'Create Email Template',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      { key: 'name', label: 'Template Name', type: 'text', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        formColSpan: 12,
      },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'single', label: 'Single Email' },
          { value: 'sequence', label: 'Sequence' },
        ],
      },
      {
        key: 'visibility',
        label: 'Visibility',
        type: 'select',
        required: true,
        options: [
          { value: 'private', label: 'Private' },
          { value: 'org', label: 'Organization' },
        ],
      },
      { key: 'isActive', label: 'Active', type: 'checkbox' },
    ]),
  },
  {
    key: 'email.template.edit',
    module: 'email',
    label: 'Edit Email Template',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      { key: 'name', label: 'Template Name', type: 'text', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        formColSpan: 12,
      },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'single', label: 'Single Email' },
          { value: 'sequence', label: 'Sequence' },
        ],
      },
      {
        key: 'visibility',
        label: 'Visibility',
        type: 'select',
        required: true,
        options: [
          { value: 'private', label: 'Private' },
          { value: 'org', label: 'Organization' },
        ],
      },
      { key: 'isActive', label: 'Active', type: 'checkbox' },
    ]),
  },
  {
    key: 'email.config-option.create',
    module: 'email',
    label: 'Email Config Option',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
    ]),
  },
  {
    key: 'email.campaign.create',
    module: 'email',
    label: 'Create Campaign',
    formType: 'wizard',
    supportsOrgExtensions: true,
    customWidgets: ['audience-picker', 'sequence-builder', 'mailbox-senders'],
    defaultSchema: wizardForm(
      [
        {
          id: 'basic',
          label: 'Basic Info',
          sortOrder: 0,
          fieldKeys: ['name', 'type', 'brand', 'region', 'goal'],
        },
        {
          id: 'sequence',
          label: 'Sequence',
          sortOrder: 1,
          widget: 'sequence-builder',
        },
        {
          id: 'audience',
          label: 'Audience',
          sortOrder: 2,
          widget: 'audience-picker',
        },
        {
          id: 'schedule',
          label: 'Schedule',
          sortOrder: 3,
          fieldKeys: [
            'launchDate',
            'dailyBatchSize',
            'timezone',
            'activeWeekdays',
          ],
        },
        {
          id: 'mailboxes',
          label: 'Mailboxes',
          sortOrder: 4,
          widget: 'mailbox-senders',
        },
      ],
      [
        field(
          {
            id: '00000000-0000-4000-b001-000000000001',
            key: 'name',
            label: 'Campaign Name',
            type: 'text',
            required: true,
          },
          0,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000002',
            key: 'type',
            label: 'Type',
            type: 'select',
            options: [],
          },
          1,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000003',
            key: 'brand',
            label: 'Brand',
            type: 'select',
            options: [],
          },
          2,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000004',
            key: 'region',
            label: 'Region',
            type: 'select',
            options: [],
          },
          3,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000005',
            key: 'goal',
            label: 'Goal',
            type: 'textarea',
            formColSpan: 12,
          },
          4,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000006',
            key: 'launchDate',
            label: 'Launch Date',
            type: 'date',
            required: true,
          },
          5,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000007',
            key: 'dailyBatchSize',
            label: 'Daily Batch Size',
            type: 'number',
            required: true,
          },
          6,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000008',
            key: 'timezone',
            label: 'Timezone',
            type: 'text',
            required: true,
          },
          7,
        ),
        field(
          {
            id: '00000000-0000-4000-b001-000000000009',
            key: 'activeWeekdays',
            label: 'Active Weekdays',
            type: 'multiselect',
            options: [
              { value: '0', label: 'Sunday' },
              { value: '1', label: 'Monday' },
              { value: '2', label: 'Tuesday' },
              { value: '3', label: 'Wednesday' },
              { value: '4', label: 'Thursday' },
              { value: '5', label: 'Friday' },
              { value: '6', label: 'Saturday' },
            ],
          },
          8,
        ),
      ],
    ),
  },
  {
    key: 'email.list.contact.add',
    module: 'email',
    label: 'Add Contact to List',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        system: true,
      },
    ]),
  },
  {
    key: 'email.list.manual.add-row',
    module: 'email',
    label: 'Add Manual List Row',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([]),
  },
  {
    key: 'email.list.contact.import',
    module: 'email',
    label: 'Contact List Import Columns',
    formType: 'single',
    supportsOrgExtensions: true,
    supportsTableColumns: true,
    defaultSchema: tableColumnsForm([
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        system: true,
      },
      {
        key: 'first_name',
        label: 'First Name',
        type: 'text',
        required: false,
      },
      {
        key: 'last_name',
        label: 'Last Name',
        type: 'text',
        required: false,
      },
      {
        key: 'company',
        label: 'Company',
        type: 'text',
        required: false,
      },
      {
        key: 'phone',
        label: 'Phone',
        type: 'phone',
        required: false,
      },
    ]),
  },
  {
    key: 'whatsapp.list.contact.import',
    module: 'whatsapp',
    label: 'WhatsApp List Import Columns',
    formType: 'single',
    supportsOrgExtensions: true,
    supportsTableColumns: true,
    defaultSchema: tableColumnsForm([
      {
        key: 'phone',
        label: 'Phone',
        type: 'phone',
        required: true,
        system: true,
      },
      {
        key: 'first_name',
        label: 'First Name',
        type: 'text',
        required: false,
      },
      {
        key: 'last_name',
        label: 'Last Name',
        type: 'text',
        required: false,
      },
      {
        key: 'company',
        label: 'Company',
        type: 'text',
        required: false,
      },
    ]),
  },
  {
    key: 'email.list.manual.import',
    module: 'email',
    label: 'Manual List Import Columns',
    formType: 'single',
    supportsOrgExtensions: true,
    supportsTableColumns: true,
    defaultSchema: tableColumnsForm([]),
  },
  {
    key: 'email.analytics.widget.create',
    module: 'email',
    label: 'Add Analytics Widget',
    formType: 'wizard',
    supportsOrgExtensions: false,
    customWidgets: ['widget-config'],
    defaultSchema: wizardForm(
      [
        {
          id: 'type',
          label: 'Widget Type',
          sortOrder: 0,
          fieldKeys: ['widgetType'],
        },
        {
          id: 'config',
          label: 'Configuration',
          sortOrder: 1,
          widget: 'widget-config',
        },
      ],
      [
        field(
          {
            id: '00000000-0000-4000-b002-000000000001',
            key: 'widgetType',
            label: 'Widget Type',
            type: 'select',
            required: true,
            options: [
              { value: 'metric', label: 'Metric' },
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ],
          },
          0,
        ),
        field(
          {
            id: '00000000-0000-4000-b002-000000000002',
            key: 'title',
            label: 'Title',
            type: 'text',
            required: true,
          },
          1,
        ),
      ],
    ),
  },
  {
    key: 'email.analytics.dashboard.new',
    module: 'email',
    label: 'New Dashboard',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'name', label: 'Dashboard Name', type: 'text', required: true },
      {
        key: 'visibility',
        label: 'Visibility',
        type: 'select',
        required: true,
        options: [
          { value: 'private', label: 'Private — only you' },
          { value: 'org', label: 'Shared with organization' },
        ],
      },
    ]),
  },
  {
    key: 'email.analytics.dashboard.rename',
    module: 'email',
    label: 'Rename Dashboard',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'name', label: 'Dashboard Name', type: 'text', required: true },
    ]),
  },
  {
    key: 'email.campaign.custom-field.add',
    module: 'email',
    label: 'Add Campaign Custom Field',
    formType: 'single',
    supportsOrgExtensions: true,
    defaultSchema: simpleForm([
      { key: 'label', label: 'Field Label', type: 'text', required: true },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'text', label: 'Text' },
          { value: 'select', label: 'Select' },
        ],
      },
    ]),
  },
  {
    key: 'settings.invite-member',
    module: 'settings',
    label: 'Invite Team Member',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'roleId', label: 'Role', type: 'role-picker', required: true },
      {
        key: 'hierarchyLevel',
        label: 'Hierarchy Level',
        type: 'number',
        required: true,
      },
    ]),
  },
  {
    key: 'settings.edit-member',
    module: 'settings',
    label: 'Edit Team Member',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'roleId', label: 'Role', type: 'role-picker', required: true },
      {
        key: 'hierarchyLevel',
        label: 'Hierarchy Level',
        type: 'number',
        required: true,
      },
    ]),
  },
  {
    key: 'settings.role.create',
    module: 'settings',
    label: 'Create Role',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'name', label: 'Name', type: 'text', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        formColSpan: 12,
      },
      {
        key: 'permissionIds',
        label: 'Permissions',
        type: 'permission-matrix',
        required: true,
        formColSpan: 12,
      },
    ]),
  },
  {
    key: 'settings.role.edit',
    module: 'settings',
    label: 'Edit Role',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'name', label: 'Name', type: 'text', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        formColSpan: 12,
      },
      {
        key: 'permissionIds',
        label: 'Permissions',
        type: 'permission-matrix',
        required: true,
        formColSpan: 12,
      },
    ]),
  },
  {
    key: 'settings.abac-policy.create',
    module: 'settings',
    label: 'Create ABAC Policy',
    formType: 'single',
    supportsOrgExtensions: false,
    customWidgets: ['abac-conditions'],
    defaultSchema: simpleForm([
      { key: 'name', label: 'Policy Name', type: 'text', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        formColSpan: 12,
      },
      {
        key: 'effect',
        label: 'Effect',
        type: 'select',
        required: true,
        options: [
          { value: 'allow', label: 'Allow' },
          { value: 'deny', label: 'Deny' },
        ],
      },
    ]),
  },
  {
    key: 'settings.abac-policy.edit',
    module: 'settings',
    label: 'Edit ABAC Policy',
    formType: 'single',
    supportsOrgExtensions: false,
    customWidgets: ['abac-conditions'],
    defaultSchema: simpleForm([
      { key: 'name', label: 'Policy Name', type: 'text', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        formColSpan: 12,
      },
      {
        key: 'effect',
        label: 'Effect',
        type: 'select',
        required: true,
        options: [
          { value: 'allow', label: 'Allow' },
          { value: 'deny', label: 'Deny' },
        ],
      },
    ]),
  },
  {
    key: 'settings.bant',
    module: 'settings',
    label: 'BANT Settings',
    formType: 'single',
    supportsOrgExtensions: true,
    customWidgets: ['bant-criteria'],
    defaultSchema: simpleForm([
      {
        key: 'hotThreshold',
        label: 'Hot Threshold',
        type: 'number',
        required: true,
      },
      {
        key: 'warmThreshold',
        label: 'Warm Threshold',
        type: 'number',
        required: true,
      },
    ]),
  },
  {
    key: 'website.property.create',
    module: 'website',
    label: 'Add Website Property',
    formType: 'wizard',
    supportsOrgExtensions: false,
    defaultSchema: wizardForm(
      [
        {
          id: 'basic',
          label: 'Basic Info',
          sortOrder: 0,
          fieldKeys: ['name', 'url'],
        },
        {
          id: 'integrations',
          label: 'Integrations',
          sortOrder: 1,
          fieldKeys: ['googleConnectionId'],
        },
        { id: 'review', label: 'Review', sortOrder: 2 },
      ],
      [
        field(
          {
            id: '00000000-0000-4000-c001-000000000001',
            key: 'name',
            label: 'Property Name',
            type: 'text',
            required: true,
          },
          0,
        ),
        field(
          {
            id: '00000000-0000-4000-c001-000000000002',
            key: 'url',
            label: 'Website URL',
            type: 'text',
            required: true,
          },
          1,
        ),
        field(
          {
            id: '00000000-0000-4000-c001-000000000003',
            key: 'googleConnectionId',
            label: 'Google Connection',
            type: 'select',
            options: [],
          },
          2,
        ),
      ],
    ),
  },
  {
    key: 'website.google-oauth-app',
    module: 'website',
    label: 'Google OAuth App',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
      },
    ]),
  },
  {
    key: 'website.psi-api-key',
    module: 'website',
    label: 'PSI API Key',
    formType: 'single',
    supportsOrgExtensions: false,
    defaultSchema: simpleForm([
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ]),
  },
];

/** Forms editable via org Settings → Manage Forms and Platform → Forms. */
export const MANAGEABLE_FORM_KEYS = [
  'crm.prospect.create',
  'crm.company.create',
  'email.list.contact.add',
  'whatsapp.list.contact.import',
  'crm.meeting.create',
  'settings.bant',
  'crm.engagement.log',
] as const;

export type ManageableFormKey = (typeof MANAGEABLE_FORM_KEYS)[number];

const MANAGEABLE_FORM_KEY_SET = new Set<string>(MANAGEABLE_FORM_KEYS);

export function isManageableFormKey(formKey: string): boolean {
  return MANAGEABLE_FORM_KEY_SET.has(formKey);
}

const REGISTRY_MAP = new Map(FORM_REGISTRY.map((entry) => [entry.key, entry]));

export function getFormRegistryEntry(
  formKey: string,
): FormRegistryEntry | undefined {
  return REGISTRY_MAP.get(formKey);
}

export function requireFormRegistryEntry(formKey: string): FormRegistryEntry {
  const entry = getFormRegistryEntry(formKey);
  if (!entry) {
    throw new Error(`Unknown form key: ${formKey}`);
  }
  return entry;
}

export function listFormRegistryEntries(): FormRegistryEntry[] {
  return [...FORM_REGISTRY];
}

export function listManageableFormRegistryEntries(): FormRegistryEntry[] {
  return MANAGEABLE_FORM_KEYS.map((key) => requireFormRegistryEntry(key));
}
