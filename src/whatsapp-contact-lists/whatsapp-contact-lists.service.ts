import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { hasPermission } from '../auth/auth-access.utils';
import { requireOrganizationId } from '../common/organization/require-organization-id';
import {
  FileParserService,
  type ImportPreviewResult,
} from '../common/file-parser/file-parser.service';
import { FormsService } from '../forms/forms.service';
import { OrgEntitlementsService } from '../org-entitlements/org-entitlements.service';
import { ProspectsRepository } from '../prospects/prospects.repository';
import { DEFAULT_PROSPECT_FIELD_SCHEMA } from '../prospects/types/prospect-field-schema';
import type { ProspectFieldDefinition } from '../prospects/types/prospect-field-schema';
import { assertRequiredTableColumnsMapped } from '../forms/validation/table-column-schema.validator';
import type { FormTableColumnDefinition } from '../forms/types/form-schema.types';
import type {
  AppendWhatsappListFromProspectsDto,
  ImportWhatsappListFromProspectsDto,
} from './dto/whatsapp-list-prospect-import.dto';
import type {
  AppendWhatsappListImportDto,
  CreateWhatsappContactListDto,
  CreateWhatsappListMemberDto,
  UpdateWhatsappContactListDto,
  WhatsappListMembersQueryDto,
} from './dto/whatsapp-list-detail.dto';
import type {
  CreateWhatsappListImportDto,
  WhatsappAdditionalFieldMappingDto,
  WhatsappFieldMappingDto,
} from './dto/create-whatsapp-list-import.dto';
import {
  WhatsappContactListMapper,
  type WhatsappContactListAppendResponse,
  type WhatsappContactListDetailResponse,
  type WhatsappContactListImportResponse,
  type WhatsappContactListMemberResponse,
  type WhatsappContactListMembersPageResponse,
  type WhatsappContactListResponse,
} from './mappers/whatsapp-contact-list.mapper';
import type { WhatsappListFieldSchema } from './types/whatsapp-list-field-schema';
import type { WhatsappListVisibility } from './types/whatsapp-list-visibility';
import type { ImportParseOptions } from '../common/file-parser/file-parser.service';
import { buildWhatsappMembersFromProspectIds } from './utils/map-prospect-to-whatsapp-list-member.util';
import { normalizeWhatsappPhone } from './utils/normalize-whatsapp-phone.util';
import {
  buildWhatsappListPdfFilename,
  renderWhatsappListPdf,
} from './utils/whatsapp-list-pdf-export.util';
import { WhatsappContactListMembersRepository } from './whatsapp-contact-list-members.repository';
import {
  WhatsappContactListsRepository,
  type WhatsappListMemberInsert,
} from './whatsapp-contact-lists.repository';
import type { WhatsappContactListMemberEntity } from './entities/whatsapp-contact-list-member.entity';
import type { WhatsappContactListEntity } from './entities/whatsapp-contact-list.entity';

export const WHATSAPP_LIST_IMPORT_FORM_KEY = 'whatsapp.list.contact.import';

const RESERVED_KEY_ALIASES: Record<
  string,
  'firstName' | 'lastName' | 'company'
> = {
  firstname: 'firstName',
  lastname: 'lastName',
  company: 'company',
};

@Injectable()
export class WhatsappContactListsService {
  private readonly importParseOptions: ImportParseOptions = {
    plainTextValue: 'phone',
  };

  constructor(
    private readonly listsRepository: WhatsappContactListsRepository,
    private readonly membersRepository: WhatsappContactListMembersRepository,
    private readonly fileParserService: FileParserService,
    private readonly mapper: WhatsappContactListMapper,
    private readonly formsService: FormsService,
    private readonly prospectsRepository: ProspectsRepository,
    private readonly orgEntitlementsService: OrgEntitlementsService,
  ) {}

  findAll(
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListResponse[]> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);

