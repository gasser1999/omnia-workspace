-- Run this ONCE in Supabase → SQL Editor (after schema.sql).
-- Creates the two PRIVATE storage buckets used by the server.
-- The server uses the service-role key, which bypasses RLS, so no public policies are needed.

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 26214400)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-backups', 'workspace-backups', false, 52428800)
on conflict (id) do update set public = false;
