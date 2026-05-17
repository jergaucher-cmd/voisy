import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_PROJECT = 'sygbpqxzxhppxqjlomnk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const {
    type,
    user_id,
    prenom,
    last_name,
    email,
    phone,
    profile_photo,    // URL publique de la photo de profil actuelle
    verif_photo_path, // Chemin dans le bucket privé 'verifications'
  } = await req.json();

  // ── Récupération de la photo de vérification via service role (bypass RLS) ──
  let verifPhotoUrl = '';
  if (type === 'photo_verif') {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Priorité 1 : chemin transmis par le client
    let resolvedPath = verif_photo_path ?? '';

    // Priorité 2 : si chemin absent ou invalide, on liste le dossier de l'utilisateur
    //              et on prend le fichier le plus récent (tri lexicographique sur le nom)
    if (!resolvedPath) {
      const { data: files } = await admin.storage
        .from('verifications')
        .list(user_id, { limit: 20, sortBy: { column: 'name', order: 'desc' } });
      const latest = files?.find(f => f.name !== '.emptyFolderPlaceholder');
      if (latest) resolvedPath = `${user_id}/${latest.name}`;
    }

    if (resolvedPath) {
      const { data } = await admin.storage
        .from('verifications')
        .createSignedUrl(resolvedPath, 60 * 60 * 24 * 7); // 7 jours
      verifPhotoUrl = data?.signedUrl ?? '';
    }
  }

  const dashLink  = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/auth/users`;
  const tableLink = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/editor?filter=id%3Aeq%3A${user_id}`;

  // ── Bloc comparaison photos (photo_verif uniquement) ──────────────────────
  const photoCompareBlock = type === 'photo_verif' ? `
    <tr>
      <td style="padding:0 28px 24px;">
        <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 16px;
                  text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid #E5E7EB;padding-top:20px;">
          Comparaison des photos
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="48%" style="text-align:center;vertical-align:top;">
              <div style="background:#F3F4F6;border-radius:8px;padding:10px 8px 12px;">
                <p style="font-size:10px;color:#6B7280;font-weight:800;text-transform:uppercase;
                          letter-spacing:0.10em;margin:0 0 10px;">📷 Photo de profil</p>
                ${profile_photo
                  ? `<img src="${profile_photo}" width="150" height="150"
                       style="border-radius:10px;object-fit:cover;border:2px solid #D1D5DB;
                              display:block;margin:0 auto;">`
                  : `<div style="width:150px;height:150px;background:#E5E7EB;border-radius:10px;
                                 margin:0 auto;line-height:150px;color:#9CA3AF;font-size:12px;text-align:center;">—</div>`}
              </div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="text-align:center;vertical-align:top;">
              <div style="background:#F0FDF4;border-radius:8px;padding:10px 8px 12px;border:1px solid #BBF7D0;">
                <p style="font-size:10px;color:#065F46;font-weight:800;text-transform:uppercase;
                          letter-spacing:0.10em;margin:0 0 10px;">🤳 Photo de vérification</p>
                ${verifPhotoUrl
                  ? `<a href="${verifPhotoUrl}" target="_blank" style="display:block;margin:0 auto;width:150px;">
                       <img src="${verifPhotoUrl}" width="150" height="150"
                         style="border-radius:10px;object-fit:cover;border:2px solid #2D6A4F;display:block;">
                     </a>
                     <p style="font-size:10px;color:#6B7280;margin:8px 0 0;">↑ Cliquer pour agrandir</p>`
                  : `<div style="width:150px;height:150px;background:#E5E7EB;border-radius:10px;
                                 margin:0 auto;line-height:150px;color:#9CA3AF;font-size:11px;text-align:center;">
                       Non disponible
                     </div>`}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const typeLabel = type === 'photo_verif'
    ? '🤳 Vérification d\'identité — selfie auriculaire'
    : '📷 Photo de profil';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Demande de vérification Voisy</title></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">

        <tr>
          <td style="background:#2D6A4F;padding:24px 28px;">
            <div style="color:white;font-size:18px;font-weight:800;letter-spacing:0.5px;">VOISY — Admin</div>
            <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">Nouvelle demande de vérification</div>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 28px 20px;">
            <p style="font-size:15px;font-weight:700;color:#1A1A1A;margin:0 0 20px;">
              ${typeLabel}
            </p>

            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;
                           text-transform:uppercase;letter-spacing:0.06em;width:120px;">Prénom</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${prenom || '—'}</td>
              </tr>
              <tr style="border-top:1px solid #E5E7EB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;
                           text-transform:uppercase;letter-spacing:0.06em;">Nom</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${last_name || '—'}</td>
              </tr>
              <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;
                           text-transform:uppercase;letter-spacing:0.06em;">Email</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${email || '—'}</td>
              </tr>
              ${phone ? `<tr style="border-top:1px solid #E5E7EB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;
                           text-transform:uppercase;letter-spacing:0.06em;">Téléphone</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${phone}</td>
              </tr>` : ''}
              <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;
                           text-transform:uppercase;letter-spacing:0.06em;">User ID</td>
                <td style="padding:10px 14px;font-size:12px;font-weight:500;color:#6B7280;word-break:break-all;">${user_id}</td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:10px;">
                  <a href="${dashLink}"
                     style="display:inline-block;background:#2D6A4F;color:white;font-size:13px;
                            font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;">
                    → Auth Users
                  </a>
                </td>
                <td>
                  <a href="${tableLink}"
                     style="display:inline-block;background:#F3F4F6;color:#1A1A1A;font-size:13px;
                            font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;
                            border:1px solid #E5E7EB;">
                    → Table Editor
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${photoCompareBlock}

        <tr>
          <td style="padding:16px 28px 20px;border-top:1px solid #E5E7EB;">
            <p style="font-size:12px;color:#9CA3AF;margin:0;">
              Voisy — notification automatique · Ne pas répondre à cet email
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Voisy <contact@voisy.eu>',
      to:   ['contact@voisy.eu'],
      subject: `Vérification photo Voisy — ${prenom || email || user_id}`,
      html,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
