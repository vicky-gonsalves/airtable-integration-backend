export interface ExtractedUser {
  airtableId: string;
  email: string | null;
  name: string | null;
}

export interface ParsedActivity {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: string;
  newValue: string;
  createdDate: Date;
  authoredBy: string;
}

export interface AirtableActivityInfo {
  diffRowHtml?: string;
  groupType?: string;
  createdTime: string;
  originatingUserId: string;
}

export interface AirtableCookie {
  name: string;
  value: string;
  [key: string]: any;
}
