import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { Ticket } from 'src/shared/schemas/ticket.schema';
import { Revision } from 'src/shared/schemas/revision.schema';
import { SyncMeta } from 'src/shared/schemas/sync-meta.schema';
import {
  RevisionSyncResponse,
  ScraperAuthResponse,
} from 'src/shared/interfaces/airtable-responses.interface';
import {
  ParsedActivity,
  AirtableActivityInfo,
  AirtableCookie,
} from 'src/shared/interfaces/airtable-models.interface';

@Injectable()
export class AirtableScraperService {
  private airtableCookies: AirtableCookie[] = [];
  private readonly logger = new Logger(AirtableScraperService.name);

  constructor(
    private readonly httpService: HttpService,
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    @InjectModel(Revision.name) private revisionModel: Model<Revision>,
    @InjectModel(SyncMeta.name) private syncMetaModel: Model<SyncMeta>,
  ) {}

  async authenticateScraper(
    email: string,
    password: string,
    mfaCode: string,
  ): Promise<ScraperAuthResponse> {
    this.logger.debug(`Authenticating scraper for email: ${email}`);
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

      if (emailError) {
        this.logger.error(`Scraper auth email error: ${emailError}`);
        throw new BadRequestException(emailError);
      }

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

      if (passwordError) {
        this.logger.error(`Scraper auth password error: ${passwordError}`);
        throw new BadRequestException(passwordError);
      }

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

      if (mfaError) {
        this.logger.error(`Scraper auth MFA error: ${mfaError}`);
        throw new BadRequestException(mfaError);
      }

      this.airtableCookies = (await browser.cookies()) as AirtableCookie[];
      this.logger.debug('Scraper authenticated successfully. Cookies retrieved.');
      return { success: true, message: 'Cookies retrieved' };
    } catch (err: any) {
      this.logger.error('Failed to authenticate scraper', err.stack);
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
    } catch (error: any) {
      this.logger.error('Cookie validity check failed', error.stack);
      return false;
    }
  }

  async scrapeRevisionHistory(
    baseId: string,
    tableId: string,
    providedCursor?: string,
  ): Promise<RevisionSyncResponse> {
    this.logger.debug(`Starting revision sync for baseId: ${baseId}, tableId: ${tableId}`);

    const isValid = await this.checkCookieValidity();
    if (!isValid) {
      this.logger.error('Scraper authentication required or cookies invalid.');
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

    const query: Record<string, any> = { baseId, tableId };
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
      this.logger.debug('No tickets found for revision sync. Sync completed.');
      return { success: true, hasMore: false, cursor: null };
    }

    const cookieString = this.airtableCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    let totalRevisionsParsed = 0;
    let ticketsProcessedCount = 0;

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
              const parsedActivities: ParsedActivity[] = [];

              for (const [uuid, activityInfo] of Object.entries<AirtableActivityInfo>(
                activitiesObj,
              )) {
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
                if (totalRevisionsParsed % 100 === 0) {
                  this.logger.debug(
                    `Revision sync progress: ${totalRevisionsParsed} revisions parsed and stored...`,
                  );
                }
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
              this.logger.warn(
                `Rate limit hit while scraping revisions. Retrying attempt ${attempts} for ticket ${ticket.airtableId}`,
              );
              if (attempts >= maxAttempts) {
                hasMoreHistory = false;
                break;
              }
              const backoffMs = baseDelayMs * Math.pow(2, attempts - 1) + Math.random() * 500;
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue;
            }
            if (status === 401 || status === 403) {
              this.logger.error(
                `Unauthorized error during scraping revisions for ticket ${ticket.airtableId}`,
              );
              throw new BadRequestException('SCRAPER_AUTH_REQUIRED');
            }
            this.logger.error(
              `Failed to scrape revisions for ticket ${ticket.airtableId}`,
              err.stack,
            );
            hasMoreHistory = false;
            break;
          }
        }
      }
      ticketsProcessedCount++;
      if (ticketsProcessedCount % 50 === 0) {
        this.logger.debug(
          `Processed revisions for ${ticketsProcessedCount}/${tickets.length} tickets in batch...`,
        );
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

    this.logger.debug(
      `Revision history scrape completed for batch. Total parsed: ${totalRevisionsParsed}. HasMore: ${hasMore}`,
    );
    return { success: true, hasMore, cursor: nextCursor };
  }

  clearCookies(): void {
    this.airtableCookies = [];
    this.logger.debug('Scraper cookies cleared successfully');
  }
}
