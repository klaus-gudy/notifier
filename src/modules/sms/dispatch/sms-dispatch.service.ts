import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  SmsDispatchRequest,
  SmsDispatchResult,
  SmsProviderPayload,
} from './dispatch.types';

const SEND_PATH = '/api/messages/send';

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
    const baseUrl = this.config.get<string>('notify.baseUrl') ?? '';
    const apiKey = this.config.get<string>('notify.apiKey') ?? '';
    const url = `${baseUrl.replace(/\/+$/, '')}${SEND_PATH}`;

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
