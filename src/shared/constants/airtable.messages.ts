export const Messages = {
  LOGS: {
    AUTH_URL_GENERATED: 'Generated Airtable authorization URL',
    TOKEN_EXCHANGE_SUCCESS: 'Successfully exchanged code for Airtable token',
    TOKEN_EXCHANGE_FAIL: 'Failed to exchange code for token',
    TOKEN_VALIDATION_SUCCESS: 'Airtable token validated successfully',
    TOKEN_VALIDATION_FAIL: 'Token validation failed',
    SYNC_TICKETS_START: (baseId: string, tableId: string) =>
      `Starting ticket sync for baseId: ${baseId}, tableId: ${tableId}`,
    SYNC_TICKETS_PROGRESS: (count: number) => `Sync progress: ${count} tickets processed...`,
    SYNC_TICKETS_SUCCESS: (count: number) =>
      `Ticket sync completed successfully. Total processed: ${count}`,
    SYNC_TICKETS_FAIL: (baseId: string, tableId: string) =>
      `Ticket sync failed for baseId: ${baseId}, tableId: ${tableId}`,
    FORMULA_PARSE_FAIL: 'Failed to parse Airtable Formula',
    TICKETS_FETCH_SUCCESS: (count: number) => `Successfully fetched ${count} tickets`,
    TICKETS_FETCH_FAIL: 'Failed to fetch tickets',
    REVISIONS_FETCH_SUCCESS: (count: number) => `Successfully fetched ${count} revisions`,
    REVISIONS_FETCH_FAIL: 'Failed to fetch revisions',
    BASES_FETCH_SUCCESS: 'Successfully fetched Airtable bases',
    BASES_FETCH_FAIL: 'Failed to fetch Airtable bases',
    TABLES_FETCH_SUCCESS: (baseId: string) => `Successfully fetched tables for baseId: ${baseId}`,
    TABLES_FETCH_FAIL: (baseId: string) => `Failed to fetch tables for baseId: ${baseId}`,
    SCRAPER_AUTH_START: (email: string) => `Authenticating scraper for email: ${email}`,
    SCRAPER_AUTH_EMAIL_ERR: (err: string) => `Scraper auth email error: ${err}`,
    SCRAPER_AUTH_PWD_ERR: (err: string) => `Scraper auth password error: ${err}`,
    SCRAPER_AUTH_MFA_ERR: (err: string) => `Scraper auth MFA error: ${err}`,
    SCRAPER_AUTH_SUCCESS: 'Scraper authenticated successfully. Cookies retrieved.',
    SCRAPER_AUTH_FAIL: 'Failed to authenticate scraper',
    SCRAPER_COOKIE_FAIL: 'Cookie validity check failed',
    SCRAPER_SYNC_START: (baseId: string, tableId: string) =>
      `Starting revision sync for baseId: ${baseId}, tableId: ${tableId}`,
    SCRAPER_AUTH_REQ: 'Scraper authentication required or cookies invalid.',
    SCRAPER_NO_TICKETS: 'No tickets found for revision sync. Sync completed.',
    SCRAPER_SYNC_PROGRESS: (count: number) =>
      `Revision sync progress: ${count} revisions parsed and stored...`,
    SCRAPER_RATE_LIMIT: (attempts: number, id: string) =>
      `Rate limit hit while scraping revisions. Retrying attempt ${attempts} for ticket ${id}`,
    SCRAPER_UNAUTHORIZED: (id: string) =>
      `Unauthorized error during scraping revisions for ticket ${id}`,
    SCRAPER_TICKET_FAIL: (id: string) => `Failed to scrape revisions for ticket ${id}`,
    SCRAPER_BATCH_PROGRESS: (count: number, total: number) =>
      `Processed revisions for ${count}/${total} tickets in batch...`,
    SCRAPER_SYNC_SUCCESS: (count: number, hasMore: boolean) =>
      `Revision history scrape completed for batch. Total parsed: ${count}. HasMore: ${hasMore}`,
    SCRAPER_COOKIES_CLEARED: 'Scraper cookies cleared successfully',
    USERS_UPSERT_SUCCESS: (count: number) => `Successfully upserted ${count} users`,
    USERS_UPSERT_FAIL: 'Failed to upsert users',
    USERS_FETCH_SUCCESS: (count: number) => `Successfully fetched ${count} users`,
    USERS_FETCH_FAIL: 'Failed to fetch users',
    INCOMING_REQ_AUTH_URL: 'Incoming request: getAuthUrl',
    INCOMING_REQ_CALLBACK: 'Incoming request: handleCallback',
    CALLBACK_SUCCESS: 'Callback successfully handled, redirecting',
    CALLBACK_FAIL: 'Error handling auth callback',
    INCOMING_REQ_AUTH_STATUS: 'Incoming request: checkAuthStatus',
    INCOMING_REQ_LOGOUT: 'Incoming request: logout',
    LOGOUT_SUCCESS: 'Logout successful',
    INCOMING_REQ_BASES: 'Incoming request: getBases',
    INCOMING_REQ_TABLES: (baseId: string) => `Incoming request: getTables for baseId: ${baseId}`,
    INCOMING_REQ_SYNC: (baseId: string, tableId: string) =>
      `Incoming request: syncTickets for baseId: ${baseId}, tableId: ${tableId}`,
    INCOMING_REQ_SCRAPE_AUTH: (email: string) =>
      `Incoming request: authenticateScraper for email: ${email}`,
    INCOMING_REQ_SCRAPE_RUN: (baseId: string, tableId: string) =>
      `Incoming request: runScraper for baseId: ${baseId}, tableId: ${tableId}`,
    INCOMING_REQ_TICKETS: 'Incoming request: getTickets',
    INCOMING_REQ_REVISIONS: (issueId?: string) =>
      `Incoming request: getRevisions for issueId: ${issueId}`,
    INCOMING_REQ_USERS: 'Incoming request: getUsers',
  },
  ERRORS: {
    INVALID_EMAIL: 'Invalid email provided.',
    INVALID_PWD: 'Invalid password provided.',
    INVALID_MFA: 'Invalid MFA code provided.',
    AUTH_FAILED: 'Authentication failed',
    SCRAPER_AUTH_FAIL: 'Failed to authenticate scraper',
    SCRAPER_AUTH_REQ: 'SCRAPER_AUTH_REQUIRED',
    USERS_FETCH_FAIL: 'Failed to fetch users',
  },
  SUCCESS: {
    TOKEN_VALID: 'Airtable access token is valid.',
    LOGOUT: 'Logged out successfully',
    COOKIES_RETRIEVED: 'Cookies retrieved',
  },
};
