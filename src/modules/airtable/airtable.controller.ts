import { Controller, Get, Post, Query, Body, Res, Req, UseGuards, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AirtableService } from 'src/shared/services/airtable/airtable.service';
import { UserService } from 'src/shared/services/user/user.service';
import { AirtableAuthGuard } from 'src/shared/guards/airtable-auth/airtable-auth.guard';
import {
  AuthCallbackQueryDto,
  GetTablesQueryDto,
  SyncTicketsDto,
  ScraperAuthDto,
  RunScraperDto,
  GetAllTicketsQueryDto,
  GetRevisionsQueryDto,
  GetUsersQueryDto,
} from './dtos/airtable.dto';
import { AirtableScraperService } from 'src/shared/services/airtable-scraper/airtable-scraper.service';
import { AirtableUrlMapper } from 'src/shared/mappers/airtable-url.mapper';

@Controller('airtable')
export class AirtableController {
  private readonly logger = new Logger(AirtableController.name);

  constructor(
    private readonly airtableService: AirtableService,
    private readonly airtableScraperService: AirtableScraperService,
    private readonly userService: UserService,
  ) {}

  @Get('auth/url')
  getAuthUrl() {
    this.logger.debug('Incoming request: getAuthUrl');
    return { url: this.airtableService.getAuthUrl() };
  }

  @Get('auth/callback')
  async handleCallback(@Query() query: AuthCallbackQueryDto, @Res() res: Response) {
    this.logger.debug('Incoming request: handleCallback');
    try {
      const tokenData = await this.airtableService.exchangeCodeForToken(query.code, query.state);
      res.cookie('airtable_access_token', tokenData.access_token, {
        httpOnly: true,
        sameSite: 'lax',
      });
      this.logger.debug('Callback successfully handled, redirecting');
      res.redirect(AirtableUrlMapper.APP_CLIENT_REDIRECT);
    } catch (error: any) {
      this.logger.error('Error handling auth callback', error.stack);
      res.status(500).send('Authentication failed');
    }
  }

  @Get('auth/status')
  @UseGuards(AirtableAuthGuard)
  checkAuthStatus() {
    this.logger.debug('Incoming request: checkAuthStatus');
    return {
      authenticated: true,
      message: 'Airtable access token is valid.',
    };
  }

  @Post('auth/logout')
  logout(@Res() res: Response) {
    this.logger.debug('Incoming request: logout');
    this.airtableScraperService.clearCookies();
    res.clearCookie('airtable_access_token', {
      httpOnly: true,
      sameSite: 'lax',
    });
    this.logger.debug('Logout successful');
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  }

  @Get('bases')
  @UseGuards(AirtableAuthGuard)
  async getBases(@Req() req: Request) {
    this.logger.debug('Incoming request: getBases');
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchBases(token);
  }

  @Get('tables')
  @UseGuards(AirtableAuthGuard)
  async getTables(@Req() req: Request, @Query() query: GetTablesQueryDto) {
    this.logger.debug(`Incoming request: getTables for baseId: ${query.baseId}`);
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchTables(query.baseId, token);
  }

  @Post('sync')
  @UseGuards(AirtableAuthGuard)
  async syncTickets(@Req() req: Request, @Body() body: SyncTicketsDto) {
    this.logger.debug(
      `Incoming request: syncTickets for baseId: ${body.baseId}, tableId: ${body.tableId}`,
    );
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchAndStoreTickets(body.baseId, body.tableId, token);
  }

  @Post('scrape/auth')
  async authenticateScraper(@Body() body: ScraperAuthDto) {
    this.logger.debug(`Incoming request: authenticateScraper for email: ${body.email}`);
    return this.airtableScraperService.authenticateScraper(body.email, body.password, body.mfaCode);
  }

  @Post('scrape/run')
  async runScraper(@Body() body: RunScraperDto) {
    this.logger.debug(
      `Incoming request: runScraper for baseId: ${body.baseId}, tableId: ${body.tableId}`,
    );
    return this.airtableScraperService.scrapeRevisionHistory(
      body.baseId,
      body.tableId,
      body.cursor,
    );
  }

  @Get('tickets')
  async getTickets(@Query() query: GetAllTicketsQueryDto) {
    this.logger.debug('Incoming request: getTickets');
    return this.airtableService.getAllTickets(query);
  }

  @Get('revisions')
  async getRevisions(@Query() query: GetRevisionsQueryDto) {
    this.logger.debug(`Incoming request: getRevisions for issueId: ${query.issueId}`);
    return this.airtableService.getRevisions(query);
  }

  @Get('users')
  async getUsers(@Query() query: GetUsersQueryDto) {
    this.logger.debug('Incoming request: getUsers');
    return this.userService.fetchUsers(query);
  }
}
