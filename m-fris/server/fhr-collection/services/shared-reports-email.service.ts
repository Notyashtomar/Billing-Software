import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FhrCollection,
  FhrCollectionDocument,
} from '../schema/fhr-collection.schema';
import { SendSharedReportsEmailDto } from '../dto/send-shared-reports-email.dto';
import { AdvanceGhrepService } from 'src/advance-ghrep/services/advance-ghrep.service';
import { AdvanceGatewayScheduledAirlineService } from 'src/advance-gateway-scheduled-airline/services/advance-gateway-scheduled-airline.service';
import { AdvanceContactService } from 'src/advance-contact/services/advance-contact.service';
import { PaxShiftReportEmailService } from 'src/reports-pax-shift-report/services/pax-shift-report-email.service';
import { MessagingRecorderService } from 'src/admin-messaging/services/messaging-recorder.service';

const BIRD_SENDER_NAME = 'BIRD AIRPORT SERVICES';

function pickGhRepNameFromMainDetails(
  mainDetails: Record<string, unknown> | null | undefined,
): string {
  if (!mainDetails || typeof mainDetails !== 'object') return '';
  return String(
    mainDetails.ghRep ?? mainDetails.PAX_Airline_SignByDate ?? '',
  ).trim();
}

function pickAirlineFromMainDetails(mainDetails: Record<string, unknown>): {
  airlineName: string;
  airlineCode: string;
  flightNo: string;
} {
  const airlineName = String(mainDetails.Airline ?? mainDetails.airlineName ?? '').trim();
  const airlineCode = String(
    mainDetails.Arline_Code ?? mainDetails.airlineCode ?? '',
  ).trim();
  const flightNo =
    String(
      mainDetails.DepartureFltNo ??
        mainDetails.ArrivalFltNo ??
        mainDetails.flightCode ??
        '',
    ).trim() || '';
  return { airlineName, airlineCode, flightNo };
}

function isShareFlagEnabled(
  doc: Record<string, unknown>,
  mainDetails: Record<string, unknown> | null | undefined,
  key: 'shareFhrToAirline' | 'shareReportsToGhRep',
): boolean {
  if (doc[key] === true) return true;
  if (!mainDetails || typeof mainDetails !== 'object') return false;
  return mainDetails[key] === true;
}

function isSentTimestamp(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const parsed = new Date(String(value));
  return !Number.isNaN(parsed.getTime());
}

function hasOperationalLocks(doc: Record<string, unknown>): boolean {
  const ramp =
    doc.rampDetails1 != null &&
    typeof doc.rampDetails1 === 'object' &&
    !Array.isArray(doc.rampDetails1);
  const terminal =
    doc.terminalDetails != null &&
    typeof doc.terminalDetails === 'object' &&
    !Array.isArray(doc.terminalDetails);
  const eqE = doc.equipmentManpower;
  let gsd = false;
  if (eqE != null && typeof eqE === 'object' && !Array.isArray(eqE)) {
    const e = eqE as Record<string, unknown>;
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length > 0) gsd = true;
    else {
      for (const k of [
        'verifiedBy',
        'verifiedAt',
        'verifiedByCode',
        'flightNo',
        'airlinesOperator',
        'sta',
        'staDate',
        'std',
        'stdDate',
        'acType',
        'routing',
        'operations',
      ]) {
        if (String(e[k] ?? '').trim()) {
          gsd = true;
          break;
        }
      }
    }
  }
  return ramp && terminal && gsd;
}

@Injectable()
export class SharedReportsEmailService {
  private readonly logger = new Logger(SharedReportsEmailService.name);

  constructor(
    @InjectModel(FhrCollection.name)
    private readonly fhrModel: Model<FhrCollectionDocument>,
    private readonly advanceGhrepService: AdvanceGhrepService,
    private readonly advanceGatewayScheduledAirlineService: AdvanceGatewayScheduledAirlineService,
    private readonly advanceContactService: AdvanceContactService,
    private readonly paxShiftReportEmailService: PaxShiftReportEmailService,
    @Optional()
    @Inject(forwardRef(() => MessagingRecorderService))
    private readonly messagingRecorder?: MessagingRecorderService,
  ) {}

  async sendForFlight(
    serialNo: number,
    dto: SendSharedReportsEmailDto,
  ): Promise<
    | { sent: true; toEmails: string[]; shareTarget: string }
    | { sent: false; alreadySent: true; toEmails: string[]; shareTarget: string }
  > {
    const shareTarget = dto.shareTarget;
    const doc = await this.fhrModel
      .findOne({
        $or: [{ SerialNo: serialNo }, { flightSerialNumber: serialNo }],
      })
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException(
        `No fhr_collection document for serial ${serialNo}`,
      );
    }

    const alreadySentField =
      shareTarget === 'airline-fhr'
        ? 'airlineFhrEmailSentAt'
        : 'ghRepLockedReportsEmailSentAt';
    const alreadyToField =
      shareTarget === 'airline-fhr'
        ? 'airlineFhrEmailTo'
        : 'ghRepLockedReportsEmailTo';

    if (isSentTimestamp(doc[alreadySentField as keyof typeof doc])) {
      const prior = String(doc[alreadyToField as keyof typeof doc] ?? '').trim();
      return {
        sent: false,
        alreadySent: true,
        toEmails: prior ? [prior] : [],
        shareTarget,
      };
    }

