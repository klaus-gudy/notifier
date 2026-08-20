import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { AppConfig } from '../../config/configuration';
import { SendEmailDto } from './dto/send-email.dto';

/** Sends transactional email through Resend. The sender address and API key
 *  come from the environment, so neither is baked into the code. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(config: ConfigService) {
    const { apiKey, senderEmail } =
      config.getOrThrow<AppConfig['resend']>('resend');

    this.resend = new Resend(apiKey);
    this.from = senderEmail;
  }

  /** Returns the provider-side email id. */
  async send(dto: SendEmailDto): Promise<string> {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: dto.email,
      subject: dto.subject,
      html: dto.content,
    });

    // Resend resolves with an `error` payload rather than rejecting, so an
    // unchecked call would report a refused send as a success.
    if (error || !data) {
      const reason = error?.message ?? 'Provider returned no email id';
      this.logger.error(`Failed email to ${dto.email}: ${reason}`);

      throw new BadGatewayException({
        message: 'Failed to deliver the email to the provider',
        error: reason,
      });
    }

    this.logger.log(`Sent email ${data.id} to ${dto.email}`);

    return data.id;
  }
}
