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

  async fetchAndStoreTickets(baseId: string, tableId: string, accessToken: string) {
    let offset: string | undefined = undefined;
    let keepFetching = true;

    while (keepFetching) {
      const url = `${this.baseUrl}/${baseId}/${tableId}${offset ? `?offset=${offset}` : ''}`;

      const response = await firstValueFrom(
        this.httpService.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      );

      for (const record of response.data.records) {
        await this.ticketModel.findOneAndUpdate(
          { airtableId: record.id },
          { airtableId: record.id, baseId, tableId, fields: record.fields },
          { upsert: true, new: true },
        );
      }

      offset = response.data.offset;
      if (!offset) keepFetching = false;
    }
    return { success: true };
  }

  async authenticateScraper(email: string, password: string, mfaCode: string) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
      await page.goto('https://airtable.com/login');
      await page.type('input[name="email"]', email);
      await page.click('button[type="submit"]');

      await page.waitForSelector('input[name="password"]');
      await page.type('input[name="password"]', password);
      await page.click('button[type="submit"]');

      await page.waitForSelector('input[name="code"]');
      await page.type('input[name="code"]', mfaCode);
      await page.click('::-p-text(Submit)');
      await page.waitForNavigation();

      this.airtableCookies = await browser.cookies();
      return { success: true, message: 'Cookies retrieved' };
    } catch (err) {
      console.log(err);
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

      if (finalUrl.includes('airtable.com/login')) {
        return false;
      }

      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  async scrapeRevisionHistory(baseId: string, tableId: string) {
    const isValid = await this.checkCookieValidity();
    if (!isValid) throw new BadRequestException('Cookies expired. Redo MFA.');

    const tickets = await this.ticketModel.find({ baseId, tableId }).limit(200);
    const cookieString = this.airtableCookies.map((c) => `${c.name}=${c.value}`).join('; ');

    for (const ticket of tickets) {
      const params = {
        limit: 10,
        offsetV2: null,
        shouldReturnDeserializedActivityItems: true,
        shouldIncludeRowActivityOrCommentUserObjById: true,
      };

      const encodedParams = encodeURIComponent(JSON.stringify(params));
      const url = `https://airtable.com/v0.3/row/${ticket.airtableId}/readRowActivitiesAndComments?stringifiedObjectParams=${encodedParams}`;

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

        if (
          response.data &&
          response.data.msg === 'SUCCESS' &&
          response.data.data.rowActivityInfoById
        ) {
          const activitiesObj = response.data.data.rowActivityInfoById;
          const parsedActivities: any[] = [];

          for (const [uuid, activityInfo] of Object.entries<any>(activitiesObj)) {
            if (!activityInfo.diffRowHtml) continue;

            const $ = cheerio.load(activityInfo.diffRowHtml);

            $('.historicalCellContainer').each((i, el) => {
              const columnType = $(el).find('div[columnId]').text().trim();

              if (columnType === 'Assignee' || columnType === 'Status') {
                let oldValue = $(el).find('span.strikethrough').text().trim();
                let newValue = $(el).find('span.colors-background-success').text().trim();

                if (oldValue.includes('\xa0') || oldValue === '') oldValue = 'None';
                if (newValue.includes('\xa0') || newValue === '') newValue = 'None';

                parsedActivities.push({
                  uuid: uuid,
                  issueId: ticket.airtableId,
                  columnType: columnType,
                  oldValue: oldValue,
                  newValue: newValue,
                  createdDate: new Date(activityInfo.createdTime),
                  authoredBy: activityInfo.originatingUserId,
                });
              }
            });
          }

          for (const act of parsedActivities) {
            await this.revisionModel.findOneAndUpdate({ uuid: act.uuid }, act, { upsert: true });
          }
        }
      } catch (err: any) {
        console.error(
          `Failed to scrape ticket ${ticket.airtableId}:`,
          err.response?.status,
          err.response?.data,
        );
      }
    }
    return { success: true };
  }

  async getAllTickets(query: any = {}) {
    const {
      baseId,
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

    if (baseId) {
      rootConditions.push({ baseId });
    }

    if (search) {
      rootConditions.push({
        $or: [
          { airtableId: { $regex: search, $options: 'i' } },
          { 'fields.Name': { $regex: search, $options: 'i' } },
          { 'fields.Title': { $regex: search, $options: 'i' } },
          { 'fields.Assignee': { $regex: search, $options: 'i' } },
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

    const [data, total] = await Promise.all([
      this.ticketModel.find(filterQuery).sort(sortObj).skip(skip).limit(limitNum).exec(),
      this.ticketModel.countDocuments(filterQuery).exec(),
    ]);

    return { data, total, page: pageNum, limit: limitNum };
  }

  async getAllRevisions() {
    return this.revisionModel.find().exec();
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
}
