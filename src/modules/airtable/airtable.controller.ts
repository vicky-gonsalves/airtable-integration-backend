import { Controller, Get, Post, Query, Body, Res, Req, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AirtableService } from 'src/shared/services/airtable/airtable.service';
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

@Controller('airtable')
export class AirtableController {
  constructor(private readonly airtableService: AirtableService) {}

  @Get('auth/url')
  getAuthUrl() {
    return { url: this.airtableService.getAuthUrl() };
  }

  @Get('auth/callback')
  async handleCallback(@Query() query: AuthCallbackQueryDto, @Res() res: Response) {
    const tokenData = await this.airtableService.exchangeCodeForToken(query.code, query.state);
    res.cookie('airtable_access_token', tokenData.access_token, {
      httpOnly: true,
      sameSite: 'lax',
    });
    res.redirect('http://localhost:4200/');
  }

  @Get('auth/status')
  @UseGuards(AirtableAuthGuard)
  checkAuthStatus() {
    return {
      authenticated: true,
      message: 'Airtable access token is valid.',
    };
  }

  @Post('auth/logout')
  logout(@Res() res: Response) {
    this.airtableService.clearCookies();
    res.clearCookie('airtable_access_token', {
      httpOnly: true,
      sameSite: 'lax',
    });
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  }

  @Get('bases')
  @UseGuards(AirtableAuthGuard)
  async getBases(@Req() req: Request) {
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchBases(token);
  }

  @Get('tables')
  @UseGuards(AirtableAuthGuard)
  async getTables(@Req() req: Request, @Query() query: GetTablesQueryDto) {
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchTables(query.baseId, token);
  }

  @Post('sync')
  @UseGuards(AirtableAuthGuard)
  async syncTickets(@Req() req: Request, @Body() body: SyncTicketsDto) {
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchAndStoreTickets(body.baseId, body.tableId, token);
  }

  @Post('scrape/auth')
  async authenticateScraper(@Body() body: ScraperAuthDto) {
    return this.airtableService.authenticateScraper(body.email, body.password, body.mfaCode);
  }

  @Post('scrape/run')
  async runScraper(@Body() body: RunScraperDto) {
    return this.airtableService.scrapeRevisionHistory(body.baseId, body.tableId, body.cursor);
  }

  @Get('tickets')
  async getTickets(@Query() query: GetAllTicketsQueryDto) {
    return this.airtableService.getAllTickets(query);
  }

  @Get('revisions')
  async getRevisions(@Query() query: GetRevisionsQueryDto) {
    return this.airtableService.getRevisions(query);
  }

  @Get('users')
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.airtableService.fetchUsers(query);
  }
}
