-- SES Navigator
-- Migration: 121_fix_redact_sensitive_jsonb_volatility
-- Purpose: Align the JSONB redaction helper volatility with its expressions.

begin;

alter function private.redact_sensitive_jsonb(jsonb)
  stable;

commit;
