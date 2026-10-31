import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allDayRange,
  availabilityMessage,
  averageStageSeconds,
  bookingWindow,
  conversionCohort,
  groupedConversion,
  nextDay,
  outcomeCounts,
  quoteTotal,
  rangesOverlap,
  reservationWindow,
  sameIds,
  sameMoney,
  stageDeleteError,
  stageOrderError,
  wonStageError,
} from '../src/domain/crm';

describe('quoteTotal', () => {
  it('adds charges and fees and subtracts the discount', () => {
    const result = quoteTotal({ package_price: 100, additional_charges: 20, other_fees: 5, discounts: 10 });
    assert.deepEqual(result, { ok: true, total: 115 });
  });

  it('rounds fractional amounts in cents', () => {
    const result = quoteTotal({ package_price: 0.1, additional_charges: 0.2, other_fees: 0, discounts: 0 });
    assert.deepEqual(result, { ok: true, total: 0.3 });
  });

  it('rejects a discount larger than the other amounts', () => {
    const result = quoteTotal({ package_price: 10, additional_charges: 0, other_fees: 0, discounts: 10.01 });
    assert.equal(result.ok, false);
  });
});

describe('sameMoney and sameIds', () => {
  it('treats equivalent money as equal and ignores id order', () => {
    assert.equal(sameMoney(10, 10.0), true);
    assert.equal(sameMoney(null, null), true);
    assert.equal(sameMoney(1, null), false);
    assert.equal(sameIds([3, 1, 2], [1, 2, 3]), true);
    assert.equal(sameIds([1], [1, 2]), false);
  });
});

describe('reservation windows', () => {
  it('turns a date-only start into that calendar day', () => {
    assert.deepEqual(reservationWindow('2026-01-01', null), {
      ok: true,
      window: { start: '2026-01-01 00:00:00', end: '2026-01-02 00:00:00' },
    });
  });

  it('holds a timed start without an end until midnight', () => {
    assert.deepEqual(reservationWindow('2026-01-01T14:00', null), {
      ok: true,
      window: { start: '2026-01-01 14:00:00', end: '2026-01-02 00:00:00' },
    });
  });

  it('rejects an end that is not after the start', () => {
    const result = reservationWindow('2026-01-01 14:00:00', '2026-01-01 12:00:00');
    assert.equal(result.ok, false);
  });

  it('leaves an empty stay empty', () => {
    assert.deepEqual(reservationWindow(null, null), { ok: true, window: null });
  });

  it('maps inclusive booking dates onto a half-open window and rolls the year', () => {
    assert.deepEqual(bookingWindow('2026-01-01', '2026-01-03'), {
      start: '2026-01-01 00:00:00',
      end: '2026-01-04 00:00:00',
    });
    assert.equal(nextDay('2026-12-31'), '2027-01-01');
  });

  it('treats a checkout that meets the next check-in as free', () => {
    const first = bookingWindow('2026-01-01', '2026-01-03');
    const second = { start: '2026-01-04 00:00:00', end: '2026-01-06 00:00:00' };
    assert.equal(rangesOverlap(first.start, first.end, second.start, second.end), false);
    assert.equal(rangesOverlap(first.start, first.end, '2026-01-03 00:00:00', '2026-01-05 00:00:00'), true);
  });

  it('uses the checkout morning as the exclusive calendar end', () => {
    assert.deepEqual(allDayRange('2026-11-01T14:00:00', '2026-11-03T11:00:00'), {
      start: '2026-11-01',
      end: '2026-11-04',
    });
    assert.deepEqual(allDayRange('2026-11-01T00:00:00', '2026-11-03T00:00:00'), {
      start: '2026-11-01',
      end: '2026-11-03',
    });
  });
});

