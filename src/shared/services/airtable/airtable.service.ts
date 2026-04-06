import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import type { Response } from 'express';
import { Ticket } from 'src/shared/schemas/ticket.schema';
import { Revision } from 'src/shared/schemas/revision.schema';
import { SyncMeta } from 'src/shared/schemas/sync-meta.schema';
import { AirtableFormulaParser } from 'src/shared/utils/airtable-formula.parser';
import { UserService } from 'src/shared/services/user/user.service';
import { AirtableScraperService } from 'src/shared/services/airtable-scraper/airtable-scraper.service';
import {
  PaginatedTicketsResponse,
  PaginatedRevisionsResponse,
  TicketSyncResponse,
  AirtableTokenResponse,
  AirtableFetchBasesResponse,
  AirtableFetchTablesResponse,
} from 'src/shared/interfaces/airtable-responses.interface';
import { ExtractedUser } from 'src/shared/interfaces/airtable-models.interface';
import {
  GetAllTicketsQueryDto,
  GetRevisionsQueryDto,
  AuthCallbackQueryDto,
} from 'src/modules/airtable/dtos/airtable.dto';
import { AirtableUrlMapper } from 'src/shared/mappers/airtable-url.mapper';
import { Messages } from 'src/shared/constants/airtable.messages';

@Injectable()
export class AirtableService {
  private pkceStore = new Map<string, string>();
  private readonly logger = new Logger(AirtableService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly airtableScraperService: AirtableScraperService,
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    @InjectModel(Revision.name) private revisionModel: Model<Revision>,
    @InjectModel(SyncMeta.name) private syncMetaModel: Model<SyncMeta>,
  ) {}

