import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Ticket } from 'src/shared/schemas/ticket.schema';
import { Revision } from 'src/shared/schemas/revision.schema';
import { SyncMeta } from 'src/shared/schemas/sync-meta.schema';
import { AirtableFormulaParser } from 'src/shared/utils/airtable-formula.parser';
import { UserService } from 'src/shared/services/user/user.service';
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
} from 'src/modules/airtable/dtos/airtable.dto';

@Injectable()
export class AirtableService {
  private pkceStore = new Map<string, string>();
  private readonly baseUrl = 'https://api.airtable.com/v0';
  private readonly logger = new Logger(AirtableService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    @InjectModel(Revision.name) private revisionModel: Model<Revision>,
    @InjectModel(SyncMeta.name) private syncMetaModel: Model<SyncMeta>,
  ) {}

  getAuthUrl(): string {
    const clientId = this.configService.get<string>('AIRTABLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('AIRTABLE_REDIRECT_URI');
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(96).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    this.pkceStore.set(state, codeVerifier);
    this.logger.debug('Generated Airtable authorization URL');

    return `https://airtable.com/oauth2/v1/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=data.records:read schema.bases:read&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
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
          'https://airtable.com/oauth2/v1/token',
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
      this.logger.debug('Successfully exchanged code for Airtable token');
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to exchange code for token', error.stack);
      throw error;
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.airtable.com/v0/meta/whoami', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      this.logger.debug('Airtable token validated successfully');
      return true;
    } catch (error: any) {
      this.logger.error('Token validation failed', error.stack);
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
    let offset: string | undefined = undefined;
    let keepFetching = true;
    let ticketsProcessed = 0;

    this.logger.debug(`Starting ticket sync for baseId: ${baseId}, tableId: ${tableId}`);

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

          if (ticketsProcessed % 100 === 0) {
            this.logger.debug(`Sync progress: ${ticketsProcessed} tickets processed...`);
          }
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

      this.logger.debug(`Ticket sync completed successfully. Total processed: ${ticketsProcessed}`);
      return { success: true, processed: ticketsProcessed };
    } catch (error: any) {
      this.logger.error(
        `Ticket sync failed for baseId: ${baseId}, tableId: ${tableId}`,
        error.stack,
      );
      await this.syncMetaModel.findOneAndUpdate(
        { baseId, tableId },
        { ticketSyncStatus: 'FAILED' },
      );
      throw error;
    }
  }

  async getAllTickets(query: GetAllTicketsQueryDto = {}): Promise<PaginatedTicketsResponse> {
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
        this.logger.error('Failed to parse Airtable Formula', e.stack);
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

      this.logger.debug(`Successfully fetched ${data.length} tickets`);
      return { data, total, page: pageNum, limit: limitNum, syncMeta };
    } catch (error: any) {
      this.logger.error('Failed to fetch tickets', error.stack);
      throw error;
    }
  }

  async getRevisions(query: GetRevisionsQueryDto = {}): Promise<PaginatedRevisionsResponse> {
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

      this.logger.debug(`Successfully fetched ${data.length} revisions`);
      return { data, total, page: pageNum, limit: limitNum };
    } catch (error: any) {
      this.logger.error('Failed to fetch revisions', error.stack);
      throw error;
    }
  }

  async fetchBases(accessToken: string): Promise<AirtableFetchBasesResponse> {
    try {
      const url = 'https://api.airtable.com/v0/meta/bases';
      const response = await firstValueFrom(
        this.httpService.get<AirtableFetchBasesResponse>(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      this.logger.debug('Successfully fetched Airtable bases');
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to fetch Airtable bases', error.stack);
      throw error;
    }
  }

  async fetchTables(baseId: string, accessToken: string): Promise<AirtableFetchTablesResponse> {
    try {
      const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const response = await firstValueFrom(
        this.httpService.get<AirtableFetchTablesResponse>(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      this.logger.debug(`Successfully fetched tables for baseId: ${baseId}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to fetch tables for baseId: ${baseId}`, error.stack);
      throw error;
    }
  }
}