describe('conversionCohort', () => {
  const rows = [
    { outcome: 'open' as const, created_at: '2026-01-01T00:00:00.000Z', converted_at: null },
    { outcome: 'won' as const, created_at: '2026-01-01T00:00:00.000Z', converted_at: '2026-01-03T00:00:00.000Z' },
    { outcome: 'open' as const, created_at: '2026-01-01T00:00:00.000Z', converted_at: '2026-01-02T00:00:00.000Z' },
    { outcome: 'lost' as const, created_at: '2026-01-01T00:00:00.000Z', converted_at: '2026-01-04T00:00:00.000Z' },
  ];

  it('keeps a reopened inquiry converted and drops lost inquiries from both sides', () => {
    assert.deepEqual(conversionCohort(rows), {
      eligible: 3,
      converted: 2,
      conversion_rate: 66.7,
      average_seconds: 129600,
    });
    assert.deepEqual(outcomeCounts(rows), { open: 2, confirmed: 1, lost: 1 });
  });

  it('returns a null rate when nobody is eligible', () => {
    assert.equal(conversionCohort([]).conversion_rate, null);
    assert.equal(conversionCohort([{ outcome: 'lost', created_at: '2026-01-01T00:00:00.000Z', converted_at: null }]).eligible, 0);
  });

  it('groups the same rules by agent', () => {
    const grouped = groupedConversion([
      { key: '2', label: 'Bea', outcome: 'won', created_at: '2026-01-01T00:00:00.000Z', converted_at: '2026-01-02T00:00:00.000Z' },
      { key: '1', label: 'Ana', outcome: 'open', created_at: '2026-01-01T00:00:00.000Z', converted_at: null },
      { key: '1', label: 'Ana', outcome: 'lost', created_at: '2026-01-01T00:00:00.000Z', converted_at: '2026-01-08T00:00:00.000Z' },
    ]);
    assert.equal(grouped[0].label, 'Ana');
    assert.equal(grouped[0].eligible, 1);
    assert.equal(grouped[0].converted, 0);
    assert.equal(grouped[1].conversion_rate, 100);
  });
});

describe('averageStageSeconds', () => {
  it('averages closed spans and uses now for the current stage', () => {
    const result = averageStageSeconds(
      [
        { key: 'stage-1', label: 'Inquiry', entered_at: '2026-01-01T00:00:00.000Z', left_at: '2026-01-02T00:00:00.000Z' },
        { key: 'stage-1', label: 'Inquiry', entered_at: '2026-01-01T00:00:00.000Z', left_at: '2026-01-03T00:00:00.000Z' },
        { key: 'stage-2', label: 'Qualify', entered_at: '2026-01-03T00:00:00.000Z', left_at: null },
      ],
      '2026-01-04T00:00:00.000Z',
    );
    const inquiry = result.find((row) => row.key === 'stage-1');
    const qualify = result.find((row) => row.key === 'stage-2');
    assert.equal(inquiry?.average_seconds, 129600);
    assert.equal(qualify?.average_seconds, 86400);
  });
});

describe('stage rules', () => {
  it('requires a destination before deleting a stage that still has inquiries', () => {
    assert.match(stageDeleteError({ outcome: 'open', usage: 2, moveTo: null, moveToExists: false }) ?? '', /2 inquiry/);
    assert.equal(
      stageDeleteError({ outcome: 'open', usage: 2, moveTo: 4, moveToExists: false }),
      'The stage to move inquiries to does not exist.',
    );
    assert.equal(stageDeleteError({ outcome: 'open', usage: 2, moveTo: 4, moveToExists: true }), null);
    assert.equal(stageDeleteError({ outcome: 'open', usage: 0, moveTo: null, moveToExists: false }), null);
  });

  it('protects the confirmed stage', () => {
    assert.match(stageDeleteError({ outcome: 'won', usage: 0, moveTo: null, moveToExists: false }) ?? '', /cannot be deleted/);
    assert.equal(wonStageError(1), null);
    assert.match(wonStageError(0) ?? '', /exactly one/);
    assert.match(wonStageError(2) ?? '', /exactly one/);
  });

  it('rejects an order that drops or repeats a stage', () => {
    assert.equal(stageOrderError([1, 2, 3], [3, 1, 2]), null);
    assert.match(stageOrderError([1, 2, 3], [1, 2]) ?? '', /every stage/);
    assert.match(stageOrderError([1, 2, 3], [1, 2, 9]) ?? '', /unknown/);
    assert.match(stageOrderError([1, 2], [1, 1]) ?? '', /every stage/);
  });
});

describe('availabilityMessage', () => {
  it('names the offering, the stock, and the overlap', () => {
    assert.match(
      availabilityMessage('Event Hall', 1, 1, '2026-05-01 00:00:00', '2026-05-02 00:00:00'),
      /Event Hall/,
    );
  });
});
