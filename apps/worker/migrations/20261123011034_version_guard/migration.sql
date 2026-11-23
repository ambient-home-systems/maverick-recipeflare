-- Two phones can edit one recipe. A D1 batch cannot branch on the result of an
-- earlier statement, so "update where the version matches, then look at the row
-- count" cannot stop the rest of a batch. A trigger can: a save sets `version`
-- to the value the editor loaded plus one, and if someone else saved in
-- between, this aborts the statement and D1 rolls the whole batch back.
--
-- Hand-written: drizzle-kit does not model triggers.

CREATE TRIGGER recipes_version_guard
BEFORE UPDATE OF version ON recipes
WHEN new.version <> old.version + 1
BEGIN
  SELECT RAISE(ABORT, 'version_conflict');
END;
