import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AbacGuard } from '../abac/abac-evaluation.service';
import type { AuthUser } from '../auth/auth.types';
import { CurrentOrganizationId } from '../auth/decorators/current-organization.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  OrganizationGuard,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { RequireModule } from '../org-entitlements/decorators/require-module.decorator';
import { ModuleAccessGuard } from '../org-entitlements/guards/module-access.guard';
import {
  CreateWhatsappTemplateDto,
  ListWhatsappTemplatesQueryDto,
  UpdateWhatsappTemplateDto,
} from './dto/whatsapp-template.dto';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

@Controller('whatsapp-templates')
@UseGuards(
  JwtAuthGuard,
  OrganizationGuard,
  ModuleAccessGuard,
  PermissionsGuard,
  AbacGuard,
)
@RequireModule('whatsapp')
export class WhatsappTemplatesController {
  constructor(private readonly templatesService: WhatsappTemplatesService) {}

  @Get()
  @RequirePermissions('whatsapp-templates:read')
  findAll(
    @Query() query: ListWhatsappTemplatesQueryDto,
    @Req() req: AuthenticatedRequest,
    @CurrentOrganizationId() organizationId: string | null,
  ) {
    return this.templatesService.findAll(
      organizationId,
      this.requireUser(req),
      {
        type: query.type,
        includeInactive: query.includeInactive,
      },
    );
  }

  @Get(':id')
  @RequirePermissions('whatsapp-templates:read')
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @CurrentOrganizationId() organizationId: string | null,
  ) {
    return this.templatesService.findOne(
      id,
      organizationId,
      this.requireUser(req),
    );
  }

  @Post()
  @RequirePermissions('whatsapp-templates:manage')
  create(
    @Body() dto: CreateWhatsappTemplateDto,
    @Req() req: AuthenticatedRequest,
    @CurrentOrganizationId() organizationId: string | null,
  ) {
    return this.templatesService.create(
      dto,
      organizationId,
      this.requireUser(req),
    );
  }

  @Patch(':id')
  @RequirePermissions('whatsapp-templates:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappTemplateDto,
    @Req() req: AuthenticatedRequest,
    @CurrentOrganizationId() organizationId: string | null,
  ) {
    return this.templatesService.update(
      id,
      dto,
      organizationId,
      this.requireUser(req),
    );
  }

  @Delete(':id')
  @RequirePermissions('whatsapp-templates:manage')
  remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @CurrentOrganizationId() organizationId: string | null,
  ) {
    return this.templatesService.remove(
      id,
      organizationId,
      this.requireUser(req),
    );
  }

  private requireUser(req: AuthenticatedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return req.user;
  }
}
