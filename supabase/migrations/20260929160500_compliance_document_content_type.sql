ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'application/octet-stream';
