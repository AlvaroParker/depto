INSERT INTO participants (id, name, slug, sort_order, active, created_at, updated_at)
VALUES
  (
    'participant_alvaro',
    'Alvaro',
    'alvaro',
    1,
    1,
    '2026-07-09T00:00:00.000Z',
    '2026-07-09T00:00:00.000Z'
  ),
  (
    'participant_camila',
    'Camila',
    'camila',
    2,
    1,
    '2026-07-09T00:00:00.000Z',
    '2026-07-09T00:00:00.000Z'
  ),
  (
    'participant_trinidad',
    'Trinidad',
    'trinidad',
    3,
    1,
    '2026-07-09T00:00:00.000Z',
    '2026-07-09T00:00:00.000Z'
  )
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = excluded.updated_at;
