import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { requireOrganizationId } from '../common/organization/require-organization-id';
import type { FormSchemaEntity } from './entities/form-schema.entity';
import { FormsRepository } from './forms.repository';
import {
  getFormRegistryEntry,
  isManageableFormKey,
  listManageableFormRegistryEntries,
  requireFormRegistryEntry,
} from './registry/form-registry';
import type { UpdateFormSchemaDto } from './dto/update-form-schema.dto';
import type {
  FormFieldDefinition,
  FormFieldOption,
  FormRegistryListItem,
  FormRegistryListResponse,
  FormSchemaPayload,
  FormTableColumnDefinition,
  ResolvedFormSchemaResponse,
} from './types/form-schema.types';
import {
  extractOrgExtensionFields,
  mergePlatformFieldWithOrgOverlay,
} from './org-extension-fields.util';
import {
  computeRemovedDefinitionKeys,
  getPublishedPlatformFields,
  getPublishedPlatformLayout,
  getPublishedPlatformSteps,
  getPublishedPlatformTableColumns,
  platformSchemaHasUnpublishedChanges,
} from './platform-form-publish.util';
import { validateFormFieldSchema } from './validation/field-schema.validator';
import { validateFormTableColumnSchema } from './validation/table-column-schema.validator';

@Injectable()
export class FormsService {
  constructor(private readonly formsRepository: FormsRepository) {}

