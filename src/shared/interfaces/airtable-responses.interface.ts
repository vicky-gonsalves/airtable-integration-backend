import { SyncMeta } from 'src/shared/schemas/sync-meta.schema';

export interface PaginatedTicketsResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
  syncMeta: SyncMeta | null;
}

export interface PaginatedRevisionsResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
}

export interface TicketSyncResponse {
  success: boolean;
  processed: number;
}

export interface RevisionSyncResponse {
  success: boolean;
  hasMore: boolean;
  cursor: string | null;
}

export interface ScraperAuthResponse {
  success: boolean;
  message: string;
}

export interface AirtableTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
}

export interface AirtableFetchBasesResponse {
  bases: Array<{ id: string; name: string; permissionLevel?: string }>;
}

export interface AirtableFetchTablesResponse {
  tables: Array<{ id: string; name: string; primaryFieldId?: string }>;
}