    return this.listsRepository
      .findVisibleForUser(resolvedOrganizationId, user.id)
      .then((lists) => lists.map((list) => this.mapper.toResponse(list)));
  }

  async createEmpty(
    dto: CreateWhatsappContactListDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    this.assertCanCreateWithVisibility(dto.visibility, user);

    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      resolvedOrganizationId,
    );
    const fieldSchema = this.buildFieldSchemaFromTableColumns(tableColumns);

    try {
      const saved = await this.listsRepository.createEmptyList(
        resolvedOrganizationId,
        dto.name.trim(),
        dto.visibility,
        user.id,
        fieldSchema,
      );

      return this.mapper.toResponse(saved);
    } catch (error) {
      if (this.isUniqueNameViolation(error)) {
        throw new ConflictException(
          'A list with this name already exists for this visibility',
        );
      }

      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateWhatsappContactListDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireManageableList(
      id,
      resolvedOrganizationId,
      user,
    );

    if (dto.name !== undefined) {
      list.name = dto.name.trim();
    }

    if (dto.visibility !== undefined) {
      this.assertCanCreateWithVisibility(dto.visibility, user);
      list.visibility = dto.visibility;
    }

    try {
      const saved = await this.listsRepository.save(list);
      return this.mapper.toResponse(saved);
    } catch (error) {
      if (this.isUniqueNameViolation(error)) {
        throw new ConflictException(
          'A list with this name already exists for this visibility',
        );
      }

      throw error;
    }
  }

  async delete(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<{ deleted: true }> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireManageableList(
      id,
      resolvedOrganizationId,
      user,
    );

    const campaignCount = await this.listsRepository.countCampaignsUsingList(
      list.id,
      resolvedOrganizationId,
    );

    if (campaignCount > 0) {
      throw new ConflictException(
        'This list is used by one or more WhatsApp campaigns. Remove or change those campaigns before deleting the list.',
      );
    }

    await this.listsRepository.deleteList(list);

    return { deleted: true };
  }

  async exportListPdf(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireVisibleList(
      id,
      resolvedOrganizationId,
      user,
    );
    const members = await this.membersRepository.findByListId(list.id);
    const fieldSchema = this.mapper.resolveFieldSchema(list, members);
    const buffer = await renderWhatsappListPdf(list, fieldSchema, members);

    return {
      buffer,
      filename: buildWhatsappListPdfFilename(list.name),
    };
  }

  async findById(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListDetailResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireVisibleList(
      id,
      resolvedOrganizationId,
      user,
    );
    const members = await this.membersRepository.findByListId(list.id);
    const fieldSchema = this.mapper.resolveFieldSchema(list, members);

    return this.mapper.toDetailResponse(list, fieldSchema);
  }

  async findMembers(
    id: string,
    query: WhatsappListMembersQueryDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListMembersPageResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireVisibleList(
      id,
      resolvedOrganizationId,
      user,
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const paginated = await this.membersRepository.findPaginatedByListId(
      list.id,
      {
        search: query.search,
        page,
        pageSize,
      },
    );

    return {
      items: paginated.items.map((member) =>
        this.mapper.toMemberResponse(member),
      ),
      total: paginated.total,
      page: paginated.page,
      pageSize: paginated.pageSize,
    };
  }

  async addMember(
    id: string,
    dto: CreateWhatsappListMemberDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListMemberResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireManageableList(
      id,
      resolvedOrganizationId,
      user,
    );
    const phone = normalizeWhatsappPhone(dto.phone);

    if (!phone) {
      throw new BadRequestException('A valid phone number is required');
    }

    const memberInsert = this.buildMemberInsertFromDto(dto, phone);

    try {
      await this.listsRepository.addMemberAndIncrementCount(list, memberInsert);
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_MEMBER') {
        throw new ConflictException(
          'A contact with this phone number already exists in the list',
        );
      }

      throw error;
    }

    const savedMember = await this.membersRepository.findByListIdAndPhone(
      list.id,
      phone,
    );

    if (!savedMember) {
      throw new NotFoundException('Contact not found after creation');
    }

    return this.mapper.toMemberResponse(savedMember);
  }

  async removeMember(
    listId: string,
    memberId: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<{ removed: boolean }> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireManageableList(
      listId,
      resolvedOrganizationId,
      user,
    );

    const removed = await this.listsRepository.deleteMemberAndDecrementCount(
      list,
      memberId,
    );

    if (!removed) {
      throw new NotFoundException('Contact not found');
    }

    return { removed: true };
  }

  previewImport(file: Express.Multer.File): Promise<ImportPreviewResult> {
    const validatedFile = this.fileParserService.assertSupportedFile(file);
    return this.fileParserService.preview(
      validatedFile,
      this.importParseOptions,
    );
  }

  previewAppendImport(
    id: string,
    file: Express.Multer.File,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<ImportPreviewResult> {
    void id;
    void organizationId;
    void user;
    const validatedFile = this.fileParserService.assertSupportedFile(file);
    return this.fileParserService.preview(
      validatedFile,
      this.importParseOptions,
    );
  }

  async importList(
    dto: CreateWhatsappListImportDto,
    file: Express.Multer.File,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListImportResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    this.assertCanCreateWithVisibility(dto.visibility, user);
    const validatedFile = this.fileParserService.assertSupportedFile(file);
    this.assertUniqueSourceColumns(dto.fieldMapping);

    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      resolvedOrganizationId,
    );
    this.assertFieldMappingMatchesTableColumns(dto.fieldMapping, tableColumns);

    const parsed = await this.fileParserService.parseFile(
      validatedFile,
      this.importParseOptions,
    );
    const totalRows = parsed.rows.length;
    const mappedRows = this.mapRows(parsed.rows, dto.fieldMapping);
    const members = this.deduplicateMembers(mappedRows);
    const skippedCount = totalRows - members.length;

    if (members.length === 0) {
      throw new BadRequestException(
        'No valid contacts found. Ensure the phone column is mapped and contains valid numbers.',
      );
    }

    const fieldSchema = this.buildFieldSchemaFromTableColumns(tableColumns);

    try {
      const savedList = await this.listsRepository.importListWithMembers(
        resolvedOrganizationId,
        dto.name.trim(),
        dto.visibility,
        user.id,
        members,
        fieldSchema,
      );

      return {
        list: this.mapper.toResponse(savedList),
        importedCount: members.length,
        skippedCount,
      };
    } catch (error) {
      if (this.isUniqueNameViolation(error)) {
        throw new ConflictException(
          'A list with this name already exists for this visibility',
        );
      }

      throw error;
    }
  }

  async importFromProspects(
    dto: ImportWhatsappListFromProspectsDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListImportResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    await this.assertCanImportFromCrm(resolvedOrganizationId, user);
    this.assertCanCreateWithVisibility(dto.visibility, user);

    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      resolvedOrganizationId,
    );
    const prospectFields = await this.resolveProspectFields(
      resolvedOrganizationId,
    );
    const { members, skippedCount } = await this.buildMembersFromProspectIds(
      dto.prospectIds,
      resolvedOrganizationId,
      tableColumns,
      prospectFields,
    );

    if (members.length === 0) {
      throw new BadRequestException(
        'No importable contacts found. Selected prospects need a valid phone number.',
      );
    }

    const fieldSchema = this.buildFieldSchemaFromTableColumns(tableColumns);

    try {
      const savedList = await this.listsRepository.importListWithMembers(
        resolvedOrganizationId,
        dto.name.trim(),
        dto.visibility,
        user.id,
        members,
        fieldSchema,
      );

      return {
        list: this.mapper.toResponse(savedList),
        importedCount: members.length,
        skippedCount,
      };
    } catch (error) {
      if (this.isUniqueNameViolation(error)) {
        throw new ConflictException(
          'A list with this name already exists for this visibility',
        );
      }

      throw error;
    }
  }

  async appendFromProspects(
    id: string,
    dto: AppendWhatsappListFromProspectsDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListAppendResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    await this.assertCanImportFromCrm(resolvedOrganizationId, user);
    const list = await this.requireManageableList(
      id,
      resolvedOrganizationId,
      user,
    );

    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      resolvedOrganizationId,
    );
    const prospectFields = await this.resolveProspectFields(
      resolvedOrganizationId,
    );
    const { members, skippedCount } = await this.buildMembersFromProspectIds(
      dto.prospectIds,
      resolvedOrganizationId,
      tableColumns,
      prospectFields,
    );

    if (members.length === 0) {
      throw new BadRequestException(
        'No importable contacts found. Selected prospects need a valid phone number.',
      );
    }

    const {
      list: savedList,
      importedCount,
      importedPhones,
    } = await this.listsRepository.appendMembersAndUpdateCount(list, members);

    return {
      list: this.mapper.toResponse(savedList),
      importedCount,
      skippedCount,
      importedPhones,
    };
  }

  async appendProspectsAndResolveMembers(
    listId: string,
    prospectIds: string[],
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListMemberEntity[]> {
    if (prospectIds.length === 0) {
      return [];
    }

    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireManageableList(
      listId,
      resolvedOrganizationId,
      user,
    );

    await this.appendFromProspects(
      listId,
      { prospectIds },
      resolvedOrganizationId,
      user,
    );

    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      resolvedOrganizationId,
    );
    const prospectFields = await this.resolveProspectFields(
      resolvedOrganizationId,
    );
    const { members } = await this.buildMembersFromProspectIds(
      prospectIds,
      resolvedOrganizationId,
      tableColumns,
      prospectFields,
    );

    const resolved: WhatsappContactListMemberEntity[] = [];

    for (const member of members) {
      const row = await this.membersRepository.findByListIdAndPhone(
        list.id,
        member.phone,
      );

      if (row) {
        resolved.push(row);
      }
    }

    return resolved;
  }

  async appendImport(
    id: string,
    dto: AppendWhatsappListImportDto,
    file: Express.Multer.File,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappContactListAppendResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const list = await this.requireManageableList(
      id,
      resolvedOrganizationId,
      user,
    );
    const validatedFile = this.fileParserService.assertSupportedFile(file);
    this.assertUniqueSourceColumns(dto.fieldMapping);

    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      resolvedOrganizationId,
    );
    this.assertFieldMappingMatchesTableColumns(dto.fieldMapping, tableColumns);

    const parsed = await this.fileParserService.parseFile(
      validatedFile,
      this.importParseOptions,
    );
    const totalRows = parsed.rows.length;
    const mappedRows = this.mapRows(parsed.rows, dto.fieldMapping);
    const members = this.deduplicateMembers(mappedRows);
    const skippedCount = totalRows - members.length;

    if (members.length === 0) {
      throw new BadRequestException(
        'No valid contacts found. Ensure the phone column is mapped and contains valid numbers.',
      );
    }

    const {
      list: savedList,
      importedCount,
      importedPhones,
    } = await this.listsRepository.appendMembersAndUpdateCount(list, members);

    return {
      list: this.mapper.toResponse(savedList),
      importedCount,
      skippedCount,
      importedPhones,
    };
  }

  async getImportableFields(organizationId: string) {
    const tableColumns = await this.formsService.resolveTableColumns(
      WHATSAPP_LIST_IMPORT_FORM_KEY,
      organizationId,
    );

    return tableColumns.map((column, index) => ({
      id: column.key,
      key: column.key,
      label: column.label,
      type: column.type,
      sortOrder: index,
      showInTable: true,
      showInForm: true,
    }));
  }

  private async requireVisibleList(
    id: string,
    organizationId: string,
    user: AuthUser,
  ): Promise<WhatsappContactListEntity> {
    const list = await this.listsRepository.findByIdAndOrganizationId(
      id,
      organizationId,
    );

    if (!list) {
      throw new NotFoundException('WhatsApp contact list not found');
    }

    const isVisible =
      list.visibility === 'org' || list.createdByUserId === user.id;

    if (!isVisible) {
      throw new NotFoundException('WhatsApp contact list not found');
    }

    return list;
  }

  private async requireManageableList(
    id: string,
    organizationId: string,
    user: AuthUser,
  ): Promise<WhatsappContactListEntity> {
    const list = await this.requireVisibleList(id, organizationId, user);

    const canManageOrgList =
      list.visibility === 'org' && hasPermission(user, 'whatsapp-lists:update');
    const canManagePrivateList =
      list.visibility === 'private' &&
      list.createdByUserId === user.id &&
      hasPermission(user, 'whatsapp-lists:update');

    if (!canManageOrgList && !canManagePrivateList) {
      throw new ForbiddenException('You cannot modify this WhatsApp list');
    }

    return list;
  }

  private assertCanCreateWithVisibility(
    _visibility: WhatsappListVisibility,
    user: AuthUser,
  ): void {
    if (!hasPermission(user, 'whatsapp-lists:create')) {
      throw new ForbiddenException(
        'Insufficient permissions to create WhatsApp lists',
      );
    }
  }

  private async assertCanImportFromCrm(
    organizationId: string,
    user: AuthUser,
  ): Promise<void> {
    await this.orgEntitlementsService.assertModuleEnabled(
      organizationId,
      'crm',
    );

    if (!hasPermission(user, 'prospects:read')) {
      throw new ForbiddenException(
        'Insufficient permissions to import from CRM prospects',
      );
    }
  }

  private async resolveProspectFields(
    organizationId: string,
  ): Promise<ProspectFieldDefinition[]> {
    const schema =
      await this.prospectsRepository.findSchemaByOrganizationId(organizationId);

    return schema?.fields ?? DEFAULT_PROSPECT_FIELD_SCHEMA.fields;
  }

  private async buildMembersFromProspectIds(
    prospectIds: string[],
    organizationId: string,
    tableColumns: FormTableColumnDefinition[],
    prospectFields: ProspectFieldDefinition[],
  ) {
    const uniqueIds = [...new Set(prospectIds)];
    const prospects = await this.prospectsRepository.findByIdsForOrganization(
      organizationId,
      uniqueIds,
    );

    const prospectsById = new Map(
      prospects.map((prospect) => [
        prospect.id,
        { fullName: prospect.fullName, values: prospect.values },
      ]),
    );

    return buildWhatsappMembersFromProspectIds(
      prospectIds,
      prospectsById,
      tableColumns,
      prospectFields,
    );
  }

  private buildMemberInsertFromDto(
    dto: CreateWhatsappListMemberDto,
    phone: string,
  ): WhatsappListMemberInsert {
    return {
      phone,
      firstName: dto.firstName?.trim() || null,
      lastName: dto.lastName?.trim() || null,
      company: dto.company?.trim() || null,
      customFields: dto.customFields ?? {},
    };
  }

  private buildFieldSchemaFromTableColumns(
    tableColumns: FormTableColumnDefinition[],
  ): WhatsappListFieldSchema {
    const phoneColumn =
      tableColumns.find((column) => column.type === 'phone') ??
      ({ key: 'phone', label: 'Phone' } as const);

    return {
      phone: { key: phoneColumn.key, label: phoneColumn.label },
      fields: tableColumns
        .filter((column) => column.key !== phoneColumn.key)
        .map((column) => ({
          key: column.key,
          label: column.label,
        })),
    };
  }

  private assertFieldMappingMatchesTableColumns(
    fieldMapping: WhatsappFieldMappingDto,
    tableColumns: FormTableColumnDefinition[],
  ): void {
    const phoneColumn = tableColumns.find((column) => column.type === 'phone');
    const phoneKey = phoneColumn?.key ?? 'phone';

    const mappings = [
      { targetColumnKey: phoneKey, sourceColumn: fieldMapping.phone },
      ...fieldMapping.additionalFields.map((field) => ({
        targetColumnKey: field.key,
        sourceColumn: field.sourceColumn,
      })),
    ];

    assertRequiredTableColumnsMapped(tableColumns, mappings);
  }

  private assertUniqueSourceColumns(
    fieldMapping: WhatsappFieldMappingDto,
  ): void {
    const usedColumns = new Set<string>();
    const columnsToCheck = [
      fieldMapping.phone,
      ...fieldMapping.additionalFields.flatMap((field) =>
        [field.sourceColumn, field.secondarySourceColumn].filter(
          (column): column is string => Boolean(column?.trim()),
        ),
      ),
    ];

    for (const column of columnsToCheck) {
      const trimmed = column.trim();
      if (usedColumns.has(trimmed)) {
        throw new BadRequestException(
          `Column "${trimmed}" is mapped more than once`,
        );
      }

      usedColumns.add(trimmed);
    }

    const keys = new Set<string>();
    for (const field of fieldMapping.additionalFields) {
      const normalizedKey = this.normalizeFieldKey(field.key);
      if (keys.has(normalizedKey)) {
        throw new BadRequestException('Field names must be unique');
      }

      keys.add(normalizedKey);

      if (
        field.secondarySourceColumn?.trim() &&
        field.secondarySourceColumn.trim() === field.sourceColumn.trim()
      ) {
        throw new BadRequestException(
          'Merge column must differ from the primary column',
        );
      }
    }
  }

  private mapRows(
    rows: Record<string, string>[],
    fieldMapping: WhatsappFieldMappingDto,
  ): WhatsappListMemberInsert[] {
    const mappedRows: WhatsappListMemberInsert[] = [];

    for (const row of rows) {
      const rawPhone = this.readMappedValue(row, fieldMapping.phone);
      const phone = rawPhone ? normalizeWhatsappPhone(rawPhone) : null;
      if (!phone) {
        continue;
      }

      const member: WhatsappListMemberInsert = {
        phone,
        firstName: null,
        lastName: null,
        company: null,
        customFields: {},
      };

      for (const field of fieldMapping.additionalFields) {
        const value = this.readMergedValue(row, field);
        if (!value) {
          continue;
        }

        this.applyAdditionalField(member, field.key, value);
      }

      mappedRows.push(member);
    }

    return mappedRows;
  }

  private applyAdditionalField(
    member: WhatsappListMemberInsert,
    key: string,
    value: string,
  ): void {
    const reservedKey = this.getReservedStandardKey(key);

    switch (reservedKey) {
      case 'firstName':
        member.firstName = value;
        return;
      case 'lastName':
        member.lastName = value;
        return;
      case 'company':
        member.company = value;
        return;
      default:
        member.customFields[key.trim()] = value;
    }
  }

  private readMergedValue(
    row: Record<string, string>,
    field: WhatsappAdditionalFieldMappingDto,
  ): string | null {
    const primary = this.readMappedValue(row, field.sourceColumn);
    const secondary = field.secondarySourceColumn
      ? this.readMappedValue(row, field.secondarySourceColumn)
      : '';
    const merged = [primary, secondary]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ');

    return merged.length > 0 ? merged : null;
  }

  private deduplicateMembers(
    rows: WhatsappListMemberInsert[],
  ): WhatsappListMemberInsert[] {
    const byPhone = new Map<string, WhatsappListMemberInsert>();

    for (const row of rows) {
      byPhone.set(row.phone, row);
    }

    return [...byPhone.values()];
  }

  private readMappedValue(
    row: Record<string, string>,
    sourceColumn: string,
  ): string {
    return (row[sourceColumn] ?? '').trim();
  }

  private normalizeFieldKey(key: string): string {
    return key
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }

  private getReservedStandardKey(
    key: string,
  ): 'firstName' | 'lastName' | 'company' | null {
    return RESERVED_KEY_ALIASES[this.normalizeFieldKey(key)] ?? null;
  }

  private isUniqueNameViolation(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const driverError = (error as Error & { driverError?: { code?: string } })
      .driverError;

    return driverError?.code === '23505';
  }
}
