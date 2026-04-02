import { Test, TestingModule } from '@nestjs/testing';
import { AirtableScraperService } from './airtable-scraper.service';

describe('AirtableScraperService', () => {
  let service: AirtableScraperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AirtableScraperService],
    }).compile();

    service = module.get<AirtableScraperService>(AirtableScraperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