  async listRegistryForOrg(
    organizationId: string | null,
  ): Promise<FormRegistryListResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    return this.buildRegistryList(resolvedOrganizationId);
  }

  async listRegistryForPlatform(): Promise<FormRegistryListResponse> {
    return this.buildRegistryList(null);
  }

  async getResolvedSchema(
    formKey: string,
    organizationId: string | null,
  ): Promise<ResolvedFormSchemaResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    requireFormRegistryEntry(formKey);
    return this.resolveSchema(formKey, resolvedOrganizationId);
  }

  async getPlatformSchema(
    formKey: string,
  ): Promise<ResolvedFormSchemaResponse> {
    requireFormRegistryEntry(formKey);
    const platformSchema = await this.ensurePlatformSchema(formKey);

    return this.toPlatformSchemaResponse(formKey, platformSchema);
  }

  async updatePlatformSchema(
    formKey: string,
    dto: UpdateFormSchemaDto,
  ): Promise<ResolvedFormSchemaResponse> {
    this.assertManageableFormKey(formKey);
    const registryEntry = requireFormRegistryEntry(formKey);
    const validatedFields = validateFormFieldSchema(dto.fields);
    const existing = await this.ensurePlatformSchema(formKey);

    if (dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException(
        'This form was updated elsewhere. Refresh the page and try again.',
      );
    }

    existing.fields = validatedFields;
    if (dto.tableColumns !== undefined) {
      existing.tableColumns = validateFormTableColumnSchema(
        dto.tableColumns,
        this.tableColumnValidationOptions(formKey),
      );
    } else if (
      registryEntry.supportsTableColumns &&
      existing.tableColumns.length === 0
    ) {
      existing.tableColumns = registryEntry.defaultSchema.tableColumns ?? [];
    }
    existing.steps = dto.steps ?? existing.steps;
    existing.layout = dto.layout ?? existing.layout;
    existing.version = (dto.version ?? existing.version) + 1;

    const saved = await this.formsRepository.saveSchema(existing);
    return this.toPlatformSchemaResponse(formKey, saved);
  }

  async resetPlatformSchema(
    formKey: string,
  ): Promise<ResolvedFormSchemaResponse> {
    this.assertManageableFormKey(formKey);
    requireFormRegistryEntry(formKey);
    const existing = await this.ensurePlatformSchema(formKey);
    const defaults = this.registryPlatformDefaults(formKey);

    existing.fields = defaults.fields;
    existing.publishedFields = defaults.fields;
    existing.tableColumns = defaults.tableColumns ?? [];
    existing.publishedTableColumns = defaults.tableColumns ?? [];
    existing.steps = defaults.steps ?? null;
    existing.publishedSteps = defaults.steps ?? null;
    existing.layout = defaults.layout ?? null;
    existing.publishedLayout = defaults.layout ?? null;
    existing.version = 1;
    existing.publishedVersion = 1;

    const saved = await this.formsRepository.saveSchema(existing);
    return this.toPlatformSchemaResponse(formKey, saved);
  }

  async publishPlatformSchema(
    formKey: string,
  ): Promise<ResolvedFormSchemaResponse> {
    this.assertManageableFormKey(formKey);
    requireFormRegistryEntry(formKey);
    const existing = await this.ensurePlatformSchema(formKey);
    const previousPublishedFields = existing.publishedFields;
    const previousPublishedTableColumns = existing.publishedTableColumns ?? [];
    const validatedFields = validateFormFieldSchema(existing.fields);
    const validatedTableColumns = validateFormTableColumnSchema(
      existing.tableColumns ?? [],
      this.tableColumnValidationOptions(formKey),
    );

    existing.fields = validatedFields;
    existing.publishedFields = validatedFields;
    existing.publishedTableColumns = validatedTableColumns;
    existing.publishedLayout = existing.layout ?? null;
    existing.publishedSteps = existing.steps ?? null;
    existing.publishedVersion = existing.publishedVersion + 1;

    const saved = await this.formsRepository.saveSchema(existing);

    await this.pruneOrgExtensionsAfterPlatformPublish(
      formKey,
      computeRemovedDefinitionKeys(previousPublishedFields, validatedFields),
      computeRemovedDefinitionKeys(
        previousPublishedTableColumns,
        validatedTableColumns,
      ),
    );
    return this.toPlatformSchemaResponse(formKey, saved);
  }

  async appendOrgExtensionFields(
    formKey: string,
    newFields: FormFieldDefinition[],
    organizationId: string | null,
  ): Promise<ResolvedFormSchemaResponse> {
    this.assertManageableFormKey(formKey);
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const registryEntry = requireFormRegistryEntry(formKey);

    if (!registryEntry.supportsOrgExtensions) {
      throw new BadRequestException(
        `Form "${formKey}" does not support organization extensions`,
      );
    }

    if (newFields.length === 0) {
      return this.resolveSchema(formKey, resolvedOrganizationId);
    }

    const platformSchema = await this.ensurePlatformSchema(formKey);
    const publishedFields = getPublishedPlatformFields(platformSchema);
    const platformKeys = new Set(publishedFields.map((field) => field.key));
    const orgExtension = await this.formsRepository.findOrgExtension(
      formKey,
      resolvedOrganizationId,
    );
    const existingOrgFields = orgExtension?.fields ?? [];
    const usedKeys = new Set([
      ...platformKeys,
      ...existingOrgFields.map((field) => field.key),
    ]);

    for (const field of newFields) {
      if (usedKeys.has(field.key)) {
        throw new BadRequestException(
          `Field key "${field.key}" already exists in this form`,
        );
      }
      usedKeys.add(field.key);
    }

    const validatedNewFields = validateFormFieldSchema(newFields);
    const submittedFields = [
      ...publishedFields,
      ...existingOrgFields,
      ...validatedNewFields,
    ];

    return this.updateOrgExtensions(
      formKey,
      { fields: submittedFields },
      resolvedOrganizationId,
    );
  }

  async updateOrgExtensions(
    formKey: string,
    dto: UpdateFormSchemaDto,
    organizationId: string | null,
  ): Promise<ResolvedFormSchemaResponse> {
    this.assertManageableFormKey(formKey);
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const registryEntry = requireFormRegistryEntry(formKey);

    if (!registryEntry.supportsOrgExtensions) {
      throw new BadRequestException(
        `Form "${formKey}" does not support organization extensions`,
      );
    }

    const platformSchema = await this.ensurePlatformSchema(formKey);
    const publishedFields = getPublishedPlatformFields(platformSchema);
    const publishedTableColumns =
      getPublishedPlatformTableColumns(platformSchema);
    const orgFields = extractOrgExtensionFields(dto.fields, publishedFields);
    const validatedOrgFields = validateFormFieldSchema(orgFields);

    let orgTableColumnsUpdate: FormTableColumnDefinition[] | undefined;
    if (registryEntry.supportsTableColumns && dto.tableColumns !== undefined) {
      const orgTableColumns = this.extractOrgExtensionTableColumns(
        dto.tableColumns,
        publishedTableColumns,
      );
      orgTableColumnsUpdate = validateFormTableColumnSchema(orgTableColumns, {
        requireEmailColumn: false,
      });
    }

    let orgExtension = await this.formsRepository.findOrgExtension(
      formKey,
      resolvedOrganizationId,
    );

    if (!orgExtension) {
      orgExtension = this.formsRepository.createSchema(
        formKey,
        resolvedOrganizationId,
        {
          fields: validatedOrgFields,
          tableColumns: orgTableColumnsUpdate ?? [],
          steps: null,
          layout: null,
        },
      );
    } else {
      orgExtension.fields = validatedOrgFields;
      if (orgTableColumnsUpdate !== undefined) {
        orgExtension.tableColumns = orgTableColumnsUpdate;
      }
      orgExtension.version = (dto.version ?? orgExtension.version) + 1;
    }

    await this.formsRepository.saveSchema(orgExtension);
    return this.resolveSchema(formKey, resolvedOrganizationId);
  }

  async resolveSchema(
    formKey: string,
    organizationId: string,
  ): Promise<ResolvedFormSchemaResponse> {
    const registryEntry = requireFormRegistryEntry(formKey);
    const platformSchema = await this.ensurePlatformSchema(formKey);
    const orgExtension = registryEntry.supportsOrgExtensions
      ? await this.formsRepository.findOrgExtension(formKey, organizationId)
      : null;

    const publishedFields = getPublishedPlatformFields(platformSchema);
    const publishedTableColumns =
      getPublishedPlatformTableColumns(platformSchema);

    const orgExtensionFields = orgExtension?.fields ?? [];
    const overlaysByKey = new Map(
      orgExtensionFields
        .filter((field) =>
          publishedFields.some(
            (platformField) => platformField.key === field.key,
          ),
        )
        .map((field) => [field.key, field]),
    );

    const platformFields = publishedFields.map((field) =>
      mergePlatformFieldWithOrgOverlay(field, overlaysByKey.get(field.key)),
    );

    const orgOnlyFields = orgExtensionFields
      .filter((field) => !publishedFields.some((p) => p.key === field.key))
      .map((field) => ({
        ...field,
        source: 'org' as const,
      }));

    const mergedFields = [...platformFields, ...orgOnlyFields].map(
      (field, index) => ({
        ...field,
        sortOrder: index,
      }),
    );

    const mergedTableColumns = this.mergeTableColumns(
      publishedTableColumns,
      orgExtension?.tableColumns ?? [],
    );

    return {
      formKey,
      fields: mergedFields,
      tableColumns: mergedTableColumns,
      steps: getPublishedPlatformSteps(platformSchema),
      layout: getPublishedPlatformLayout(platformSchema),
      version: Math.max(
        platformSchema.publishedVersion,
        orgExtension?.version ?? 0,
      ),
      publishedVersion: platformSchema.publishedVersion,
    };
  }

  private async pruneOrgExtensionsAfterPlatformPublish(
    formKey: string,
    removedFieldKeys: string[],
    removedTableColumnKeys: string[],
  ): Promise<void> {
    if (removedFieldKeys.length === 0 && removedTableColumnKeys.length === 0) {
      return;
    }

    const removedFieldKeySet = new Set(removedFieldKeys);
    const removedColumnKeySet = new Set(removedTableColumnKeys);
    const orgExtensions =
      await this.formsRepository.findOrgExtensionsByFormKey(formKey);

    for (const orgExtension of orgExtensions) {
      let changed = false;

      if (removedFieldKeySet.size > 0) {
        const nextFields = orgExtension.fields.filter(
          (field) => !removedFieldKeySet.has(field.key),
        );
        if (nextFields.length !== orgExtension.fields.length) {
          orgExtension.fields = nextFields;
          changed = true;
        }
      }

      if (removedColumnKeySet.size > 0) {
        const nextColumns = orgExtension.tableColumns.filter(
          (column) => !removedColumnKeySet.has(column.key),
        );
        if (nextColumns.length !== orgExtension.tableColumns.length) {
          orgExtension.tableColumns = nextColumns;
          changed = true;
        }
      }

      if (changed) {
        await this.formsRepository.saveSchema(orgExtension);
      }
    }
  }

  async resolveSchemaFields(
    formKey: string,
    organizationId: string,
  ): Promise<FormFieldDefinition[]> {
    const resolved = await this.resolveSchema(formKey, organizationId);
    return resolved.fields;
  }

  async getPublishedPipelineStageBaselineOptions(
    formKey: string,
  ): Promise<FormFieldOption[]> {
    requireFormRegistryEntry(formKey);
    const platformSchema = await this.ensurePlatformSchema(formKey);
    const publishedFields = getPublishedPlatformFields(platformSchema);
    const stageField = publishedFields.find(
      (field) => field.pipelineStage === true,
    );

    return stageField?.options ?? [];
  }

  async resolveTableColumns(
    formKey: string,
    organizationId: string,
  ): Promise<FormTableColumnDefinition[]> {
    const resolved = await this.resolveSchema(formKey, organizationId);
    return resolved.tableColumns ?? [];
  }

  private async ensurePlatformSchema(
    formKey: string,
  ): Promise<FormSchemaEntity> {
    const existing = await this.formsRepository.findPlatformSchema(formKey);
    if (existing) {
      return existing;
    }

    const defaults = this.registryPlatformDefaults(formKey);
    const created = this.formsRepository.createSchema(formKey, null, {
      fields: defaults.fields,
      tableColumns: defaults.tableColumns ?? [],
      steps: defaults.steps ?? null,
      layout: defaults.layout ?? null,
      version: 1,
    });
    return this.formsRepository.saveSchema(created);
  }

  private registryPlatformDefaults(formKey: string): FormSchemaPayload {
    const registryEntry = requireFormRegistryEntry(formKey);

    return {
      fields: validateFormFieldSchema(registryEntry.defaultSchema.fields),
      tableColumns: validateFormTableColumnSchema(
        registryEntry.defaultSchema.tableColumns ?? [],
        this.tableColumnValidationOptions(formKey),
      ),
      steps: registryEntry.defaultSchema.steps ?? null,
      layout: registryEntry.defaultSchema.layout ?? null,
    };
  }

  private extractOrgExtensionTableColumns(
    submittedColumns: FormTableColumnDefinition[],
    platformColumns: FormTableColumnDefinition[],
  ): FormTableColumnDefinition[] {
    const platformKeys = new Set(platformColumns.map((column) => column.key));
    const platformByKey = new Map(
      platformColumns.map((column) => [column.key, column]),
    );
    const orgColumns: FormTableColumnDefinition[] = [];

    for (const column of submittedColumns) {
      if (!platformKeys.has(column.key)) {
        orgColumns.push(column);
        continue;
      }

      const platformColumn = platformByKey.get(column.key)!;

      if (platformColumn.system) {
        if (
          column.label !== platformColumn.label ||
          column.type !== platformColumn.type ||
          column.required !== platformColumn.required ||
          column.system !== platformColumn.system
        ) {
          throw new BadRequestException(
            `System table column "${column.key}" cannot be modified by organization`,
          );
        }
        continue;
      }

      const changed =
        column.label !== platformColumn.label ||
        column.type !== platformColumn.type ||
        column.required !== platformColumn.required ||
        column.sortOrder !== platformColumn.sortOrder;

      if (changed) {
        throw new BadRequestException(
          `Platform table column "${column.key}" cannot be modified by organization`,
        );
      }
    }

    const deletedPlatformColumns = platformColumns.filter(
      (platformColumn) =>
        !submittedColumns.some((column) => column.key === platformColumn.key),
    );

    if (deletedPlatformColumns.length > 0) {
      throw new BadRequestException(
        `Platform table columns cannot be removed: ${deletedPlatformColumns.map((column) => column.key).join(', ')}`,
      );
    }

    return orgColumns;
  }

  private mergeTableColumns(
    platformColumns: FormTableColumnDefinition[],
    orgColumns: FormTableColumnDefinition[],
  ): FormTableColumnDefinition[] {
    const orgByKey = new Map(orgColumns.map((column) => [column.key, column]));

    const mergedPlatform = platformColumns.map((column) => ({
      ...column,
      source: 'platform' as const,
    }));

    const orgOnly = orgColumns
      .filter(
        (column) =>
          !platformColumns.some((platform) => platform.key === column.key),
      )
      .map((column) => ({
        ...column,
        source: 'org' as const,
      }));

    return [...mergedPlatform, ...orgOnly]
      .map((column) => {
        const orgOverride = orgByKey.get(column.key);
        if (orgOverride && column.source === 'platform' && !column.system) {
          return { ...column, ...orgOverride, source: 'platform' as const };
        }
        return column;
      })
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((column, index) => ({
        ...column,
        sortOrder: index,
      }));
  }

  private async buildRegistryList(
    organizationId: string | null,
  ): Promise<FormRegistryListResponse> {
    const platformSchemas = await this.formsRepository.findAllPlatformSchemas();
    const platformKeys = new Set(
      platformSchemas.map((schema) => schema.formKey),
    );

    const orgExtensions =
      organizationId === null
        ? []
        : await this.formsRepository.findAllOrgExtensions(organizationId);
    const orgExtensionKeys = new Set(
      orgExtensions.map((schema) => schema.formKey),
    );

    const forms: FormRegistryListItem[] =
      listManageableFormRegistryEntries().map((entry) => ({
        key: entry.key,
        module: entry.module,
        label: entry.label,
        formType: entry.formType,
        supportsOrgExtensions: entry.supportsOrgExtensions,
        supportsTableColumns: entry.supportsTableColumns,
        hideFromOrgRegistry: entry.hideFromOrgRegistry,
        customWidgets: entry.customWidgets,
        hasPlatformSchema: platformKeys.has(entry.key),
        hasOrgExtensions: orgExtensionKeys.has(entry.key),
      }));

    return { forms };
  }

  private assertManageableFormKey(formKey: string): void {
    if (!isManageableFormKey(formKey)) {
      throw new BadRequestException(
        `Form "${formKey}" is not available in Manage Forms`,
      );
    }
  }

  private toResponse(
    formKey: string,
    entity: {
      fields: FormFieldDefinition[];
      tableColumns?: FormTableColumnDefinition[];
      steps: FormSchemaPayload['steps'];
      layout: FormSchemaPayload['layout'];
      version: number;
    },
    source: 'platform' | 'org',
  ): ResolvedFormSchemaResponse {
    return {
      formKey,
      fields: entity.fields.map((field) => ({ ...field, source })),
      tableColumns: (entity.tableColumns ?? []).map((column) => ({
        ...column,
        source,
      })),
      steps: entity.steps,
      layout: entity.layout,
      version: entity.version,
    };
  }

  private toPlatformSchemaResponse(
    formKey: string,
    entity: FormSchemaEntity,
  ): ResolvedFormSchemaResponse {
    return {
      ...this.toResponse(formKey, entity, 'platform'),
      publishedVersion: entity.publishedVersion,
      hasUnpublishedChanges: platformSchemaHasUnpublishedChanges(entity),
      publishedFields: entity.publishedFields.map((field) => ({
        ...field,
        source: 'platform' as const,
      })),
      publishedTableColumns: (entity.publishedTableColumns ?? []).map(
        (column) => ({
          ...column,
          source: 'platform' as const,
        }),
      ),
      publishedLayout: entity.publishedLayout ?? null,
      publishedSteps: entity.publishedSteps ?? null,
    };
  }

  assertFormKeyExists(formKey: string): void {
    if (!getFormRegistryEntry(formKey)) {
      throw new NotFoundException(`Unknown form key: ${formKey}`);
    }
  }

  private tableColumnValidationOptions(formKey: string) {
    return {
      requireEmailColumn: formKey === 'email.list.contact.import',
      requirePhoneColumn: formKey === 'whatsapp.list.contact.import',
    };
  }
}
