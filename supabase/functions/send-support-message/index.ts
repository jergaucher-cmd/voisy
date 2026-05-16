const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { prenom, last_name, email, user_id, message } = await req.json();

  const date = new Date().toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Message support Voisy</title></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">

        <tr>
          <td style="background:#2D6A4F;padding:24px 28px;">
            <div style="color:white;font-size:18px;font-weight:800;letter-spacing:0.5px;">VOISY — Support</div>
            <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">Message d'un utilisateur</div>
          </td>
        </tr>

        <tr>
          <td style="padding:28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;width:100px;">Prénom</td>
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
              <tr style="border-top:1px solid #E5E7EB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">User ID</td>
                <td style="padding:10px 14px;font-size:12px;color:#6B7280;word-break:break-all;">${user_id || '—'}</td>
              </tr>
              <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB;">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Date</td>
                <td style="padding:10px 14px;font-size:14px;color:#1A1A1A;">${date}</td>
              </tr>
            </table>

            <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;">
              <div style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Message</div>
              <p style="font-size:14px;color:#1A1A1A;line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px 20px;border-top:1px solid #E5E7EB;">
            <p style="font-size:12px;color:#9CA3AF;margin:0;">
              Voisy — message support · Répondre directement à l'email de l'utilisateur
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
      subject: `Support Voisy — message de ${prenom || 'un utilisateur'}`,
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
