import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, IsNumberString } from 'class-validator';

export class AuthCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  state: string;
}

export class GetTablesQueryDto {
  @IsString()
  @IsNotEmpty()
  baseId: string;
}

export class SyncTicketsDto {
  @IsString()
  @IsNotEmpty()
  baseId: string;

  @IsString()
  @IsNotEmpty()
  tableId: string;
}

export class ScraperAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  mfaCode: string;
}

export class RunScraperDto {
  @IsString()
  @IsNotEmpty()
  baseId: string;

  @IsString()
  @IsNotEmpty()
  tableId: string;

  @IsString()
  @IsOptional()
  cursor?: string;
}

export class GetAllTicketsQueryDto {
  @IsString()
  @IsOptional()
  baseId?: string;

  @IsString()
  @IsOptional()
  tableId?: string;

  @IsNumberString()
  @IsOptional()
  page?: string;

  @IsNumberString()
  @IsOptional()
  limit?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';

  @IsString()
  @IsOptional()
  formula?: string;
}

export class GetRevisionsQueryDto {
  @IsString()
  @IsOptional()
  issueId?: string;

  @IsNumberString()
  @IsOptional()
  page?: string;

  @IsNumberString()
  @IsOptional()
  limit?: string;
}

export class GetUsersQueryDto {
  @IsNumberString()
  @IsOptional()
  page?: string;

  @IsNumberString()
  @IsOptional()
  limit?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