  getAuthUrl(): string {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_AUTH_URL);
    const clientId = this.configService.get<string>('AIRTABLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('AIRTABLE_REDIRECT_URI');
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(96).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    this.pkceStore.set(state, codeVerifier);
    this.logger.debug(Messages.LOGS.AUTH_URL_GENERATED);

    return `${AirtableUrlMapper.OAUTH_AUTHORIZE}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=data.records:read schema.bases:read&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  }

  async handleCallback(query: AuthCallbackQueryDto, res: Response) {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_CALLBACK);
    try {
      const tokenData = await this.exchangeCodeForToken(query.code, query.state);
      res.cookie('airtable_access_token', tokenData.access_token, {
        httpOnly: true,
        sameSite: 'lax',
      });
      this.logger.debug(Messages.LOGS.CALLBACK_SUCCESS);
      res.redirect(AirtableUrlMapper.APP_CLIENT_REDIRECT);
    } catch (error: any) {
      this.logger.error(Messages.LOGS.CALLBACK_FAIL, error.stack);
      res.status(500).send(Messages.ERRORS.AUTH_FAILED);
    }
  }

  checkAuthStatus() {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_AUTH_STATUS);
    return {
      authenticated: true,
      message: Messages.SUCCESS.TOKEN_VALID,
    };
  }

  logout(res: Response) {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_LOGOUT);
    this.airtableScraperService.clearCookies();
    res.clearCookie('airtable_access_token', {
      httpOnly: true,
      sameSite: 'lax',
    });
    this.logger.debug(Messages.LOGS.LOGOUT_SUCCESS);
    return res.status(200).json({ success: true, message: Messages.SUCCESS.LOGOUT });
  }

  async exchangeCodeForToken(code: string, state: string): Promise<AirtableTokenResponse> {
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

    try {
      const response = await firstValueFrom(
        this.httpService.post<AirtableTokenResponse>(
          AirtableUrlMapper.OAUTH_TOKEN,
          data.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${credentials}`,
            },
          },
        ),
      );
      this.pkceStore.delete(state);
      this.logger.debug(Messages.LOGS.TOKEN_EXCHANGE_SUCCESS);
      return response.data;
    } catch (error: any) {
      this.logger.error(Messages.LOGS.TOKEN_EXCHANGE_FAIL, error.stack);
      throw error;
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(AirtableUrlMapper.WHOAMI, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      this.logger.debug(Messages.LOGS.TOKEN_VALIDATION_SUCCESS);
      return true;
    } catch (error: any) {
      this.logger.error(Messages.LOGS.TOKEN_VALIDATION_FAIL, error.stack);
      return false;
    }
  }

  private async extractAndUpsertUsers(fields: Record<string, any>): Promise<void> {
    const usersToUpsert = new Map<string, ExtractedUser>();

    const traverse = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(traverse);
      } else if (typeof obj === 'object') {
        if (
          obj.id &&
          typeof obj.id === 'string' &&
          obj.id.startsWith('usr') &&
          (obj.email || obj.name)
        ) {
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

    if (usersToUpsert.size > 0) {
      await this.userService.upsertUsers(usersToUpsert.values());
    }
  }

  async fetchAndStoreTickets(
    baseId: string,
    tableId: string,
    accessToken: string,
  ): Promise<TicketSyncResponse> {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_SYNC(baseId, tableId));
    let offset: string | undefined = undefined;
    let keepFetching = true;
    let ticketsProcessed = 0;
    const fetchedAirtableIds: string[] = [];

    this.logger.debug(Messages.LOGS.SYNC_TICKETS_START(baseId, tableId));

    await this.syncMetaModel.findOneAndUpdate(
      { baseId, tableId },
      { ticketSyncStatus: 'IN_PROGRESS' },
      { upsert: true },
    );

    try {
      while (keepFetching) {
        const baseUrl = AirtableUrlMapper.RECORDS(baseId, tableId);
        const url = `${baseUrl}${offset ? `?offset=${offset}` : ''}`;

        const response = await firstValueFrom(
          this.httpService.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
        );

        for (const record of response.data.records) {
          fetchedAirtableIds.push(record.id);

          await this.ticketModel.findOneAndUpdate(
            { airtableId: record.id },
            { airtableId: record.id, baseId, tableId, fields: record.fields },
            { upsert: true },
          );

          await this.extractAndUpsertUsers(record.fields);
          ticketsProcessed++;

          if (ticketsProcessed % 100 === 0) {
            this.logger.debug(Messages.LOGS.SYNC_TICKETS_PROGRESS(ticketsProcessed));
          }
        }

        offset = response.data.offset;
        if (!offset) keepFetching = false;
      }

      const deleteResult = await this.ticketModel.deleteMany({
        baseId,
        tableId,
        airtableId: { $nin: fetchedAirtableIds },
      });

      if (deleteResult.deletedCount > 0) {
        this.logger.debug(`Cleaned up ${deleteResult.deletedCount} deleted tickets from local DB.`);
      }

      await this.syncMetaModel.findOneAndUpdate(
        { baseId, tableId },
        {
          ticketSyncStatus: 'SUCCESS',
          lastTicketSyncDate: new Date(),
          ticketsProcessedLastSync: ticketsProcessed,
        },
      );

      this.logger.debug(Messages.LOGS.SYNC_TICKETS_SUCCESS(ticketsProcessed));
      return { success: true, processed: ticketsProcessed };
    } catch (error: any) {
      this.logger.error(Messages.LOGS.SYNC_TICKETS_FAIL(baseId, tableId), error.stack);
      await this.syncMetaModel.findOneAndUpdate(
        { baseId, tableId },
        { ticketSyncStatus: 'FAILED' },
      );
      throw error;
    }
  }

  async getAllTickets(query: GetAllTicketsQueryDto = {}): Promise<PaginatedTicketsResponse> {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_TICKETS);
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

    const rootConditions: Record<string, any>[] = [];

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
      } catch (e: any) {
        this.logger.error(Messages.LOGS.FORMULA_PARSE_FAIL, e.stack);
      }
    }

    const filterQuery: Record<string, any> =
      rootConditions.length > 0 ? { $and: rootConditions } : {};

    const sortObj: Record<string, 1 | -1> = {};
    if (sortBy) {
      const sortKey = ['airtableId', 'baseId', 'tableId', 'createdAt', 'updatedAt'].includes(sortBy)
        ? sortBy
        : `fields.${sortBy}`;
      sortObj[sortKey] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortObj['_id'] = -1;
    }

    try {
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

      this.logger.debug(Messages.LOGS.TICKETS_FETCH_SUCCESS(data.length));
      return { data, total, page: pageNum, limit: limitNum, syncMeta };
    } catch (error: any) {
      this.logger.error(Messages.LOGS.TICKETS_FETCH_FAIL, error.stack);
      throw error;
    }
  }

  async getRevisions(query: GetRevisionsQueryDto = {}): Promise<PaginatedRevisionsResponse> {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_REVISIONS(query.issueId));
    const { issueId, page = '0', limit = '20' } = query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = pageNum * limitNum;

    const filterQuery: Record<string, any> = issueId ? { issueId } : {};

    try {
      const [data, total] = await Promise.all([
        this.revisionModel
          .find(filterQuery)
          .sort({ createdDate: -1 })
          .skip(skip)
          .limit(limitNum)
          .exec(),
        this.revisionModel.countDocuments(filterQuery).exec(),
      ]);

      this.logger.debug(Messages.LOGS.REVISIONS_FETCH_SUCCESS(data.length));
      return { data, total, page: pageNum, limit: limitNum };
    } catch (error: any) {
      this.logger.error(Messages.LOGS.REVISIONS_FETCH_FAIL, error.stack);
      throw error;
    }
  }

  async fetchBases(accessToken: string): Promise<AirtableFetchBasesResponse> {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_BASES);
    try {
      const response = await firstValueFrom(
        this.httpService.get<AirtableFetchBasesResponse>(AirtableUrlMapper.BASES, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      this.logger.debug(Messages.LOGS.BASES_FETCH_SUCCESS);
      return response.data;
    } catch (error: any) {
      this.logger.error(Messages.LOGS.BASES_FETCH_FAIL, error.stack);
      throw error;
    }
  }

  async fetchTables(baseId: string, accessToken: string): Promise<AirtableFetchTablesResponse> {
    this.logger.debug(Messages.LOGS.INCOMING_REQ_TABLES(baseId));
    try {
      const response = await firstValueFrom(
        this.httpService.get<AirtableFetchTablesResponse>(AirtableUrlMapper.TABLES(baseId), {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      this.logger.debug(Messages.LOGS.TABLES_FETCH_SUCCESS(baseId));
      return response.data;
    } catch (error: any) {
      this.logger.error(Messages.LOGS.TABLES_FETCH_FAIL(baseId), error.stack);
      throw error;
    }
  }
}