    if (!hasOperationalLocks(doc as unknown as Record<string, unknown>)) {
      throw new BadRequestException(
        'Ramp, Terminal (Pax), and GSD locks must all be complete before sending reports.',
      );
    }

    const mainDetails =
      doc.mainDetails != null &&
      typeof doc.mainDetails === 'object' &&
      !Array.isArray(doc.mainDetails)
        ? (doc.mainDetails as unknown as Record<string, unknown>)
        : null;

    const shareFlagKey =
      shareTarget === 'airline-fhr' ? 'shareFhrToAirline' : 'shareReportsToGhRep';
    if (
      !isShareFlagEnabled(
        doc as unknown as Record<string, unknown>,
        mainDetails,
        shareFlagKey,
      )
    ) {
      throw new BadRequestException(
        shareTarget === 'airline-fhr'
          ? '“Share FHR to Airline” is not enabled in Main Details for this flight.'
          : '“Share FHR, GSE and Team report to GH representative” is not enabled in Main Details for this flight.',
      );
    }

    const main = mainDetails ?? {};
    const { airlineName, airlineCode, flightNo } =
      pickAirlineFromMainDetails(main);
    const safeSerial = String(serialNo).replace(/[^\w.-]+/g, '_') || 'flight';

    let recipientEmail = '';
    let subject = '';
    let textLines: string[] = [];
    let htmlTitle = '';

    if (shareTarget === 'airline-fhr') {
      recipientEmail =
        (await this.advanceGatewayScheduledAirlineService.findActiveEmailByAirlineCodeOrName(
          airlineCode,
          airlineName,
        )) ?? '';
      if (!recipientEmail) {
        recipientEmail =
          (await this.advanceContactService.findEmailByAirlineNameOrCode(
            airlineCode,
            airlineName,
          )) ?? '';
      }
      if (!recipientEmail) {
        throw new NotFoundException(
          `No airline email found for "${airlineName || airlineCode || 'this flight'}". Add the email in Advance → Gateway → Scheduled Airline or Airline Contact.`,
        );
      }
      subject = `Flight Handling Report (FHR) — ${flightNo || safeSerial}`;
      htmlTitle = 'Flight Handling Report (FHR)';
      textLines = [
        'FLIGHT HANDLING REPORT',
        '',
        `Serial: ${serialNo}`,
        `Airline: ${airlineName || '—'}`,
        `Flight: ${flightNo || '—'}`,
        '',
        'All operational sections are locked. The FHR report is attached as a PDF.',
        '',
        BIRD_SENDER_NAME,
      ];
    } else {
      const ghRepName = pickGhRepNameFromMainDetails(mainDetails);
      if (!ghRepName) {
        throw new BadRequestException(
          'GH Representative is not set in Main Details for this flight.',
        );
      }
      recipientEmail =
        (await this.advanceGhrepService.findActiveEmailByRepresentativeName(
          ghRepName,
        )) ?? '';
      if (!recipientEmail) {
        throw new NotFoundException(
          `No active GH representative email found for "${ghRepName}". Add the representative in Advance → GH Representative.`,
        );
      }
      subject = `Flight Reports (FHR, GSE, Team) — ${flightNo || safeSerial}`;
      htmlTitle = 'Flight Reports (FHR, GSE, Team)';
      textLines = [
        'FLIGHT HANDLING REPORTS',
        '',
        `Serial: ${serialNo}`,
        `Airline: ${airlineName || '—'}`,
        `Flight: ${flightNo || '—'}`,
        `GH Representative: ${ghRepName}`,
        '',
        'All operational sections are locked. The FHR, GSE, and Team reports are attached as PDFs.',
        '',
        BIRD_SENDER_NAME,
      ];
    }

    const htmlSummary = textLines
      .slice(0, -2)
      .join('\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');

    const attachments = (dto.attachments ?? []).map((a, i) => ({
      filename:
        String(a.filename ?? '').trim() ||
        `Flight-Report-${safeSerial}-${i + 1}.pdf`,
      pdfBase64: a.pdfBase64,
    }));

    const sendStarted = Date.now();
    const sendResult =
      await this.paxShiftReportEmailService.sendMultiPdfReportEmail({
        emails: [recipientEmail],
        subject,
        textBody: textLines.join('\n'),
        htmlBody: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">
  <p style="margin:0 0 12px;font-size:16px;font-weight:600;">${htmlTitle}</p>
  <div style="margin:16px 0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">${htmlSummary}</div>
  <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">${BIRD_SENDER_NAME}</p>
</body>
</html>`,
        attachments,
      });

    void this.messagingRecorder?.recordMessage({
      messageType: 'email',
      recipient: recipientEmail,
      template: 'shared-reports',
      module: 'Reports',
      status: 'delivered',
      subject,
      deliveryTimeMs: Date.now() - sendStarted,
      metadata: { serialNo, shareTarget, flightNo },
    });

    const marked = await this.fhrModel
      .findOneAndUpdate(
        {
          $and: [
            {
              $or: [{ SerialNo: serialNo }, { flightSerialNumber: serialNo }],
            },
            {
              $or: [
                { [alreadySentField]: { $exists: false } },
                { [alreadySentField]: null },
              ],
            },
          ],
        },
        {
          $set: {
            [alreadySentField]: new Date(),
            [alreadyToField]: recipientEmail,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!marked) {
      this.logger.warn(
        `Shared reports email (${shareTarget}) sent for serial ${serialNo} but idempotency mark lost (concurrent send).`,
      );
    }

    return { sent: true, toEmails: sendResult.toEmails, shareTarget };
  }
}
