import {
  Body,
  Controller,
  Get,
  HttpCode,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { UpdatePlatformOpenWaSettingsDto } from './dto/platform-openwa.dto';
import { PlatformOpenWaService } from './platform-openwa.service';

@Controller('platform/openwa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class PlatformOpenWaController {
  constructor(private readonly platformOpenWaService: PlatformOpenWaService) {}

  @Get()
  getSettings() {
    return this.platformOpenWaService.getSettings();
  }

  @Put()
  updateSettings(@Body() dto: UpdatePlatformOpenWaSettingsDto) {
    return this.platformOpenWaService.updateSettings(dto);
  }

  @Get('test')
  @HttpCode(200)
  testConnection() {
    return this.platformOpenWaService.testConnection();
  }
}
