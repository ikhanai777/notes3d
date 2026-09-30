import { toISODate } from './dates';
import { stickerChar, type Entry } from './model';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
};

/** First-run pages: how to use the journal, and an example entry. */
export function seedEntries(): Entry[] {
  const now = Date.now();
  return [
    {
      id: crypto.randomUUID(),
      date: daysAgo(2),
      createdAt: now - 2,
      updatedAt: now - 2,
      body: [
        'Welcome to your journal.',
        '',
        'Turn a page by dragging its corner, swiping, or tapping the outer edge of the page.',
        '- Tap anywhere on a page to write there.',
        '- Tap the pen to start a new entry for today.',
        '- Use the index to find a day, search, or see your photos.',
        '[x] Open the journal',
        '[ ] Write the first page',
      ].join('\n'),
    },
    {
      id: crypto.randomUUID(),
      date: daysAgo(1),
      createdAt: now - 1,
      updatedAt: now - 1,
      body: [
        'A Rain-Soaked Afternoon.',
        '',
        'Woke up to the soft rhythm of rain on the window. Spent the morning reading with a pot of Earl Grey, and it felt like the whole world had slowed down to match. ' +
          `Later I pressed a leaf I found on my walk ${stickerChar(0)} between these pages.`,
        '',
        `Looking forward to writing more this evening. ${stickerChar(1)}`,
      ].join('\n'),
    },
  ];
}
