-- Full-text search over recipes. Hand-written: drizzle-kit does not model
-- virtual tables or triggers.
--
-- The Worker writes one row of search text per recipe into `recipe_search`
-- inside the save batch. These three triggers keep the index in step with
-- that row, so there is one place where the text is assembled.
--
-- To rebuild the index from `recipe_search`, for example after a restore:
--   INSERT INTO recipes_fts (recipes_fts) VALUES ('rebuild');

CREATE VIRTUAL TABLE recipes_fts USING fts5(
  title, description, ingredients, organizers,
  content = 'recipe_search', content_rowid = 'doc_id',
  tokenize = 'porter unicode61 remove_diacritics 2',
  prefix = '2 3'
);
--> statement-breakpoint
CREATE TRIGGER recipe_search_ai AFTER INSERT ON recipe_search BEGIN
  INSERT INTO recipes_fts (rowid, title, description, ingredients, organizers)
  VALUES (new.doc_id, new.title, new.description, new.ingredients, new.organizers);
END;
--> statement-breakpoint
CREATE TRIGGER recipe_search_ad AFTER DELETE ON recipe_search BEGIN
  INSERT INTO recipes_fts (recipes_fts, rowid, title, description, ingredients, organizers)
  VALUES ('delete', old.doc_id, old.title, old.description, old.ingredients, old.organizers);
END;
--> statement-breakpoint
CREATE TRIGGER recipe_search_au AFTER UPDATE ON recipe_search BEGIN
  INSERT INTO recipes_fts (recipes_fts, rowid, title, description, ingredients, organizers)
  VALUES ('delete', old.doc_id, old.title, old.description, old.ingredients, old.organizers);
  INSERT INTO recipes_fts (rowid, title, description, ingredients, organizers)
  VALUES (new.doc_id, new.title, new.description, new.ingredients, new.organizers);
END;
