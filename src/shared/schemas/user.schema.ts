import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  airtableId: string;

  @Prop()
  email: string;

  @Prop()
  name: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
