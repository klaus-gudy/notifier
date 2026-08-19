/** Payload shape the provider expects on the wire. */
export interface SmsProviderPayload extends Record<string, unknown> {
  phone_number: string;
  message: string;
  sender_id: string;
}

export interface SmsDispatchRequest {
  recipient: string;
  message: string;
}

export interface SmsDispatchResult {
  success: boolean;
  /** Exactly what was sent to the provider, minus credentials. */
  requestPayload: SmsProviderPayload;
  responsePayload: Record<string, unknown> | null;
  providerMessageId: string | null;
  /** Raw provider status string, e.g. "PROCESSING". */
  providerStatus: string | null;
  errorMessage: string | null;
  /** Whether another attempt could plausibly succeed. */
  retryable: boolean;
}

/** Outcome of a delivery-status lookup for one already-dispatched message. */
export interface SmsStatusResult {
  success: boolean;
  /** Raw provider status string, e.g. "DELIVERED". */
  providerStatus: string | null;
  deliveredAt: Date | null;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
}
