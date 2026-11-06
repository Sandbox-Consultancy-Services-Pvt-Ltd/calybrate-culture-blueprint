-- 0008 realtime: broadcast changes of the tables the pages watch.
alter publication supabase_realtime add table codex.sops;
alter publication supabase_realtime add table codex.practice_sops;
alter publication supabase_realtime add table codex.practice_values;
alter publication supabase_realtime add table outcomes.outcomes;
