import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { Ticket } from 'src/shared/schemas/ticket.schema';
import { Revision } from 'src/shared/schemas/revision.schema';
import { User } from 'src/shared/schemas/user.schema';
import { SyncMeta } from 'src/shared/schemas/sync-meta.schema';
import { AirtableFormulaParser } from 'src/shared/utils/airtable-formula.parser';

@Injectable()
export class AirtableService {
  private pkceStore = new Map<string, string>();
  private readonly baseUrl = 'https://api.airtable.com/v0';
  private airtableCookies: any[] = [];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    @InjectModel(Revision.name) private revisionModel: Model<Revision>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(SyncMeta.name) private syncMetaModel: Model<SyncMeta>,
  ) {}

  getAuthUrl(): string {
    const clientId = this.configService.get<string>('AIRTABLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('AIRTABLE_REDIRECT_URI');
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(96).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    this.pkceStore.set(state, codeVerifier);

    return `https://airtable.com/oauth2/v1/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=data.records:read schema.bases:read&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  }

  async exchangeCodeForToken(code: string, state: string) {
    const codeVerifier = this.pkceStore.get(state);
    const clientId = this.configService.get<string>('AIRTABLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AIRTABLE_CLIENT_SECRET');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const data = new URLSearchParams({
      client_id: clientId || '',
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.configService.get<string>('AIRTABLE_REDIRECT_URI') || '',
      code_verifier: codeVerifier || '',
    });

    const response = await firstValueFrom(
      this.httpService.post('https://airtable.com/oauth2/v1/token', data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
      }),
    );
    this.pkceStore.delete(state);
    return response.data;
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.airtable.com/v0/meta/whoami', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  private async extractAndUpsertUsers(fields: Record<string, any>) {
    const usersToUpsert = new Map<string, any>();

    const traverse = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(traverse);
      } else if (typeof obj === 'object') {
        if (obj.id && obj.id.startsWith('usr') && (obj.email || obj.name)) {
          usersToUpsert.set(obj.id, {
            airtableId: obj.id,
            email: obj.email || null,
            name: obj.name || null,
          });
        }
        Object.values(obj).forEach(traverse);
      }
    };

    traverse(fields);

    for (const user of usersToUpsert.values()) {
      await this.userModel.findOneAndUpdate(
        { airtableId: user.airtableId },
        { $set: user },
        { upsert: true },
      );
    }
  }

  async fetchAndStoreTickets(baseId: string, tableId: string, accessToken: string) {
    let offset: string | undefined = undefined;
    let keepFetching = true;
    let ticketsProcessed = 0;

    await this.syncMetaModel.findOneAndUpdate(
      { baseId, tableId },
      { ticketSyncStatus: 'IN_PROGRESS' },
      { upsert: true },
    );

    try {
      while (keepFetching) {
        const url = `${this.baseUrl}/${baseId}/${tableId}${offset ? `?offset=${offset}` : ''}`;

        const response = await firstValueFrom(
          this.httpService.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
        );

        for (const record of response.data.records) {
          await this.ticketModel.findOneAndUpdate(
            { airtableId: record.id },
            { airtableId: record.id, baseId, tableId, fields: record.fields },
            { upsert: true },
          );

          await this.extractAndUpsertUsers(record.fields);
          ticketsProcessed++;
        }

        offset = response.data.offset;
        if (!offset) keepFetching = false;
      }

      await this.syncMetaModel.findOneAndUpdate(
        { baseId, tableId },
        {
          ticketSyncStatus: 'SUCCESS',
          lastTicketSyncDate: new Date(),
          ticketsProcessedLastSync: ticketsProcessed,
        },
      );

      return { success: true, processed: ticketsProcessed };
    } catch (error) {
      await this.syncMetaModel.findOneAndUpdate(
        { baseId, tableId },
        { ticketSyncStatus: 'FAILED' },
      );
      throw error;
    }
  }

  async authenticateScraper(email: string, password: string, mfaCode: string) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
      await page.goto('https://airtable.com/login');
      await page.type('input[name="email"]', email);
      await page.click('button[type="submit"]');

      const emailError = await Promise.race([
        page
          .waitForSelector('input[name="password"]', { visible: true, timeout: 15000 })
          .then(() => null)
          .catch(() => null),
        page
          .waitForSelector(
            '[data-testid="auth-form-notice-error"] div[role="paragraph"], .colors-foreground-accent-negative',
            { visible: true, timeout: 15000 },
          )
          .then(() =>
            page.evaluate(() => {
              const el =
                document.querySelector(
                  '[data-testid="auth-form-notice-error"] div[role="paragraph"]',
                ) ||
                document
                  .querySelector('.colors-foreground-accent-negative')
                  ?.closest('.flex.items-center')
                  ?.querySelector('div[role="paragraph"]');
              return el ? el.textContent : 'Invalid email provided.';
            }),
          )
          .catch(() => null),
      ]);

      if (emailError) throw new BadRequestException(emailError);

      await page.type('input[name="password"]', password);
      await page.click('button[type="submit"]');

      const passwordError = await Promise.race([
        page
          .waitForSelector('input[name="code"]', { visible: true, timeout: 15000 })
          .then(() => null)
          .catch(() => null),
        page
          .waitForSelector(
            '[data-testid="auth-form-notice-error"] div[role="paragraph"], .colors-foreground-accent-negative',
            { visible: true, timeout: 15000 },
          )
          .then(() =>
            page.evaluate(() => {
              const el =
                document.querySelector(
                  '[data-testid="auth-form-notice-error"] div[role="paragraph"]',
                ) ||
                document
                  .querySelector('.colors-foreground-accent-negative')
                  ?.closest('.flex.items-center')
                  ?.querySelector('div[role="paragraph"]');
              return el ? el.textContent : 'Invalid password provided.';
            }),
          )
          .catch(() => null),
      ]);

      if (passwordError) throw new BadRequestException(passwordError);

      await page.type('input[name="code"]', mfaCode);
      await page.click('::-p-text(Submit)');

      const mfaError = await Promise.race([
        page
          .waitForNavigation({ timeout: 15000 })
          .then(() => null)
          .catch(() => null),
        page
          .waitForSelector(
            '[data-testid="auth-form-notice-error"] div[role="paragraph"], .colors-foreground-accent-negative, div[role="alert"]',
            { visible: true, timeout: 15000 },
          )
          .then(() =>
            page.evaluate(() => {
              const el1 = document.querySelector(
                '[data-testid="auth-form-notice-error"] div[role="paragraph"]',
              );
              const el2 = document
                .querySelector('.colors-foreground-accent-negative')
                ?.closest('.flex.items-center')
                ?.querySelector('div[role="paragraph"]');
              const el3 = document.querySelector('div[role="alert"] .small.strong.quiet');
              const el = el1 || el2 || el3;
              return el ? el.textContent : 'Invalid MFA code provided.';
            }),
          )
          .catch(() => null),
      ]);

      if (mfaError) throw new BadRequestException(mfaError);

      this.airtableCookies = await browser.cookies();
      return { success: true, message: 'Cookies retrieved' };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Failed to authenticate scraper');
    } finally {
      await browser.close();
    }
  }

  async checkCookieValidity(): Promise<boolean> {
    if (!this.airtableCookies.length) return false;

    try {
      const cookieString = this.airtableCookies.map((c) => `${c.name}=${c.value}`).join('; ');

      const response = await firstValueFrom(
        this.httpService.get('https://airtable.com/', {
          headers: {
            Cookie: cookieString,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }),
      );

      const finalUrl = response.request?.res?.responseUrl || '';
      return !finalUrl.includes('airtable.com/login');
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  async scrapeRevisionHistory(baseId: string, tableId: string, providedCursor?: string) {
    const isValid = await this.checkCookieValidity();
    if (!isValid) {
      throw new BadRequestException('SCRAPER_AUTH_REQUIRED');
    }

    await this.syncMetaModel.findOneAndUpdate(
      { baseId, tableId },
      { revisionSyncStatus: 'IN_PROGRESS' },
      { upsert: true },
    );

    let cursor = providedCursor;
    if (!cursor) {
      const meta = await this.syncMetaModel.findOne({ baseId, tableId });
      cursor = meta?.revisionCursor;
    }

    const query: any = { baseId, tableId };
    if (cursor) {
      query._id = { $gt: cursor };
    }

    const batchSize = 500;
    const tickets = await this.ticketModel.find(query).sort({ _id: 1 }).limit(batchSize);

    if (tickets.length === 0) {
      await this.syncMetaModel.findOneAndUpdate(
        { baseId, tableId },
        {
          revisionSyncStatus: 'SUCCESS',
          lastRevisionSyncDate: new Date(),
          revisionsProcessedLastSync: 0,
        },
      );
      return { success: true, hasMore: false, cursor: null };
    }

    const cookieString = this.airtableCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    let totalRevisionsParsed = 0;

    const scrapePromises = tickets.map(async (ticket) => {
      let offsetV2 = null;
      let hasMoreHistory = true;

      while (hasMoreHistory) {
        const params = {
          limit: 100,
          offsetV2: offsetV2,
          shouldReturnDeserializedActivityItems: true,
          shouldIncludeRowActivityOrCommentUserObjById: true,
        };

        const encodedParams = encodeURIComponent(JSON.stringify(params));
        const url = `https://airtable.com/v0.3/row/${ticket.airtableId}/readRowActivitiesAndComments?stringifiedObjectParams=${encodedParams}`;

        let requestSuccess = false;
        let attempts = 0;
        const maxAttempts = 5;
        const baseDelayMs = 1000;

        while (!requestSuccess && attempts < maxAttempts) {
          attempts++;

          try {
            const response = await firstValueFrom(
              this.httpService.get(url, {
                headers: {
                  Cookie: cookieString,
                  'x-airtable-application-id': baseId,
                  'x-airtable-inter-service-client': 'webClient',
                  'x-requested-with': 'XMLHttpRequest',
                  'x-time-zone': 'Asia/Calcutta',
                  'x-user-locale': 'en',
                  Accept: 'application/json, text/javascript, */*; q=0.01',
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                  Referer: `https://airtable.com/${baseId}/${tableId}`,
                },
              }),
            );

            requestSuccess = true;

            if (
              response.data &&
              response.data.msg === 'SUCCESS' &&
              response.data.data.rowActivityInfoById
            ) {
              const activitiesObj = response.data.data.rowActivityInfoById;
              const parsedActivities: any[] = [];

              for (const [uuid, activityInfo] of Object.entries<any>(activitiesObj)) {
                if (!activityInfo.diffRowHtml) continue;
                if (activityInfo.groupType === 'columnConfig') continue;

                const $ = cheerio.load(activityInfo.diffRowHtml);

                $('.historicalCellContainer').each((i, el) => {
                  const cell = $(el);
                  const columnType = cell.find('div[columnId]').text().trim();

                  if (['Assignee', 'Status', 'Title'].includes(columnType)) {
                    const oldValues: string[] = [];
                    const newValues: string[] = [];

                    const extractCleanText = (node: cheerio.Cheerio<any>) => {
                      const clone = node.clone();
                      clone.find('.circle, svg').remove();
                      return clone.text().replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
                    };

                    if (cell.find('.textDiff').length > 0) {
                      cell.find('.colors-background-negative, .strikethrough').each((_, node) => {
                        const t = extractCleanText($(node));
                        if (t) oldValues.push(t);
                      });
                      cell.find('.colors-background-success').each((_, node) => {
                        const t = extractCleanText($(node));
                        if (t) newValues.push(t);
                      });
                    } else if (cell.find('.pill').length > 0) {
                      cell.find('.pill').each((_, node) => {
                        const n = $(node);
                        const isOld =
                          n.hasClass('strikethrough') ||
                          n.attr('style')?.includes('line-through') ||
                          n.closest('.strikethrough').length > 0;

                        const t = extractCleanText(n);
                        if (t) {
                          if (isOld) oldValues.push(t);
                          else newValues.push(t);
                        }
                      });
                    } else if (cell.find('.nullToValue').length > 0) {
                      const t = extractCleanText(cell.find('.nullToValue'));
                      if (t) newValues.push(t);
                    } else if (cell.find('.valueToNull').length > 0) {
                      const t = extractCleanText(cell.find('.valueToNull'));
                      if (t) oldValues.push(t);
                    }

                    const finalOld = oldValues.length > 0 ? oldValues.join(', ') : 'None';
                    const finalNew = newValues.length > 0 ? newValues.join(', ') : 'None';

                    if (finalOld !== finalNew) {
                      parsedActivities.push({
                        uuid: uuid,
                        issueId: ticket.airtableId,
                        columnType: columnType,
                        oldValue: finalOld,
                        newValue: finalNew,
                        createdDate: new Date(activityInfo.createdTime),
                        authoredBy: activityInfo.originatingUserId,
                      });
                    }
                  }
                });
              }

              for (const act of parsedActivities) {
                await this.revisionModel.findOneAndUpdate({ uuid: act.uuid }, act, {
                  upsert: true,
                });
                totalRevisionsParsed++;
              }

              if (response.data.data.offsetV2) {
                offsetV2 = response.data.data.offsetV2;
              } else if (response.data.data.pagination && response.data.data.pagination.offsetV2) {
                offsetV2 = response.data.data.pagination.offsetV2;
              } else {
                hasMoreHistory = false;
              }
            } else {
              hasMoreHistory = false;
            }

            if (hasMoreHistory) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
          } catch (err: any) {
            const status = err.response?.status;
            if (status === 429) {
              if (attempts >= maxAttempts) {
                hasMoreHistory = false;
                break;
              }
              const backoffMs = baseDelayMs * Math.pow(2, attempts - 1) + Math.random() * 500;
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue;
            }
            if (status === 401 || status === 403) {
              throw new BadRequestException('SCRAPER_AUTH_REQUIRED');
            }
            hasMoreHistory = false;
            break;
          }
        }
      }
    });

    await Promise.all(scrapePromises);

    const hasMore = tickets.length === batchSize;
    const nextCursor = hasMore ? tickets[tickets.length - 1]._id.toString() : null;

    await this.syncMetaModel.findOneAndUpdate(
      { baseId, tableId },
      {
        revisionSyncStatus: hasMore ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        lastRevisionSyncDate: new Date(),
        revisionCursor: nextCursor,
        revisionsProcessedLastSync: totalRevisionsParsed,
      },
    );

    return { success: true, hasMore, cursor: nextCursor };
  }

  async getAllTickets(query: any = {}) {
    const {
      baseId,
      tableId,
      page = '0',
      limit = '20',
      search = '',
      sortBy = '',
      sortOrder = 'asc',
      formula,
    } = query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = pageNum * limitNum;

    const rootConditions: any[] = [];

    if (baseId) rootConditions.push({ baseId });
    if (tableId) rootConditions.push({ tableId });

    if (search) {
      rootConditions.push({
        $or: [
          { airtableId: { $regex: search, $options: 'i' } },
          { 'fields.Name': { $regex: search, $options: 'i' } },
          { 'fields.Title': { $regex: search, $options: 'i' } },
          { 'fields.Assignee': { $regex: search, $options: 'i' } },
          { 'fields.Assignee.name': { $regex: search, $options: 'i' } },
          { 'fields.Assignee.email': { $regex: search, $options: 'i' } },
          { 'fields.Description': { $regex: search, $options: 'i' } },
          { 'fields.Status': { $regex: search, $options: 'i' } },
          { 'fields.Priority': { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (formula) {
      try {
        const parsedMongoQuery = AirtableFormulaParser.parse(formula);
        if (Object.keys(parsedMongoQuery).length > 0) {
          rootConditions.push(parsedMongoQuery);
        }
      } catch (e) {
        console.error('Failed to parse Airtable Formula', e);
      }
    }

    const filterQuery = rootConditions.length > 0 ? { $and: rootConditions } : {};

    const sortObj: any = {};
    if (sortBy) {
      const sortKey = ['airtableId', 'baseId', 'tableId', 'createdAt', 'updatedAt'].includes(sortBy)
        ? sortBy
        : `fields.${sortBy}`;
      sortObj[sortKey] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortObj['_id'] = -1;
    }

    const metaQuery =
      baseId && tableId
        ? this.syncMetaModel.findOne({ baseId, tableId }).lean().exec()
        : Promise.resolve(null);

    const [rawData, total, syncMeta] = await Promise.all([
      this.ticketModel
        .find(filterQuery)
        .select('-__v -_id -baseId -tableId')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.ticketModel.countDocuments(filterQuery).exec(),
      metaQuery,
    ]);

    const data = rawData.map((item: any) => {
      const { fields, ...rest } = item;
      return { ...rest, ...(fields || {}) };
    });

    return { data, total, page: pageNum, limit: limitNum, syncMeta };
  }

  async getRevisions(query: any = {}) {
    const { issueId, page = '0', limit = '20' } = query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = pageNum * limitNum;

    const filterQuery = issueId ? { issueId } : {};

    const [data, total] = await Promise.all([
      this.revisionModel
        .find(filterQuery)
        .sort({ createdDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .exec(),
      this.revisionModel.countDocuments(filterQuery).exec(),
    ]);

    return { data, total, page: pageNum, limit: limitNum };
  }

  async fetchBases(accessToken: string) {
    const url = 'https://api.airtable.com/v0/meta/bases';
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
    );
    return response.data;
  }

  async fetchTables(baseId: string, accessToken: string) {
    const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
    );
    return response.data;
  }

  async fetchUsers(accessToken: string) {
    const url = 'https://api.airtable.com/v0/Users';
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      );
      return response.data;
    } catch (error) {
      console.warn('Airtable /Users endpoint restricted or deprecated.');
      console.error(error);
      return { users: [] };
    }
  }

  clearCookies() {
    this.airtableCookies = [];
  }
}
