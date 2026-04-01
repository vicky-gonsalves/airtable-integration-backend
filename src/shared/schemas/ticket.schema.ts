import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Ticket extends Document {
  @Prop({ required: true, unique: true })
  airtableId: string;

  @Prop({ required: true })
  baseId: string;

  @Prop({ required: true })
  tableId: string;

  @Prop({ type: Object })
  fields: Record<string, any>;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
