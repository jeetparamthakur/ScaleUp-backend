import { IsIn } from 'class-validator';
import { WhatsappDashboardQueryDto } from './whatsapp-dashboard-query.dto';

export class WhatsappDashboardExportQueryDto extends WhatsappDashboardQueryDto {
  @IsIn(['csv', 'pdf'])
  format!: 'csv' | 'pdf';
}
