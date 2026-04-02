export const AirtableUrlMapper = {
  API_BASE: 'https://api.airtable.com/v0',
  OAUTH_AUTHORIZE: 'https://airtable.com/oauth2/v1/authorize',
  OAUTH_TOKEN: 'https://airtable.com/oauth2/v1/token',
  WHOAMI: 'https://api.airtable.com/v0/meta/whoami',
  BASES: 'https://api.airtable.com/v0/meta/bases',
  TABLES: (baseId: string) => `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
  RECORDS: (baseId: string, tableId: string) => `https://api.airtable.com/v0/${baseId}/${tableId}`,
  WEB_BASE: 'https://airtable.com/',
  LOGIN: 'https://airtable.com/login',
  ROW_ACTIVITIES: (airtableId: string) =>
    `https://airtable.com/v0.3/row/${airtableId}/readRowActivitiesAndComments`,
  REFERER: (baseId: string, tableId: string) => `https://airtable.com/${baseId}/${tableId}`,
  APP_CLIENT_REDIRECT: 'http://localhost:4200/',
};
