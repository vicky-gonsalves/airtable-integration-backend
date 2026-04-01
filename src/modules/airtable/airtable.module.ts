import { Module } from '@nestjs/common';
import { AirtableController } from './airtable.controller';

@Module({
  controllers: [AirtableController],
})
export class AirtableModule {}
