const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
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
    profile_photo,   // URL publique photo de profil
    verif_photo,     // URL signée photo de vérification (bucket privé)
  } = await req.json();

  const dashLink  = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/auth/users`;
  const tableLink = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/editor?filter=id%3Aeq%3A${user_id}`;

  // ── Bloc comparaison photos (photo_verif uniquement) ──────────────────────
  const photoCompareBlock = (type === 'photo_verif' && (profile_photo || verif_photo)) ? `
    <tr>
      <td style="padding:0 28px 24px;">
        <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.06em;">
          Comparaison des photos
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="48%" style="text-align:center;">
              <p style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Photo de profil</p>
              ${profile_photo
                ? `<img src="${profile_photo}" width="160" height="160"
                     style="border-radius:12px;object-fit:cover;border:2px solid #E5E7EB;display:block;margin:0 auto;">`
                : `<div style="width:160px;height:160px;background:#F3F4F6;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:12px;">—</div>`}
            </td>
            <td width="4%"></td>
            <td width="48%" style="text-align:center;">
              <p style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Photo de vérification</p>
              ${verif_photo
                ? `<a href="${verif_photo}" style="display:block;margin:0 auto;width:160px;">
                     <img src="${verif_photo}" width="160" height="160"
                       style="border-radius:12px;object-fit:cover;border:2px solid #2D6A4F;display:block;">
                   </a>
                   <p style="font-size:10px;color:#9CA3AF;margin:6px 0 0;">Cliquer pour agrandir</p>`
                : `<div style="width:160px;height:160px;background:#F3F4F6;border-radius:12px;margin:0 auto;"></div>`}
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const typeLabel = type === 'photo_verif'
    ? '📷 Vérification d\'identité (selfie auriculaire)'
    : type === 'photo'
    ? '📷 Photo de profil'
    : '📱 Numéro de téléphone';

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
              ${typeLabel} — vérification demandée
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;width:120px;">Prénom</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${prenom || '—'}</td>
              </tr>
              <tr style="border-top:1px solid #E5E7EB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Nom</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${last_name || '—'}</td>
              </tr>
              <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Email</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${email || '—'}</td>
              </tr>
              ${phone ? `<tr style="border-top:1px solid #E5E7EB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Téléphone</td>
                <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1A1A1A;">${phone}</td>
              </tr>` : ''}
              <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">User ID</td>
                <td style="padding:10px 14px;font-size:12px;font-weight:500;color:#6B7280;word-break:break-all;">${user_id}</td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
              <tr>
                <td style="padding-right:10px;">
                  <a href="${dashLink}" style="display:inline-block;background:#2D6A4F;color:white;font-size:13px;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;">
                    → Auth Users
                  </a>
                </td>
                <td>
                  <a href="${tableLink}" style="display:inline-block;background:#F3F4F6;color:#1A1A1A;font-size:13px;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;border:1px solid #E5E7EB;">
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
      to: ['contact@voisy.eu'],
      subject: `Nouvelle demande de vérification Voisy — ${prenom || email || user_id}`,
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
