import { Test, TestingModule } from '@nestjs/testing';
import { AirtableController } from './airtable.controller';

describe('AirtableController', () => {
  let controller: AirtableController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AirtableController],
    }).compile();

    controller = module.get<AirtableController>(AirtableController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
