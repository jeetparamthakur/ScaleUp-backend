import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request } from 'express';
import { AbacGuard } from '../abac/abac-evaluation.service';
import type { AuthUserProfile } from '../auth/auth.service';
import { CurrentOrganizationId } from '../auth/decorators/current-organization.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  OrganizationGuard,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { RequireModule } from '../org-entitlements/decorators/require-module.decorator';
import { ModuleAccessGuard } from '../org-entitlements/guards/module-access.guard';
import { CreateWhatsappListImportDto } from './dto/create-whatsapp-list-import.dto';
import {
  AppendWhatsappListFromProspectsDto,
  ImportWhatsappListFromProspectsDto,
} from './dto/whatsapp-list-prospect-import.dto';
import {
  AppendWhatsappListImportDto,
  CreateWhatsappContactListDto,
  CreateWhatsappListMemberDto,
  UpdateWhatsappContactListDto,
  WhatsappListMembersQueryDto,
} from './dto/whatsapp-list-detail.dto';
import { WhatsappContactListsService } from './whatsapp-contact-lists.service';

interface AuthenticatedRequest extends Request {
  user?: AuthUserProfile;
}

@Controller('whatsapp-contact-lists')
@UseGuards(
  JwtAuthGuard,
  OrganizationGuard,
  ModuleAccessGuard,
  PermissionsGuard,
  AbacGuard,
)
@RequireModule('whatsapp')
export class WhatsappContactListsController {
  constructor(
    private readonly whatsappContactListsService: WhatsappContactListsService,
  ) {}

  @Get()
  @RequirePermissions('whatsapp-lists:read')
  findAll(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.findAll(organizationId, req.user);
  }

  @Get('importable-fields')
  @RequirePermissions('whatsapp-lists:read')
  getImportableFields(@CurrentOrganizationId() organizationId: string | null) {
    const resolvedOrganizationId = organizationId;
    if (!resolvedOrganizationId) {
      throw new BadRequestException('Organization is required');
    }

    return this.whatsappContactListsService.getImportableFields(
      resolvedOrganizationId,
    );
  }

  @Post()
  @RequirePermissions('whatsapp-lists:create')
  create(
    @Body() dto: CreateWhatsappContactListDto,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.createEmpty(
      dto,
      organizationId,
      req.user,
    );
  }

  @Post('import/preview')
  @RequirePermissions('whatsapp-lists:create')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(@UploadedFile() file: Express.Multer.File) {
    return this.whatsappContactListsService.previewImport(file);
  }

  @Post('import')
  @RequirePermissions('whatsapp-lists:create')
  @UseInterceptors(FileInterceptor('file'))
  async importList(
    @UploadedFile() file: Express.Multer.File,
    @Body('payload') payloadJson: string,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!payloadJson) {
      throw new BadRequestException('Import payload is required');
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(payloadJson) as unknown;
    } catch {
      throw new BadRequestException('Import payload must be valid JSON');
    }

    const dto = plainToInstance(CreateWhatsappListImportDto, parsedPayload);
    const validationErrors = await validate(dto);

    if (validationErrors.length > 0) {
      throw new BadRequestException(validationErrors);
    }

    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.importList(
      dto,
      file,
      organizationId,
      req.user,
    );
  }

  @Post('import-from-prospects')
  @RequirePermissions('whatsapp-lists:create')
  importFromProspects(
    @Body() dto: ImportWhatsappListFromProspectsDto,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.importFromProspects(
      dto,
      organizationId,
      req.user,
    );
  }

  @Get(':id/export/pdf')
  @RequirePermissions('whatsapp-lists:read')
  async exportListPdf(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    const { buffer, filename } =
      await this.whatsappContactListsService.exportListPdf(
        id,
        organizationId,
        req.user,
      );

    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequirePermissions('whatsapp-lists:read')
  findById(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.findById(
      id,
      organizationId,
      req.user,
    );
  }

  @Delete(':id')
  @RequirePermissions('whatsapp-lists:update')
  delete(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.delete(
      id,
      organizationId,
      req.user,
    );
  }

  @Patch(':id')
  @RequirePermissions('whatsapp-lists:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappContactListDto,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.update(
      id,
      dto,
      organizationId,
      req.user,
    );
  }

  @Get(':id/members')
  @RequirePermissions('whatsapp-lists:read')
  findMembers(
    @Param('id') id: string,
    @Query() query: WhatsappListMembersQueryDto,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.findMembers(
      id,
      query,
      organizationId,
      req.user,
    );
  }

  @Post(':id/members')
  @RequirePermissions('whatsapp-lists:update')
  addMember(
    @Param('id') id: string,
    @Body() dto: CreateWhatsappListMemberDto,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.addMember(
      id,
      dto,
      organizationId,
      req.user,
    );
  }

  @Delete(':id/members/:memberId')
  @RequirePermissions('whatsapp-lists:update')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.removeMember(
      id,
      memberId,
      organizationId,
      req.user,
    );
  }

  @Post(':id/import/preview')
  @RequirePermissions('whatsapp-lists:update')
  @UseInterceptors(FileInterceptor('file'))
  previewAppendImport(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.previewAppendImport(
      id,
      file,
      organizationId,
      req.user,
    );
  }

  @Post(':id/import')
  @RequirePermissions('whatsapp-lists:update')
  @UseInterceptors(FileInterceptor('file'))
  async appendImport(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('payload') payloadJson: string,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!payloadJson) {
      throw new BadRequestException('Import payload is required');
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(payloadJson) as unknown;
    } catch {
      throw new BadRequestException('Import payload must be valid JSON');
    }

    const dto = plainToInstance(AppendWhatsappListImportDto, parsedPayload);
    const validationErrors = await validate(dto);

    if (validationErrors.length > 0) {
      throw new BadRequestException(validationErrors);
    }

    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.appendImport(
      id,
      dto,
      file,
      organizationId,
      req.user,
    );
  }

  @Post(':id/import-from-prospects')
  @RequirePermissions('whatsapp-lists:update')
  appendFromProspects(
    @Param('id') id: string,
    @Body() dto: AppendWhatsappListFromProspectsDto,
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.whatsappContactListsService.appendFromProspects(
      id,
      dto,
      organizationId,
      req.user,
    );
  }
}
