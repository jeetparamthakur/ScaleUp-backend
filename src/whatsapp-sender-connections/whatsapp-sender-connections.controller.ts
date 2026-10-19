import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
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
import { CreateWhatsappSenderConnectionDto } from './dto/create-whatsapp-sender-connection.dto';
import { UpdateWhatsappSenderConnectionDto } from './dto/update-whatsapp-sender-connection.dto';
import { WhatsappSenderConnectionService } from './whatsapp-sender-connection.service';

interface AuthenticatedRequest extends Request {
  user?: AuthUserProfile;
}

@Controller('whatsapp')
@UseGuards(
  JwtAuthGuard,
  OrganizationGuard,
  ModuleAccessGuard,
  PermissionsGuard,
  AbacGuard,
)
@RequireModule('whatsapp')
export class WhatsappSenderConnectionsController {
  constructor(
    private readonly connectionService: WhatsappSenderConnectionService,
  ) {}

  @Get('availability')
  @RequirePermissions('whatsapp:read')
  availability() {
    return this.connectionService.getAvailability();
  }

  @Get('connections')
  @RequirePermissions('whatsapp:read')
  listConnections(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.listConnections(organizationId!, user.id);
  }

  @Post('connections')
  @HttpCode(200)
  @RequirePermissions('whatsapp:manage')
  createConnection(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateWhatsappSenderConnectionDto,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.createAndStartConnect(
      organizationId!,
      user.id,
      body.displayName,
    );
  }

  @Get('connections/:connectionId')
  @RequirePermissions('whatsapp:read')
  getConnection(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('connectionId') connectionId: string,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.getConnection(
      organizationId!,
      user.id,
      connectionId,
    );
  }

  @Post('connections/:connectionId/start')
  @HttpCode(200)
  @RequirePermissions('whatsapp:manage')
  startConnect(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('connectionId') connectionId: string,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.startConnect(
      organizationId!,
      user.id,
      connectionId,
    );
  }

  @Get('connections/:connectionId/qr')
  @RequirePermissions('whatsapp:manage')
  getQr(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('connectionId') connectionId: string,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.getQr(organizationId!, user.id, connectionId);
  }

  @Patch('connections/:connectionId')
  @RequirePermissions('whatsapp:manage')
  updateConnection(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('connectionId') connectionId: string,
    @Body() body: UpdateWhatsappSenderConnectionDto,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.updateConnection(
      organizationId!,
      user.id,
      connectionId,
      {
        displayName: body.displayName,
        dailySendLimit: body.dailySendLimit,
      },
    );
  }

  @Post('connections/:connectionId/disconnect')
  @HttpCode(200)
  @RequirePermissions('whatsapp:manage')
  disconnect(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('connectionId') connectionId: string,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.disconnect(
      organizationId!,
      user.id,
      connectionId,
    );
  }

  private requireUser(req: AuthenticatedRequest): AuthUserProfile {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    return req.user;
  }
}
