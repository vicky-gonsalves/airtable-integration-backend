import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthCallbackQueryDto {
  @ApiProperty({ description: 'The authorization code returned by Airtable during OAuth' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'The state parameter used to verify the OAuth callback' })
  @IsString()
  @IsNotEmpty()
  state: string;
}

export class GetTablesQueryDto {
  @ApiProperty({ description: 'The unique ID of the Airtable base' })
  @IsString()
  @IsNotEmpty()
  baseId: string;
}

export class SyncTicketsDto {
  @ApiProperty({ description: 'The unique ID of the Airtable base' })
  @IsString()
  @IsNotEmpty()
  baseId: string;

  @ApiProperty({ description: 'The unique ID of the Airtable table' })
  @IsString()
  @IsNotEmpty()
  tableId: string;
}

export class ScraperAuthDto {
  @ApiProperty({ description: 'The email address for the Airtable account' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'The password for the Airtable account' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'The MFA/TOTP code for 2-factor authentication' })
  @IsString()
  @IsNotEmpty()
  mfaCode: string;
}

export class RunScraperDto {
  @ApiProperty({ description: 'The unique ID of the Airtable base' })
  @IsString()
  @IsNotEmpty()
  baseId: string;

  @ApiProperty({ description: 'The unique ID of the Airtable table' })
  @IsString()
  @IsNotEmpty()
  tableId: string;

  @ApiPropertyOptional({ description: 'Optional cursor for paginated scraping operations' })
  @IsString()
  @IsOptional()
  cursor?: string;
}

export class GetAllTicketsQueryDto {
  @ApiPropertyOptional({ description: 'Filter tickets by a specific base ID' })
  @IsString()
  @IsOptional()
  baseId?: string;

  @ApiPropertyOptional({ description: 'Filter tickets by a specific table ID' })
  @IsString()
  @IsOptional()
  tableId?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', default: '0' })
  @IsNumberString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page limit', default: '20' })
  @IsNumberString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search term to match against multiple ticket fields' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Field to sort the results by' })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Direction to sort the results',
    enum: ['asc', 'desc'],
    default: 'asc',
  })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'An Airtable formula to parse and filter tickets' })
  @IsString()
  @IsOptional()
  formula?: string;
}

export class GetRevisionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter revisions by a specific ticket/issue ID' })
  @IsString()
  @IsOptional()
  issueId?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', default: '0' })
  @IsNumberString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page limit', default: '20' })
  @IsNumberString()
  @IsOptional()
  limit?: string;
}

export class GetUsersQueryDto {
  @ApiPropertyOptional({ description: 'Page number for pagination', default: '0' })
  @IsNumberString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page limit', default: '20' })
  @IsNumberString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search term for user names, emails, or IDs' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Field to sort the users by' })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Direction to sort the results',
    enum: ['asc', 'desc'],
    default: 'asc',
  })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
