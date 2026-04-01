import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AirtableService } from 'src/shared/services/airtable/airtable.service';

@Injectable()
export class AirtableAuthGuard implements CanActivate {
  constructor(private readonly airtableService: AirtableService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies['airtable_access_token'];

    if (!token) {
      throw new UnauthorizedException(
        'No Airtable access token found in cookies. Please authenticate.',
      );
    }

    const isValid = await this.airtableService.validateToken(token);

    if (!isValid) {
      throw new UnauthorizedException(
        'Airtable access token is invalid or expired. Please re-authenticate.',
      );
    }

    return true;
  }
}
