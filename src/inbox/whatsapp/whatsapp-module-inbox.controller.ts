import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
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
  WhatsappProfilePicturesQueryDto,
} from './dto/whatsapp-inbox-query.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappSenderSyncDto } from './dto/whatsapp-sender-sync.dto';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';

interface AuthenticatedRequest extends Request {
  user?: AuthUserProfile;
}

const WHATSAPP_INBOX_MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

@Controller('whatsapp/inbox')
@UseGuards(
  JwtAuthGuard,
  OrganizationGuard,
  ModuleAccessGuard,
  PermissionsGuard,
  AbacGuard,
)
@RequireModule('whatsapp')
export class WhatsappModuleInboxController {
  constructor(
    private readonly connectionService: WhatsappConnectionService,
    private readonly inboxService: WhatsappInboxService,
  ) {}

  @Get('availability')
  @RequirePermissions('whatsapp:read')
  availability() {
    return this.connectionService.getAvailability();
  }

  @Get('senders')
  @RequirePermissions('whatsapp:read')
  listSenders(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = this.requireUser(req);
    return this.inboxService.listSenders(organizationId!, user.id);
  }

  @Get('profile-pictures')
  @RequirePermissions('whatsapp:read')
  getProfilePictures(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Query() query: WhatsappProfilePicturesQueryDto,
  ) {
    const user = this.requireUser(req);
    const chatIds = query.ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.inboxService.getProfilePictures(
      organizationId!,
      user.id,
      query.senderConnectionId,
      chatIds,
    );
  }

  @Post('senders/:senderConnectionId/sync')
  @HttpCode(204)
  @RequirePermissions('whatsapp:read')
  async syncSender(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('senderConnectionId') senderConnectionId: string,
    @Body() body: WhatsappSenderSyncDto,
  ): Promise<void> {
    const user = this.requireUser(req);
    await this.inboxService.syncSenderFromOpenWa(
      organizationId!,
      user.id,
      senderConnectionId,
      body.conversationId,
    );
  }

  @Get('conversations')
  @RequirePermissions('whatsapp:read')
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

  @Get('conversations/:conversationId/messages/:messageId/media')
  @RequirePermissions('whatsapp:read')
  async getMessageMedia(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ): Promise<StreamableFile> {
    const user = this.requireUser(req);
    const media = await this.inboxService.getMessageMedia(
      organizationId!,
      user.id,
      conversationId,
      messageId,
    );
    if (media.servedFromCache) {
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('ETag', media.cacheEtag);
    }
    return new StreamableFile(media.buffer, {
      type: media.contentType,
      disposition: 'inline',
    });
  }

  @Post('conversations/:conversationId/prefetch-media')
  @HttpCode(204)
  @RequirePermissions('whatsapp:read')
  prefetchConversationMedia(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ): void {
    const user = this.requireUser(req);
    this.inboxService.prefetchConversationMedia(
      organizationId!,
      user.id,
      conversationId,
    );
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions('whatsapp:read')
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
  @RequirePermissions('whatsapp:read')
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

  @Post('conversations/:conversationId/attachments')
  @HttpCode(200)
  @RequirePermissions('whatsapp:read')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: WHATSAPP_INBOX_MAX_ATTACHMENT_BYTES },
    }),
  )
  sendAttachment(
    @CurrentOrganizationId() organizationId: string | null,
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    const user = this.requireUser(req);
    return this.inboxService.sendAttachment(
      organizationId!,
      user.id,
      conversationId,
      file,
      caption,
    );
  }

  private requireUser(req: AuthenticatedRequest): AuthUserProfile {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    return req.user;
  }
}
