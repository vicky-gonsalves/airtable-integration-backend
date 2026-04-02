export interface GetAllTicketsQuery {
  baseId?: string;
  tableId?: string;
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  formula?: string;
}

export interface GetRevisionsQuery {
  issueId?: string;
  page?: string;
  limit?: string;
}
