import {
  buildWhatsappDailySendTrend,
  buildWhatsappDailySendTrendForDateKeys,
  resolveWhatsappDashboardDateRange,
  resolveWhatsappDashboardDays,
} from './whatsapp-dashboard.service';

describe('resolveWhatsappDashboardDays', () => {
  it('defaults to 30 when days is undefined', () => {
    expect(resolveWhatsappDashboardDays(undefined)).toBe(30);
  });

  it('clamps to max 90', () => {
    expect(resolveWhatsappDashboardDays(120)).toBe(90);
  });

  it('floors fractional values', () => {
    expect(resolveWhatsappDashboardDays(14.9)).toBe(14);
  });
});

describe('resolveWhatsappDashboardDateRange', () => {
  const now = new Date('2026-03-20T15:00:00.000Z');

  it('derives last N days when date range is omitted', () => {
    const range = resolveWhatsappDashboardDateRange({ days: 3 }, now);
    expect(range.dateFrom).toBe('2026-03-18');
    expect(range.dateTo).toBe('2026-03-20');
    expect(range.dateKeys).toHaveLength(3);
  });

  it('accepts explicit dateFrom and dateTo', () => {
    const range = resolveWhatsappDashboardDateRange(
      { dateFrom: '2026-03-01', dateTo: '2026-03-05' },
      now,
    );
    expect(range.dateKeys).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
  });

  it('rejects partial date range', () => {
    expect(() =>
      resolveWhatsappDashboardDateRange({ dateFrom: '2026-03-01' }, now),
    ).toThrow('Both dateFrom and dateTo');
  });

  it('rejects inverted range', () => {
    expect(() =>
      resolveWhatsappDashboardDateRange(
        { dateFrom: '2026-03-10', dateTo: '2026-03-01' },
        now,
      ),
    ).toThrow('dateFrom must be on or before dateTo');
  });
});

describe('buildWhatsappDailySendTrend', () => {
  it('fills missing dates with zero and merges message and reply counts', () => {
    const now = new Date('2026-03-20T15:00:00.000Z');
    const points = buildWhatsappDailySendTrend(
      3,
      [{ date: '2026-03-19', messagesSent: '4' }],
      [{ date: '2026-03-20', replies: '2' }],
      now,
    );

    expect(points).toEqual([
      { date: '2026-03-18', messagesSent: 0, replies: 0 },
      { date: '2026-03-19', messagesSent: 4, replies: 0 },
      { date: '2026-03-20', messagesSent: 0, replies: 2 },
    ]);
  });
});

describe('buildWhatsappDailySendTrendForDateKeys', () => {
  it('fills arbitrary date key lists', () => {
    const points = buildWhatsappDailySendTrendForDateKeys(
      ['2026-01-01', '2026-01-02'],
      [{ date: '2026-01-02', messagesSent: '3' }],
      [],
    );

    expect(points).toEqual([
      { date: '2026-01-01', messagesSent: 0, replies: 0 },
      { date: '2026-01-02', messagesSent: 3, replies: 0 },
    ]);
  });
});
