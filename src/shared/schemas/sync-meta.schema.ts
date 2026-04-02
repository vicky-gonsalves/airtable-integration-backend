import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SyncMeta extends Document {
  @Prop({ required: true })
  baseId: string;

  @Prop({ required: true })
  tableId: string;

  @Prop()
  lastTicketSyncDate: Date;

  @Prop()
  lastRevisionSyncDate: Date;

  @Prop()
  revisionCursor: string;

  @Prop()
  ticketSyncStatus: string;

  @Prop()
  revisionSyncStatus: string;

  @Prop()
  ticketsProcessedLastSync: number;

  @Prop()
  revisionsProcessedLastSync: number;
}

export const SyncMetaSchema = SchemaFactory.createForClass(SyncMeta);

SyncMetaSchema.index({ baseId: 1, tableId: 1 }, { unique: true });
