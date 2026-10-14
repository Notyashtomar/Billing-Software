import { BadRequestException } from '@nestjs/common';
import { ApprovalWorkflowService } from './approval-workflow.service';

describe('ApprovalWorkflowService', () => {
  const workflow = new ApprovalWorkflowService();

  it('lets draft invoices post from the invoice page', () => {
    expect(workflow.canPost('draft')).toBe(true);
    expect(workflow.markPosted('draft')).toBe('posted');
  });

  it('lets approved and generated invoices post', () => {
    expect(workflow.markPosted('approved')).toBe('posted');
    expect(workflow.markPosted('generated')).toBe('posted');
  });

  it('rejects already posted invoices', () => {
    expect(workflow.canPost('posted')).toBe(false);
    expect(() => workflow.markPosted('posted')).toThrow(BadRequestException);
  });
});
