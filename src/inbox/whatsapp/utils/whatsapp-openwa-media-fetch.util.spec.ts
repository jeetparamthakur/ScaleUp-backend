import {
  buildOpenWaMediaChatIdCandidates,
  buildOpenWaMediaDownloadChatIdCandidates,
  buildOpenWaMediaMessageIdCandidates,
  buildPrioritizedOpenWaMediaFetchAttempts,
  findOpenWaHistoryMessage,
  openWaHistoryMessageIdMatches,
  parseSerializedWhatsappMessageId,
} from './whatsapp-openwa-media-fetch.util';

describe('openWaHistoryMessageIdMatches', () => {
  it('matches exact and suffix ids', () => {
    const external = 'false_178473222025220@lid_3A9E3AA841DE6E7330D5';
    expect(openWaHistoryMessageIdMatches(external, external)).toBe(true);
    expect(
      openWaHistoryMessageIdMatches('3A9E3AA841DE6E7330D5', external),
    ).toBe(true);
  });
});

describe('findOpenWaHistoryMessage', () => {
  it('finds a row by flexible id match', () => {
    const external = 'false_178473222025220@lid_3A9E3AA841DE6E7330D5';
    const found = findOpenWaHistoryMessage(
      [
        {
          id: external,
          chatId: '178473222025220@lid',
          body: '',
          type: 'video',
          timestamp: 1,
          fromMe: false,
        },
      ],
      external,
    );
    expect(found?.type).toBe('video');
  });
});

describe('buildOpenWaMediaMessageIdCandidates', () => {
  it('includes the full id and the trailing segment', () => {
    const external = 'false_64004307337332@lid_3A7A8F54D1C0257F9314';
    expect(buildOpenWaMediaMessageIdCandidates(external)).toEqual([
      external,
      '64004307337332@lid_3A7A8F54D1C0257F9314',
      '3A7A8F54D1C0257F9314',
    ]);
  });

  it('rebuilds serialized ids from short webhook ids', () => {
    expect(
      buildOpenWaMediaMessageIdCandidates('3A7A8F54D1C0257F9314', {
        chatId: '64004307337332@lid',
        fromMe: false,
      }),
    ).toEqual([
      '3A7A8F54D1C0257F9314',
      'false_64004307337332@lid_3A7A8F54D1C0257F9314',
      'true_64004307337332@lid_3A7A8F54D1C0257F9314',
      '64004307337332@lid_3A7A8F54D1C0257F9314',
    ]);
  });

  it('expands outbound lid ids missing the true_/false_ prefix', () => {
    const opaque = '116178999631920@lid_3EB0F420B7EC787A2EF9';
    const candidates = buildOpenWaMediaMessageIdCandidates(opaque, {
      chatId: '116178999631920@lid',
    });
    expect(candidates).toContain(
      'false_116178999631920@lid_3EB0F420B7EC787A2EF9',
    );
    expect(candidates).toContain(
      'true_116178999631920@lid_3EB0F420B7EC787A2EF9',
    );
  });

  it('rebuilds serialized ids with phone JIDs for LID chats', () => {
    const external = 'false_64004307337332@lid_3A7A8F54D1C0257F9314';
    const candidates = buildOpenWaMediaMessageIdCandidates(external, {
      chatId: '64004307337332@lid',
      fromMe: false,
      alternateChatIds: ['919884428050@c.us', '919884428050@s.whatsapp.net'],
    });
    expect(candidates).toContain(
      'false_919884428050@c.us_3A7A8F54D1C0257F9314',
    );
    expect(candidates).toContain(
      'false_919884428050@s.whatsapp.net_3A7A8F54D1C0257F9314',
    );
  });
});

describe('parseSerializedWhatsappMessageId', () => {
  it('parses whatsapp-web.js serialized ids', () => {
    expect(
      parseSerializedWhatsappMessageId(
        'false_64004307337332@lid_3A7A8F54D1C0257F9314',
      ),
    ).toEqual({
      direction: 'false',
      chatJid: '64004307337332@lid',
      messageKey: '3A7A8F54D1C0257F9314',
    });
  });

  it('parses group serialized ids with author suffix', () => {
    expect(
      parseSerializedWhatsappMessageId(
        'true_120363046083690584@g.us_1663121511_916239921246@c.us',
      ),
    ).toEqual({
      direction: 'true',
      chatJid: '120363046083690584@g.us',
      messageKey: '1663121511_916239921246@c.us',
    });
  });
});

describe('buildOpenWaMediaMessageIdCandidates group chats', () => {
  it('does not emit bare author JIDs as message id candidates', () => {
    const external =
      'true_120363046083690584@g.us_1663121511_916239921246@c.us';
    const candidates = buildOpenWaMediaMessageIdCandidates(external, {
      chatId: '120363046083690584@g.us',
      fromMe: false,
    });
    expect(candidates).toContain(external);
    expect(candidates).not.toContain('916239921246@c.us');
  });
});

describe('buildOpenWaMediaChatIdCandidates', () => {
  it('keeps only the lid JID for lid chats', () => {
    expect(
      buildOpenWaMediaChatIdCandidates('178473222025220@lid', '+919592122902'),
    ).toEqual(['178473222025220@lid']);
  });

  it('adds phone JIDs for classic c.us chats', () => {
    expect(
      buildOpenWaMediaChatIdCandidates('919592122902@c.us', '+919592122902'),
    ).toEqual(['919592122902@c.us', '919592122902@s.whatsapp.net']);
  });
});

describe('buildPrioritizedOpenWaMediaFetchAttempts', () => {
  it('tries the primary chat and external id first and caps attempts', () => {
    const external = 'false_64004307337332@lid_3A7A8F54D1C0257F9314';
    const chatIds = buildOpenWaMediaDownloadChatIdCandidates(
      '64004307337332@lid',
      '+919884428050',
    );
    const messageIds = buildOpenWaMediaMessageIdCandidates(external, {
      chatId: '64004307337332@lid',
      fromMe: false,
      alternateChatIds: chatIds,
    });
    const attempts = buildPrioritizedOpenWaMediaFetchAttempts(
      '64004307337332@lid',
      external,
      chatIds,
      messageIds,
      5,
    );
    expect(attempts[0]).toEqual({
      chatId: '64004307337332@lid',
      messageId: external,
    });
    expect(attempts.length).toBeLessThanOrEqual(5);
  });
});

describe('buildOpenWaMediaDownloadChatIdCandidates', () => {
  it('adds resolved phone JIDs for lid chats', () => {
    expect(
      buildOpenWaMediaDownloadChatIdCandidates(
        '64004307337332@lid',
        '+919884428050',
      ),
    ).toEqual([
      '64004307337332@lid',
      '919884428050@c.us',
      '919884428050@s.whatsapp.net',
    ]);
  });
});
