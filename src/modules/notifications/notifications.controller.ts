import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  NotificationDetailDto,
  NotificationSummaryDto,
  PaginatedNotificationsDto,
} from './dto/notification-response.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Search the notification audit trail' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [
          {
            id: '5e8154bf-80ed-45d9-b4b1-80fb57237c7b',
            service_name: 'Jarvis',
            channel: 'SMS',
            recipient: '255689737459',
            message: 'Hello from API Management endpoint!',
            status: 'PROCESSING',
            provider_message_id: '156023',
            retry_count: 0,
            error_message: null,
            created_at: '2025-11-13T12:36:09.751Z',
            updated_at: '2025-11-13T12:36:09.780Z',
          },
        ],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  async findAll(
    @Query() query: QueryNotificationsDto,
  ): Promise<PaginatedNotificationsDto> {
    const { items, total, page, limit } =
      await this.notifications.findAll(query);

    return {
      data: items.map((item) => NotificationSummaryDto.fromEntity(item)),
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Fetch one notification, including provider payloads',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        id: '5e8154bf-80ed-45d9-b4b1-80fb57237c7b',
        service_name: 'Jarvis',
        channel: 'SMS',
        recipient: '255689737459',
        message: 'Hello from API Management endpoint!',
        status: 'PROCESSING',
        provider_message_id: '156023',
        retry_count: 0,
        error_message: null,
        created_at: '2025-11-13T12:36:09.751Z',
        updated_at: '2025-11-13T12:36:09.780Z',
        provider_request_payload: {
          phone_number: '255689737459',
          message: 'Hello from API Management endpoint!',
          sender_id: '137',
        },
        provider_response_payload: {
          status: 200,
          message: 'SMS sent successfully',
          data: { messageId: '156023', status: 'PROCESSING' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No notification with that id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationDetailDto> {
    return NotificationDetailDto.fromEntity(
      await this.notifications.findOne(id),
    );
  }
}
