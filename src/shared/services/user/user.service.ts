import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/shared/schemas/user.schema';
import { PaginatedUsersResponse } from 'src/shared/interfaces/airtable-responses.interface';
import { ExtractedUser } from 'src/shared/interfaces/airtable-models.interface';
import { IUser } from 'src/shared/interfaces/user.interface';
import { GetUsersQueryDto } from 'src/modules/airtable/dtos/airtable.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async upsertUsers(users: Iterable<ExtractedUser>): Promise<void> {
    for (const user of users) {
      await this.userModel.findOneAndUpdate(
        { airtableId: user.airtableId },
        { $set: user },
        { upsert: true },
      );
    }
  }

  async fetchUsers(query: GetUsersQueryDto = {}): Promise<PaginatedUsersResponse> {
    const { page = '0', limit = '20', search = '', sortBy = '', sortOrder = 'asc' } = query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = pageNum * limitNum;

    const filterQuery: Record<string, any> = {};

    if (search) {
      filterQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { airtableId: { $regex: search, $options: 'i' } },
      ];
    }

    const sortObj: Record<string, 1 | -1> = {};
    if (sortBy) {
      sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortObj['createdAt'] = -1;
    }

    try {
      const [data, total] = await Promise.all([
        this.userModel
          .find(filterQuery)
          .select('-__v')
          .sort(sortObj)
          .skip(skip)
          .limit(limitNum)
          .lean<IUser[]>()
          .exec(),
        this.userModel.countDocuments(filterQuery).exec(),
      ]);

      return { data, total, page: pageNum, limit: limitNum };
    } catch (error) {
      console.log(error);
      throw new BadRequestException('Failed to fetch users');
    }
  }
}
