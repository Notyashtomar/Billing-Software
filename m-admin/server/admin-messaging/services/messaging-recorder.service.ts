import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type { MessageStatus, MessageType, OtpFailureReason } from '../constants/messaging.enums';
import { MessageLog, MessageLogDocument } from '../schema/message-log.schema';
import { OtpLog, OtpLogDocument } from '../schema/otp-log.schema';

@Injectable()
export class MessagingRecorderService {
  private readonly logger = new Logger(MessagingRecorderService.name);

  constructor(
    @InjectModel(MessageLog.name)
    private readonly messageModel: Model<MessageLogDocument>,
    @InjectModel(OtpLog.name)
    private readonly otpModel: Model<OtpLogDocument>,
  ) {}

  async recordMessage(params: {
    messageType: MessageType | string;
    recipient: string;
    provider?: string;
    template?: string;
    module?: string;
    status: MessageStatus | string;
    subject?: string;
    requestId?: string;
    station?: string;
    errorCode?: string;
    errorMessage?: string;
    retryCount?: number;
    deliveryTimeMs?: number;
    otpId?: string;
    metadata?: Record<string, unknown>;
    sentAt?: Date;
    deliveredAt?: Date;
    failedAt?: Date;
  }): Promise<string> {
    const messageId = `msg_${randomUUID()}`;
    const now = new Date();
    try {
      await this.messageModel.create({
        messageId,
        messageType: params.messageType,
        recipient: params.recipient.toLowerCase(),
        provider: params.provider ?? 'gmail-smtp',
        template: params.template,
        module: params.module ?? 'Authentication',
        status: params.status,
        subject: params.subject,
        requestId: params.requestId,
        station: params.station,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        retryCount: params.retryCount ?? 0,
        deliveryTimeMs: params.deliveryTimeMs,
        otpId: params.otpId,
        metadata: params.metadata,
        sentAt: params.sentAt ?? (params.status !== 'pending' ? now : undefined),
        deliveredAt:
          params.deliveredAt ??
          (params.status === 'delivered' ? now : undefined),
        failedAt:
          params.failedAt ?? (params.status === 'failed' ? now : undefined),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return messageId;
  }

  async recordOtpGenerated(params: {
    userId?: string;
    email?: string;
    phone?: string;
    purpose?: string;
    flightId?: string;
    ipAddress?: string;
    device?: string;
    requestId?: string;
    expiresInMs?: number;
    messageId?: string;
  }): Promise<string> {
    const otpId = `otp_${randomUUID()}`;
    const now = new Date();
    try {
      await this.otpModel.create({
        otpId,
        userId: params.userId,
        email: params.email?.toLowerCase(),
        phone: params.phone,
        generatedAt: now,
        expiresAt: new Date(now.getTime() + (params.expiresInMs ?? 3 * 60 * 1000)),
        attemptCount: 0,
        ipAddress: params.ipAddress,
        device: params.device,
        riskScore: 0,
        status: 'generated',
        purpose: params.purpose,
        flightId: params.flightId,
        messageId: params.messageId,
        metadata: { requestId: params.requestId },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record OTP: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return otpId;
  }

  async recordOtpOutcome(params: {
    email: string;
    flightId?: string;
    purpose?: string;
    status: 'verified' | 'failed' | 'expired' | 'abuse';
    failureReason?: OtpFailureReason | string;
    attemptCount?: number;
    verificationTimeMs?: number;
    ipAddress?: string;
    riskScore?: number;
  }): Promise<void> {
    try {
      const filter: Record<string, unknown> = {
        email: params.email.toLowerCase(),
        status: { $in: ['generated', 'resent'] },
      };
      if (params.flightId) filter.flightId = params.flightId;
      if (params.purpose) filter.purpose = params.purpose;

      const latest = await this.otpModel
        .findOne(filter)
        .sort({ generatedAt: -1 })
        .exec();

      if (!latest) {
        await this.otpModel.create({
          otpId: `otp_${randomUUID()}`,
          email: params.email.toLowerCase(),
          generatedAt: new Date(),
          status: params.status,
          failureReason: params.failureReason,
          attemptCount: params.attemptCount ?? 1,
          verificationTimeMs: params.verificationTimeMs,
          ipAddress: params.ipAddress,
          riskScore: params.riskScore ?? 0,
          flightId: params.flightId,
          purpose: params.purpose,
        });
        return;
      }

      const update: Partial<OtpLog> = {
        status: params.status,
        attemptCount: params.attemptCount ?? latest.attemptCount,
        failureReason: params.failureReason,
        riskScore: params.riskScore ?? latest.riskScore,
      };
      if (params.status === 'verified') {
        update.verifiedAt = new Date();
        update.verificationTimeMs = params.verificationTimeMs;
      }
      await this.otpModel.updateOne({ _id: latest._id }, { $set: update }).exec();
    } catch (error) {
      this.logger.warn(
        `Failed to update OTP outcome: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async recordOtpResent(params: {
    email: string;
    flightId?: string;
    purpose?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await this.otpModel.updateMany(
        {
          email: params.email.toLowerCase(),
          flightId: params.flightId,
          purpose: params.purpose,
          status: { $in: ['generated', 'failed'] },
        },
        { $set: { status: 'resent' } },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to record OTP resent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
