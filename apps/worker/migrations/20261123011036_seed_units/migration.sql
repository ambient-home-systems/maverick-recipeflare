-- The units a household starts with. Hand-written seed data.
--
-- IDs are fixed, so that every install has the same ones. `name_key` is the
-- name as the shared `nameKey()` function makes it; every name here is already
-- lowercase with single spaces, so the two are equal.
--
-- Aliases are compared as written. Handwritten cards use "t" for a teaspoon,
-- "T" for a tablespoon and "C" for a cup, so those three differ only by case.
--
-- Foods and labels are not seeded: they are created as recipes are entered.

INSERT INTO units
  (id, name, name_key, plural_name, abbreviation, plural_abbreviation, use_abbreviation, fraction, aliases, created_at, updated_at)
VALUES
  ('00000000-0000-7000-8000-020000000001', 'teaspoon', 'teaspoon', 'teaspoons', 'tsp', 'tsp', 1, 1, '["t"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000002', 'tablespoon', 'tablespoon', 'tablespoons', 'tbsp', 'tbsp', 1, 1, '["T", "tbs", "tbl"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000003', 'cup', 'cup', 'cups', 'c', 'c', 0, 1, '["C"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000004', 'fluid ounce', 'fluid ounce', 'fluid ounces', 'fl oz', 'fl oz', 1, 1, '["floz"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000005', 'pint', 'pint', 'pints', 'pt', 'pt', 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000006', 'quart', 'quart', 'quarts', 'qt', 'qt', 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000007', 'gallon', 'gallon', 'gallons', 'gal', 'gal', 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000008', 'milliliter', 'milliliter', 'milliliters', 'ml', 'ml', 1, 0, '["millilitre", "millilitres"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000009', 'liter', 'liter', 'liters', 'l', 'l', 1, 0, '["litre", "litres", "L"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-02000000000a', 'ounce', 'ounce', 'ounces', 'oz', 'oz', 1, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-02000000000b', 'pound', 'pound', 'pounds', 'lb', 'lb', 1, 1, '["lbs"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-02000000000c', 'gram', 'gram', 'grams', 'g', 'g', 1, 0, '["gm", "gms"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-02000000000d', 'kilogram', 'kilogram', 'kilograms', 'kg', 'kg', 1, 0, '["kilo", "kilos"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-02000000000e', 'pinch', 'pinch', 'pinches', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-02000000000f', 'dash', 'dash', 'dashes', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000010', 'clove', 'clove', 'cloves', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000011', 'can', 'can', 'cans', NULL, NULL, 0, 1, '["tin", "tins"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000012', 'stick', 'stick', 'sticks', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000013', 'slice', 'slice', 'slices', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000014', 'piece', 'piece', 'pieces', 'pc', 'pcs', 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000015', 'sprig', 'sprig', 'sprigs', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000016', 'bunch', 'bunch', 'bunches', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000017', 'head', 'head', 'heads', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000018', 'package', 'package', 'packages', 'pkg', 'pkg', 0, 1, '["packet", "packets", "pkt"]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z'),
  ('00000000-0000-7000-8000-020000000019', 'jar', 'jar', 'jars', NULL, NULL, 0, 1, '[]', '2026-11-22T00:00:00.000Z', '2026-11-22T00:00:00.000Z');
