-- ================================================================
-- Voisy — Bucket privé "verifications" + politiques RLS
-- À exécuter dans l'éditeur SQL Supabase (une seule fois)
-- ================================================================

-- 1. Créer le bucket PRIVÉ (non public)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'verifications',
  'verifications',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'],
  10485760   -- 10 Mo max
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit    = EXCLUDED.file_size_limit;

-- 2. Politique INSERT : chaque utilisateur peut déposer uniquement
--    dans son propre dossier  →  verifications/{user_id}/...
CREATE POLICY "verif_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verifications'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Politique SELECT : un utilisateur peut lire/signer ses propres fichiers
--    (nécessaire pour createSignedUrl côté client)
CREATE POLICY "verif_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verifications'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Colonne pour stocker le chemin de la photo de vérification
--    dans verification_requests (idempotent)
ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS verif_photo_path text;
