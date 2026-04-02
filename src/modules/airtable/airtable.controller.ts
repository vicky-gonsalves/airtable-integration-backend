import { Controller, Get, Post, Query, Body, Res, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
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

@ApiTags('Airtable')
@Controller('airtable')
export class AirtableController {
  constructor(
    private readonly airtableService: AirtableService,
    private readonly airtableScraperService: AirtableScraperService,
    private readonly userService: UserService,
  ) {}

  @Get('auth/url')
  @ApiOperation({ summary: 'Get the Airtable OAuth Authorization URL' })
  @ApiResponse({ status: 200, description: 'Successfully generated OAuth URL.' })
  getAuthUrl() {
    return { url: this.airtableService.getAuthUrl() };
  }

  @Get('auth/callback')
  @ApiOperation({ summary: 'Handle the Airtable OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects to the app client upon successful auth.' })
  @ApiResponse({ status: 500, description: 'Authentication failed.' })
  async handleCallback(@Query() query: AuthCallbackQueryDto, @Res() res: Response) {
    return this.airtableService.handleCallback(query, res);
  }

  @Get('auth/status')
  @UseGuards(AirtableAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Check Airtable authentication status via token' })
  @ApiResponse({ status: 200, description: 'Returns authenticated state.' })
  @ApiResponse({ status: 401, description: 'Unauthorized if token is missing or invalid.' })
  checkAuthStatus() {
    return this.airtableService.checkAuthStatus();
  }

  @Post('auth/logout')
  @ApiOperation({ summary: 'Logout and clear Airtable tokens/cookies' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  logout(@Res() res: Response) {
    return this.airtableService.logout(res);
  }

  @Get('bases')
  @UseGuards(AirtableAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Fetch all Airtable bases available to the user' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved bases.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getBases(@Req() req: Request) {
    return this.airtableService.fetchBases(req.cookies['airtable_access_token']);
  }

  @Get('tables')
  @UseGuards(AirtableAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Fetch tables for a specific Airtable base' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved tables.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getTables(@Req() req: Request, @Query() query: GetTablesQueryDto) {
    return this.airtableService.fetchTables(query.baseId, req.cookies['airtable_access_token']);
  }

  @Post('sync')
  @UseGuards(AirtableAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Sync tickets from a specific Airtable base and table' })
  @ApiResponse({ status: 201, description: 'Tickets successfully synced.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async syncTickets(@Req() req: Request, @Body() body: SyncTicketsDto) {
    return this.airtableService.fetchAndStoreTickets(
      body.baseId,
      body.tableId,
      req.cookies['airtable_access_token'],
    );
  }

  @Post('scrape/auth')
  @ApiOperation({ summary: 'Authenticate the scraper using Airtable credentials and MFA' })
  @ApiResponse({ status: 201, description: 'Scraper authenticated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid credentials or MFA code.' })
  async authenticateScraper(@Body() body: ScraperAuthDto) {
    return this.airtableScraperService.authenticateScraper(body.email, body.password, body.mfaCode);
  }

  @Post('scrape/run')
  @ApiOperation({ summary: 'Run the scraper to fetch revision history for a specific base/table' })
  @ApiResponse({ status: 201, description: 'Revision history scraped successfully.' })
  @ApiResponse({ status: 400, description: 'Scraper authentication required.' })
  async runScraper(@Body() body: RunScraperDto) {
    return this.airtableScraperService.scrapeRevisionHistory(
      body.baseId,
      body.tableId,
      body.cursor,
    );
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Retrieve a paginated list of synced tickets from the local DB' })
  @ApiResponse({ status: 200, description: 'Tickets retrieved successfully.' })
  async getTickets(@Query() query: GetAllTicketsQueryDto) {
    return this.airtableService.getAllTickets(query);
  }

  @Get('revisions')
  @ApiOperation({ summary: 'Retrieve a paginated list of ticket revisions' })
  @ApiResponse({ status: 200, description: 'Revisions retrieved successfully.' })
  async getRevisions(@Query() query: GetRevisionsQueryDto) {
    return this.airtableService.getRevisions(query);
  }

  @Get('users')
  @ApiOperation({ summary: 'Retrieve a paginated list of synced users' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully.' })
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.userService.fetchUsers(query);
  }
}
