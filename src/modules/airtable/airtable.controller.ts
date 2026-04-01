import { Controller, Get, Post, Query, Body, Res, Req, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AirtableService } from 'src/shared/services/airtable/airtable.service';
import { AirtableAuthGuard } from 'src/shared/guards/airtable-auth/airtable-auth.guard';

@Controller('airtable')
export class AirtableController {
  constructor(private readonly airtableService: AirtableService) {}

  @Get('auth/url')
  getAuthUrl() {
    return { url: this.airtableService.getAuthUrl() };
  }

  @Get('auth/callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const tokenData = await this.airtableService.exchangeCodeForToken(code, state);
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

  @Get('bases')
  @UseGuards(AirtableAuthGuard)
  async getBases(@Req() req: Request) {
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchBases(token);
  }

  @Get('tables')
  @UseGuards(AirtableAuthGuard)
  async getTables(@Req() req: Request, @Query('baseId') baseId: string) {
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchTables(baseId, token);
  }

  @Post('sync')
  @UseGuards(AirtableAuthGuard)
  async syncTickets(@Req() req: Request, @Body() body: { baseId: string; tableId: string }) {
    const token = req.cookies['airtable_access_token'];
    return this.airtableService.fetchAndStoreTickets(body.baseId, body.tableId, token);
  }

  @Post('scrape/auth')
  async authenticateScraper(@Body() body: { email: string; password: string; mfaCode: string }) {
    return this.airtableService.authenticateScraper(body.email, body.password, body.mfaCode);
  }

  @Post('scrape/run')
  async runScraper(@Body() body: { baseId: string; tableId: string }) {
    return this.airtableService.scrapeRevisionHistory(body.baseId, body.tableId);
  }

  @Get('tickets')
  async getTickets(@Query() query: any) {
    return this.airtableService.getAllTickets(query);
  }

  @Get('revisions')
  async getRevisions() {
    return this.airtableService.getAllRevisions();
  }

  @Get('users')
  async getUsers(@Query('accessToken') accessToken: string) {
    return this.airtableService.fetchUsers(accessToken);
  }
}
