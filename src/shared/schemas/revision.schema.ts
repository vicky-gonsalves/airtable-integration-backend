import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Revision extends Document {
  @Prop({ required: true, unique: true })
  uuid: string;

  @Prop({ required: true })
  issueId: string;

  @Prop({ required: true })
  columnType: string;

  @Prop()
  oldValue: string;

  @Prop()
  newValue: string;

  @Prop({ required: true })
  createdDate: Date;

  @Prop({ required: true })
  authoredBy: string;
}

export const RevisionSchema = SchemaFactory.createForClass(Revision);
