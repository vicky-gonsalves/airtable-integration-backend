import { Controller, Get, Post, Query, Body, Res, Req, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AirtableService } from 'src/shared/services/airtable/airtable.service';

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

  @Get('bases')
  async getBases(@Req() req: Request) {
    return this.airtableService.fetchBases(this.getToken(req));
  }

  @Get('tables')
  async getTables(@Req() req: Request, @Query('baseId') baseId: string) {
    return this.airtableService.fetchTables(baseId, this.getToken(req));
  }

  @Post('sync')
  async syncTickets(@Req() req: Request, @Body() body: { baseId: string; tableId: string }) {
    return this.airtableService.fetchAndStoreTickets(body.baseId, body.tableId, this.getToken(req));
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
  async getTickets() {
    return this.airtableService.getAllTickets();
  }

  @Get('revisions')
  async getRevisions() {
    return this.airtableService.getAllRevisions();
  }

  @Get('users')
  async getUsers(@Query('accessToken') accessToken: string) {
    return this.airtableService.fetchUsers(accessToken);
  }

  private getToken(req: Request): string {
    const token = req.cookies['airtable_access_token'];
    if (!token)
      throw new BadRequestException('Not authenticated with Airtable. Please connect first.');
    return token;
  }
}
