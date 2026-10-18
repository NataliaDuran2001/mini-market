import { describe, expect, it } from 'vitest';
import { wouldLeaveNoOwner } from './membership';

describe('wouldLeaveNoOwner', () => {
  it('is true for the only active owner', () => {
    expect(wouldLeaveNoOwner({ role: 'owner', status: 'active' }, 1)).toBe(true);
  });

  it('is false when another active owner remains', () => {
    expect(wouldLeaveNoOwner({ role: 'owner', status: 'active' }, 2)).toBe(false);
  });

  it('is false for an employee or for an owner who is already disabled', () => {
    expect(wouldLeaveNoOwner({ role: 'employee', status: 'active' }, 1)).toBe(false);
    expect(wouldLeaveNoOwner({ role: 'owner', status: 'disabled' }, 0)).toBe(false);
  });
});
