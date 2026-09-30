// Small line icons for the index and toolbars, matching the reference's margin index.

const paths = {
  entries: 'M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M9 8h6 M9 11.5h6 M9 15h4',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z M4 10h16 M8 4v4 M16 4v4 M8 13.5h.01 M12 13.5h.01 M16 13.5h.01 M8 16.5h.01 M12 16.5h.01',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M15.5 15.5 20 20',
  photos: 'M4 6h16v12H4Z M4 15l4.5-4.5 3.5 3.5 2.5-2.5L20 17 M15.5 9.5h.01',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  pen: 'M15.5 4.5l4 4L9 19l-5 1 1-5L15.5 4.5Z M13.5 6.5l4 4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12 M18 6 6 18',
  bullet: 'M9 7h11 M9 12h11 M9 17h11 M4.5 7h.01 M4.5 12h.01 M4.5 17h.01',
  checkbox: 'M4 5h7v7H4Z M5.5 8.5l1.5 1.5 3-3.5 M14 8.5h6 M4 15h7v5H4Z M14 17.5h6',
  doodle: 'M12 3.5l1.6 4 3-2.2-.6 4.4 4.2.6-3.4 2.7 2.4 2.6-3.9-.3.2 3.6-3.5-2.6-3.5 2.6.2-3.6-3.9.3 2.4-2.6L3.8 10.3 8 9.7l-.6-4.4 3 2.2L12 3.5Z M12 17v4',
  trash: 'M5 7h14 M10 7V5h4v2 M6.5 7l1 13h9l1-13 M10 11v5.5 M14 11v5.5',
  chevronLeft: 'M14.5 6 8.5 12l6 6',
  chevronRight: 'M9.5 6l6 6-6 6',
  download: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19h14',
  upload: 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M5 19h14',
  cube: 'M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9L12 3.5Z M4.5 7.5 12 11.5l7.5-4 M12 11.5v9',
  flat: 'M4 6.5h16v11H4Z M12 6.5v11',
  book: 'M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5v-13Z M12 6v13',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={paths[name]} />
    </svg>
  );
}
