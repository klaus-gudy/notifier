import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { SmsDispatchService } from './sms-dispatch.service';

const config: Record<string, unknown> = {
  'notify.baseUrl': 'https://api.notify.africa/api/v1',
  'notify.apiKey': 'test-token',
  'notify.senderId': '137',
  'notify.timeoutMs': 15000,
};

const axiosResponse = (data: unknown, status = 200): AxiosResponse =>
  ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {},
  }) as AxiosResponse;

const axiosFailure = (status: number, data: unknown): AxiosError =>
  Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    response: { status, data },
  }) as AxiosError;

describe('SmsDispatchService', () => {
  let service: SmsDispatchService;
  let post: jest.Mock;

  beforeEach(async () => {
    post = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SmsDispatchService,
        { provide: HttpService, useValue: { post } },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(SmsDispatchService);
  });

  it('prepares only the payload the provider expects', () => {
    expect(
      service.buildPayload({ recipient: '255689737459', message: 'Hello' }),
    ).toEqual({
      phone_number: '255689737459',
      message: 'Hello',
      sender_id: '137',
    });
  });

  it('posts to the provider send endpoint with a bearer token', async () => {
    post.mockReturnValue(
      of(
        axiosResponse({
          status: 200,
          data: { messageId: '156023', status: 'PROCESSING' },
        }),
      ),
    );

    const result = await service.dispatch({
      recipient: '255689737459',
      message: 'Hello from API Management endpoint!',
    });

    const [url, body, options] = post.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];

    expect(url).toBe('https://api.notify.africa/api/v1/api/messages/send');
    expect(body).toEqual({
      phone_number: '255689737459',
      message: 'Hello from API Management endpoint!',
      sender_id: '137',
    });
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('156023');
    expect(result.providerStatus).toBe('PROCESSING');
  });

  it('treats an error status inside a 2xx envelope as a rejection', async () => {
    post.mockReturnValue(
      of(axiosResponse({ status: 422, message: 'Invalid sender id' })),
    );

    const result = await service.dispatch({
      recipient: '255689737459',
      message: 'Hi',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Invalid sender id');
    expect(result.retryable).toBe(false);
  });

  it('marks provider 5xx responses as retryable and 4xx as final', async () => {
    post.mockReturnValueOnce(
      throwError(() => axiosFailure(503, { message: 'Unavailable' })),
    );
    await expect(
      service.dispatch({ recipient: '255689737459', message: 'Hi' }),
    ).resolves.toMatchObject({ success: false, retryable: true });

    post.mockReturnValueOnce(
      throwError(() => axiosFailure(401, { message: 'Unauthorized' })),
    );
    await expect(
      service.dispatch({ recipient: '255689737459', message: 'Hi' }),
    ).resolves.toMatchObject({ success: false, retryable: false });
  });

  it('fails fast when provider credentials are missing', async () => {
    const withoutKey = new SmsDispatchService(
      { post } as unknown as HttpService,
      {
        get: (key: string) => (key === 'notify.apiKey' ? '' : config[key]),
      } as ConfigService,
    );

    const result = await withoutKey.dispatch({
      recipient: '255689737459',
      message: 'Hi',
    });

    expect(post).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      retryable: false,
      errorMessage: 'NOTIFY_API_KEY is not configured',
    });
  });
});
