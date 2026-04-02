export interface IUser {
  _id: string;
  airtableId: string;
  email?: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}
