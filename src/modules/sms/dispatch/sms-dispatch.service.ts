import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  SmsDispatchRequest,
  SmsDispatchResult,
  SmsProviderPayload,
  SmsStatusResult,
} from './dispatch.types';

const SEND_PATH = '/api/messages/send';
const STATUS_PATH = '/api/messages/status';

/**
 * The only place that knows how the downstream SMS provider is shaped: it
 * prepares the provider payload, performs a single send, and normalises both
 * the success and the failure case into a result the caller can persist.
 * Swapping providers means changing this file and nothing else.
 */
@Injectable()
export class SmsDispatchService {
  private readonly logger = new Logger(SmsDispatchService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private baseUrl(): string {
    return (this.config.get<string>('notify.baseUrl') ?? '').replace(
      /\/+$/,
      '',
    );
  }

  /** Builds the provider payload. Kept public so it can be asserted in tests. */
  buildPayload(request: SmsDispatchRequest): SmsProviderPayload {
    return {
      phone_number: request.recipient,
      message: request.message,
      sender_id: this.config.get<string>('notify.senderId') ?? '',
    };
  }

  async dispatch(request: SmsDispatchRequest): Promise<SmsDispatchResult> {
    const payload = this.buildPayload(request);
    const apiKey = this.config.get<string>('notify.apiKey') ?? '';
    const url = `${this.baseUrl()}${SEND_PATH}`;

    if (!apiKey) {
      return this.failure(payload, 'NOTIFY_API_KEY is not configured', false);
    }
    if (!payload.sender_id) {
      return this.failure(payload, 'NOTIFY_SENDER_ID is not configured', false);
    }

    try {
      const response = await firstValueFrom(
        this.http.post<Record<string, unknown>>(url, payload, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.get<number>('notify.timeoutMs'),
        }),
      );

      return this.interpret(payload, response);
    } catch (error) {
      return this.interpretError(payload, error);
    }
  }

  /**
   * Asks the provider where a previously-accepted message got to. Read-only:
   * it never resends, so it is safe to call repeatedly.
   */
  async checkStatus(providerMessageId: string): Promise<SmsStatusResult> {
    const apiKey = this.config.get<string>('notify.apiKey') ?? '';

    if (!apiKey) {
      return {
        success: false,
        providerStatus: null,
        deliveredAt: null,
        responsePayload: null,
        errorMessage: 'NOTIFY_API_KEY is not configured',
      };
    }

    const url = `${this.baseUrl()}${STATUS_PATH}/${encodeURIComponent(providerMessageId)}`;

    try {
      const response = await firstValueFrom(
        this.http.get<Record<string, unknown>>(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: this.config.get<number>('notify.timeoutMs'),
        }),
      );

      const body = response.data ?? {};
      const data = (body.data ?? {}) as Record<string, unknown>;
      const bodyStatus =
        typeof body.status === 'number' ? body.status : response.status;

      if (bodyStatus >= 400) {
        return {
          success: false,
          providerStatus: null,
          deliveredAt: null,
          responsePayload: body,
          errorMessage:
            typeof body.message === 'string'
              ? body.message
              : `Provider returned status ${bodyStatus}`,
        };
      }

      return {
        success: true,
        providerStatus:
          typeof data.status === 'string' ? data.status.toUpperCase() : null,
        deliveredAt:
          typeof data.deliveredAt === 'string'
            ? new Date(data.deliveredAt)
            : null,
        responsePayload: body,
        errorMessage: null,
      };
    } catch (error) {
      const axiosError = error as AxiosError<Record<string, unknown>>;
      const body = axiosError?.response?.data ?? null;

      return {
        success: false,
        providerStatus: null,
        deliveredAt: null,
        responsePayload: body,
        errorMessage:
          typeof body?.message === 'string'
            ? body.message
            : (axiosError?.message ?? 'Unknown transport error'),
      };
    }
  }

  private interpret(
    payload: SmsProviderPayload,
    response: AxiosResponse<Record<string, unknown>>,
  ): SmsDispatchResult {
    const body = response.data ?? {};
    const data = (body.data ?? {}) as Record<string, unknown>;
    const bodyStatus =
      typeof body.status === 'number' ? body.status : response.status;

    // The provider mirrors an HTTP status inside the body; a 2xx envelope
    // carrying a 4xx/5xx body status is still a rejection.
    if (bodyStatus >= 400) {
      return {
        success: false,
        requestPayload: payload,
        responsePayload: body,
        providerMessageId: null,
        providerStatus: null,
        errorMessage:
          typeof body.message === 'string'
            ? body.message
            : `Provider rejected the message with status ${bodyStatus}`,
        retryable: bodyStatus >= 500 || bodyStatus === 429,
      };
    }

    const messageId = data.messageId;

    return {
      success: true,
      requestPayload: payload,
      responsePayload: body,
      providerMessageId:
        typeof messageId === 'string' || typeof messageId === 'number'
          ? String(messageId)
          : null,
      providerStatus: typeof data.status === 'string' ? data.status : null,
      errorMessage: null,
      retryable: false,
    };
  }

  private interpretError(
    payload: SmsProviderPayload,
    error: unknown,
  ): SmsDispatchResult {
    const axiosError = error as AxiosError<Record<string, unknown>>;

    if (axiosError?.isAxiosError && axiosError.response) {
      const status = axiosError.response.status;
      const body = axiosError.response.data ?? {};

      return {
        success: false,
        requestPayload: payload,
        responsePayload: body,
        providerMessageId: null,
        providerStatus: null,
        errorMessage:
          typeof body.message === 'string'
            ? body.message
            : `Provider responded with HTTP ${status}`,
        retryable: status >= 500 || status === 429,
      };
    }

    // No response at all: DNS, connection refused, or timeout. Worth retrying.
    const reason = axiosError?.message ?? 'Unknown transport error';
    this.logger.warn(`SMS dispatch transport failure: ${reason}`);

    return this.failure(payload, reason, true);
  }

  private failure(
    payload: SmsProviderPayload,
    errorMessage: string,
    retryable: boolean,
  ): SmsDispatchResult {
    return {
      success: false,
      requestPayload: payload,
      responsePayload: null,
      providerMessageId: null,
      providerStatus: null,
      errorMessage,
      retryable,
    };
  }
}
