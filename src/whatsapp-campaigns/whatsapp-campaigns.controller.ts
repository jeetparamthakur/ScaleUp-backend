import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
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
import { AddWhatsappCampaignRecipientsDto } from './dto/add-whatsapp-campaign-recipients.dto';
import { CreateWhatsappCampaignDto } from './dto/create-whatsapp-campaign.dto';
import { WhatsappCampaignAddableMembersQueryDto } from './dto/whatsapp-campaign-addable-members-query.dto';
import {
  WhatsappCampaignRecipientsQueryDto,
  WhatsappCampaignRepliesQueryDto,
} from './dto/whatsapp-campaign-recipients-query.dto';
import { WhatsappDashboardExportQueryDto } from './dto/whatsapp-dashboard-export-query.dto';
import { WhatsappDashboardQueryDto } from './dto/whatsapp-dashboard-query.dto';
import { WhatsappCampaignsService } from './whatsapp-campaigns.service';
import { WhatsappDashboardService } from './whatsapp-dashboard.service';

interface AuthenticatedRequest extends Request {
  user?: AuthUserProfile;
}

@Controller('whatsapp-campaigns')
@UseGuards(
  JwtAuthGuard,
  OrganizationGuard,
  ModuleAccessGuard,
  PermissionsGuard,
  AbacGuard,
)
@RequireModule('whatsapp')
export class WhatsappCampaignsController {
  constructor(
    private readonly campaignsService: WhatsappCampaignsService,
    private readonly dashboardService: WhatsappDashboardService,
  ) {}

  @Get()
  @RequirePermissions('whatsapp-campaigns:read')
  list(@CurrentOrganizationId() organizationId: string | null) {
    return this.campaignsService.list(organizationId!);
  }

  @Get('dashboard')
  @RequirePermissions('whatsapp-campaigns:read')
  getDashboard(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Query() query: WhatsappDashboardQueryDto,
  ) {
    const user = this.requireUser(req);
    return this.dashboardService.getDashboard(organizationId!, user.id, query);
  }

  @Get('dashboard/export')
  @RequirePermissions('whatsapp-campaigns:read')
  async exportDashboard(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Query() query: WhatsappDashboardExportQueryDto,
  ): Promise<StreamableFile> {
    const user = this.requireUser(req);
    const { buffer, contentType, filename } =
      await this.dashboardService.exportDashboard(
        organizationId!,
        user.id,
        query,
      );

    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':campaignId/addable-list-members')
  @RequirePermissions('whatsapp-campaigns:read')
  listAddableMembers(
    @CurrentOrganizationId() organizationId: string | null,
    @Param('campaignId') campaignId: string,
    @Query() query: WhatsappCampaignAddableMembersQueryDto,
  ) {
    return this.campaignsService.listAddableMembers(
      organizationId!,
      campaignId,
      query,
    );
  }

  @Get(':campaignId/recipients')
  @RequirePermissions('whatsapp-campaigns:read')
  listRecipients(
    @CurrentOrganizationId() organizationId: string | null,
    @Param('campaignId') campaignId: string,
    @Query() query: WhatsappCampaignRecipientsQueryDto,
  ) {
    return this.campaignsService.listRecipients(
      organizationId!,
      campaignId,
      query,
    );
  }

  @Get(':campaignId/replies')
  @RequirePermissions('whatsapp-campaigns:read')
  listReplies(
    @CurrentOrganizationId() organizationId: string | null,
    @Param('campaignId') campaignId: string,
    @Query() query: WhatsappCampaignRepliesQueryDto,
  ) {
    return this.campaignsService.listReplies(
      organizationId!,
      campaignId,
      query,
    );
  }

  @Get(':campaignId')
  @RequirePermissions('whatsapp-campaigns:read')
  get(
    @CurrentOrganizationId() organizationId: string | null,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignsService.get(organizationId!, campaignId);
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions('whatsapp-campaigns:create')
  create(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateWhatsappCampaignDto,
  ) {
    const user = this.requireUser(req);
    return this.campaignsService.create(organizationId!, user.id, body);
  }

  @Post(':campaignId/recipients')
  @HttpCode(200)
  @RequirePermissions('whatsapp-campaigns:update')
  addRecipients(
    @CurrentOrganizationId() organizationId: string | null,
    @Param('campaignId') campaignId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: AddWhatsappCampaignRecipientsDto,
  ) {
    const user = this.requireUser(req);
    return this.campaignsService.addRecipients(
      organizationId!,
      campaignId,
      user,
      body,
    );
  }

  @Post(':campaignId/schedule')
  @HttpCode(200)
  @RequirePermissions('whatsapp-campaigns:update')
  schedule(
    @CurrentOrganizationId() organizationId: string | null,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignsService.schedule(organizationId!, campaignId);
  }

  private requireUser(req: AuthenticatedRequest): AuthUserProfile {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    return req.user;
  }
}
