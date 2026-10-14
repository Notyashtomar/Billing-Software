import { BadRequestException, Injectable } from '@nestjs/common';
import type { InvoiceStatus } from '../shared/enums';

const DRAFT_STATUSES: InvoiceStatus[] = ['draft', 'pending_approval'];
const POSTED_IMMUTABLE: InvoiceStatus[] = ['posted', 'cancelled', 'archived'];

@Injectable()
export class ApprovalWorkflowService {
  canEdit(status: string): boolean {
    return DRAFT_STATUSES.includes(status as InvoiceStatus) || status === 'approved';
  }

  /** Allow currency switch + PDF regeneration before posting. */
  canConvertCurrency(status: string): boolean {
    return (
      DRAFT_STATUSES.includes(status as InvoiceStatus) ||
      status === 'approved' ||
      status === 'generated'
    );
  }

  canSubmit(status: string, approvalRequired: boolean): boolean {
    return status === 'draft' && approvalRequired;
  }

  submitForApproval(status: string): InvoiceStatus {
    if (status !== 'draft') throw new Error('Only drafts can be submitted');
    return 'pending_approval';
  }

  approve(status: string): InvoiceStatus {
    if (status !== 'pending_approval') throw new Error('Not pending approval');
    return 'approved';
  }

  rejectApproval(status: string): InvoiceStatus {
    if (status !== 'pending_approval') throw new Error('Not pending approval');
    return 'draft';
  }

  markGenerated(status: string): InvoiceStatus {
    if (!['approved', 'draft'].includes(status)) {
      throw new Error('Invoice must be draft or approved to generate');
    }
    return 'generated';
  }

  canPost(status: string): boolean {
    return (
      status === 'draft' ||
      status === 'pending_approval' ||
      status === 'approved' ||
      status === 'generated'
    );
  }

  markPosted(status: string): InvoiceStatus {
    if (!this.canPost(status)) {
      throw new BadRequestException(
        `Cannot post invoice in status "${status}". Use a draft, approved, or generated invoice.`,
      );
    }
    return 'posted';
  }

  isImmutable(status: string): boolean {
    return POSTED_IMMUTABLE.includes(status as InvoiceStatus);
  }
}
