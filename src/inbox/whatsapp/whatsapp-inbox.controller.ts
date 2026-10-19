import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AbacGuard } from '../../abac/abac-evaluation.service';
import type { AuthUserProfile } from '../../auth/auth.service';
import { CurrentOrganizationId } from '../../auth/decorators/current-organization.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  OrganizationGuard,
  PermissionsGuard,
} from '../../auth/guards/permissions.guard';
import { RequireModule } from '../../org-entitlements/decorators/require-module.decorator';
import { ModuleAccessGuard } from '../../org-entitlements/guards/module-access.guard';
import {
  WhatsappConversationsQueryDto,
  WhatsappMessagesQueryDto,
} from './dto/whatsapp-inbox-query.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';

interface AuthenticatedRequest extends Request {
  user?: AuthUserProfile;
}

@Controller('inbox/whatsapp')
@UseGuards(
  JwtAuthGuard,
  OrganizationGuard,
  ModuleAccessGuard,
  PermissionsGuard,
  AbacGuard,
)
@RequireModule('inbox')
export class WhatsappInboxController {
  constructor(
    private readonly connectionService: WhatsappConnectionService,
    private readonly inboxService: WhatsappInboxService,
  ) {}

  @Get('availability')
  @RequirePermissions('inbox:read')
  availability() {
    return this.connectionService.getAvailability();
  }

  @Get('connection')
  @RequirePermissions('inbox:read')
  getConnection(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.getConnection(organizationId!, user.id);
  }

  @Post('connection/start')
  @HttpCode(200)
  @RequirePermissions('inbox:manage')
  startConnect(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.startConnect(organizationId!, user.id);
  }

  @Get('connection/qr')
  @RequirePermissions('inbox:manage')
  getQr(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.getQr(organizationId!, user.id);
  }

  @Post('connection/disconnect')
  @HttpCode(200)
  @RequirePermissions('inbox:manage')
  disconnect(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.connectionService.disconnect(organizationId!, user.id);
  }

  @Get('senders')
  @RequirePermissions('inbox:read')
  listSenders(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.inboxService.listSenders(organizationId!, user.id);
  }

  @Get('conversations')
  @RequirePermissions('inbox:read')
  listConversations(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Query() query: WhatsappConversationsQueryDto,
  ) {
    const user = this.requireUser(req);
    return this.inboxService.listConversations(
      organizationId!,
      user.id,
      query.senderConnectionId,
      query.limit ?? 50,
      query.offset ?? 0,
    );
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions('inbox:read')
  listMessages(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Query() query: WhatsappMessagesQueryDto,
  ) {
    const user = this.requireUser(req);
    return this.inboxService.listMessages(
      organizationId!,
      user.id,
      conversationId,
      query.limit ?? 50,
      query.offset ?? 0,
    );
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(200)
  @RequirePermissions('inbox:read')
  sendMessage(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: SendWhatsappMessageDto,
  ) {
    const user = this.requireUser(req);
    return this.inboxService.sendTextMessage(
      organizationId!,
      user.id,
      conversationId,
      body.text,
    );
  }

  private requireUser(req: AuthenticatedRequest): AuthUserProfile {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    return req.user;
  }
}
