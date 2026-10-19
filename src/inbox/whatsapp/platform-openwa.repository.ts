import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformOpenWaSettingsEntity } from './entities/platform-openwa-settings.entity';

const SETTINGS_ID = 'default';

@Injectable()
export class PlatformOpenWaRepository {
  constructor(
    @InjectRepository(PlatformOpenWaSettingsEntity)
    private readonly repository: Repository<PlatformOpenWaSettingsEntity>,
  ) {}

  async getOrCreate(): Promise<PlatformOpenWaSettingsEntity> {
    let row = await this.repository.findOne({ where: { id: SETTINGS_ID } });
    if (!row) {
      row = this.repository.create({
        id: SETTINGS_ID,
        baseUrl: '',
        enabled: false,
        apiKeyEncrypted: null,
      });
      await this.repository.save(row);
    }
    return row;
  }

  async save(
    entity: PlatformOpenWaSettingsEntity,
  ): Promise<PlatformOpenWaSettingsEntity> {
    return this.repository.save(entity);
  }
}
