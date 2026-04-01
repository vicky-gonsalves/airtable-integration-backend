import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AirtableModule } from 'src/modules/airtable/airtable.module';
import { AirtableService } from './services/airtable/airtable.service';
import { Ticket, TicketSchema } from 'src/shared/schemas/ticket.schema';
import { Revision, RevisionSchema } from 'src/shared/schemas/revision.schema';

const sharedProviders = [AirtableService];

@Global()
@Module({
  imports: [
    HttpModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Revision.name, schema: RevisionSchema },
    ]),
    AirtableModule,
  ],
  providers: [...sharedProviders],
  exports: [...sharedProviders],
})
export class SharedModule {}
