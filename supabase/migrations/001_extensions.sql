-- SES Navigator
-- Migration: 001_extensions
-- Purpose: Enable PostgreSQL extensions required by the application.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists vector;

commit;
