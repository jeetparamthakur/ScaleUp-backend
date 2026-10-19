import type { FieldValidationType } from '../../common/field-schema/field-validation.types';
import type {
  LocationComponent,
  LocationInputMode,
} from '../../common/location/location-field.types';

export type FormModule = 'crm' | 'email' | 'settings' | 'website' | 'whatsapp';

export type FormType = 'single' | 'wizard' | 'inline';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'password'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'location'
  | 'company-category'
  | 'company-location'
  | 'section'
  | 'rich-text'
  | 'role-picker'
  | 'permission-matrix'
  | 'prospect-search'
  | 'list-picker'
  | 'mailbox-picker'
  | 'color';

export interface FormFieldOption {
  value: string;
  label: string;
  color?: string;
  /** Set on resolved pipeline stages only; never persisted in org extensions. */
  source?: 'platform' | 'org';
}

export type FormTableColumnType =
  'text' | 'email' | 'phone' | 'number' | 'date';

export interface FormTableColumnDefinition {
  id: string;
  key: string;
  label: string;
  type: FormTableColumnType;
  required: boolean;
  sortOrder: number;
  system?: boolean;
  source?: 'platform' | 'org';
}

export type FormFieldValidationType = FieldValidationType;

export interface FormFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  validationType?: FormFieldValidationType;
  sortOrder: number;
  showInTable?: boolean;
  showInForm?: boolean;
  filterable?: boolean;
  options?: FormFieldOption[];
  /** Read-only CRM display: render option values as chips (select / multiselect). */
  displayOptionsAsChips?: boolean;
  locationComponents?: LocationComponent[];
  locationInputMode?: LocationInputMode;
  sectionId?: string;
  system?: boolean;
  pipelineStage?: boolean;
  editableOnDetail?: boolean;
  formColSpan?: number;
  placeholder?: string;
  helpText?: string;
  source?: 'platform' | 'org';
  /** Org custom fields: prevents layout moves and property edits until unlocked. */
  layoutLocked?: boolean;
  /** Section fields only: `main` = outer block; `sub` = inner subsection header. */
  sectionTier?: 'main' | 'sub';
}

export interface FormWizardStepDefinition {
  id: string;
  label: string;
  sortOrder: number;
  widget?: string;
  fieldKeys?: string[];
}

export interface FormLayoutConfig {
  columns?: number;
}

export interface FormSchemaPayload {
  fields: FormFieldDefinition[];
  tableColumns?: FormTableColumnDefinition[];
  steps?: FormWizardStepDefinition[] | null;
  layout?: FormLayoutConfig | null;
  version?: number;
}

export interface FormRegistryEntry {
  key: string;
  module: FormModule;
  label: string;
  formType: FormType;
  supportsOrgExtensions: boolean;
  supportsTableColumns?: boolean;
  hideFromOrgRegistry?: boolean;
  customWidgets?: string[];
  defaultSchema: FormSchemaPayload;
}

export interface ResolvedFormSchemaResponse extends FormSchemaPayload {
  formKey: string;
  fieldKeysInUse?: string[];
  publishedVersion?: number;
  hasUnpublishedChanges?: boolean;
  /** Platform editor: live snapshot orgs see after publish. */
  publishedFields?: FormFieldDefinition[];
  publishedTableColumns?: FormTableColumnDefinition[];
  publishedLayout?: FormLayoutConfig | null;
  publishedSteps?: FormWizardStepDefinition[] | null;
}

export interface FormRegistryListItem {
  key: string;
  module: FormModule;
  label: string;
  formType: FormType;
  supportsOrgExtensions: boolean;
  supportsTableColumns?: boolean;
  hideFromOrgRegistry?: boolean;
  customWidgets?: string[];
  hasPlatformSchema: boolean;
  hasOrgExtensions: boolean;
}

export interface FormRegistryListResponse {
  forms: FormRegistryListItem[];
}
