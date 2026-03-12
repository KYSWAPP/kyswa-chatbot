const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const sb = createClient(
  'https://zpgxxqzgqeogupzltrqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZ3h4cXpncWVvZ3Vwemx0cnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE1MzkxNTUsImV4cCI6MjA1NzExNTE1NX0.qEHBDKb4JKuAHGjqGMBnMBqUolr7VhPkHHBLdM8Trac'
);

const MENUS = {
  accueil: `🕌 *Bienvenue chez Kyswa Travel !*
Agence spécialisée en Hajj, Oumra & Ziarra

Tapez le numéro de votre choix :

1️⃣ Nos packages Oumra 2026
2️⃣ Mon dossier pèlerin
3️⃣ Paiements & Tarifs
4️⃣ Parler à un agent
5️⃣ Nous contacter

_Kyswa Travel — 115 Av. Blaise Diagne, Dakar_`,

  packages: `✈️ *Nos Packages Oumra 2026*

🌙 *Oumra Ramadan 2026*
💰 1 450 000 FCFA
📅 Pendant le mois béni de Ramadan

✈️ *Oumra Chawal 2026*
💰 1 200 000 FCFA
📅 Après Ramadan — Places limitées !

🕌 *Ziarra Fès — Laylatul Qadr*
💰 850 000 FCFA
📅 Voyage spirituel exceptionnel

Tapez *0* pour revenir au menu principal
Tapez *4* pour parler à un agent`,

  contact: `📞 *Contactez Kyswa Travel*

📱 WhatsApp : +221 78 781 16 16
📍 115 Avenue Blaise Diagne, Dakar
🌐 kyswa-app.vercel.app

Horaires : Lun-Sam 8h-18h

Tapez *0* pour revenir au menu`
};

async function findPelerin(phone) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  const last9 = cleaned.slice(-9);
  const variants = [last9, `+221${last9}`, `221${last9}`];
  for (const v of variants) {
    const { data } = await sb.from('clients')
      .select('*,inscriptions(*,departs(*),paiements(*))')
      .eq('telephone', v)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

function formatDossier(p) {
  const ins = p.inscriptions?.[0];
  const dep = ins?.departs;
  const pays = ins?.paiements || [];
  const totalPaye = pays.reduce((s, x) => s + (x.montant || 0), 0);
  const totalDu = ins?.prix_total || 0;
  const reste = totalDu - totalPaye;
  const dd = dep?.date_depart ? new Date(dep.date_depart) : null;
  const daysLeft = dd ? Math.ceil((dd - new Date()) / 864e5) : null;

  return `📋 *Votre Dossier Kyswa Travel*

👤 *${p.prenom} ${p.nom}*
🆔 N° KT-${String(p.id).padStart(4, '0')}

${daysLeft !== null ? `✈️ Départ dans *${daysLeft} jours*\n📅 ${dd.toLocaleDateString('fr-FR')}\n🗺️ ${dep?.nom_programme || 'Programme en attente'}\n` : ''}
💰 *Paiements*
✅ Payé : ${totalPaye.toLocaleString('fr-FR')} FCFA
📌 Reste : ${reste.toLocaleString('fr-FR')} FCFA
📊 Total : ${totalDu.toLocaleString('fr-FR')} FCFA

🛂 Visa : ${p.statut_visa || 'En traitement'}
💉 Vaccin : ${p.vaccin_meningite ? '✅ Validé' : '⚠️ Manquant'}

Tapez *0* pour revenir au menu`;
}

async function handleMessage(sock, sender, text) {
  const msg = text.trim().toLowerCase();

  if (msg === '0' || msg === 'menu' || msg === 'bonjour' || msg === 'salam' || msg === 'salut' || msg === 'hello' || msg === 'hi') {
    await sock.sendMessage(sender, { text: MENUS.accueil });
    return;
  }

  if (msg === '1') {
    await sock.sendMessage(sender, { text: MENUS.packages });
    return;
  }

  if (msg === '2') {
    const phone = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const pelerin = await findPelerin(phone);
    if (pelerin) {
      await sock.sendMessage(sender, { text: formatDossier(pelerin) });
    } else {
      await sock.sendMessage(sender, { text: `❌ Numéro non trouvé dans notre système.\n\nContactez-nous au *+221 78 781 16 16* pour enregistrer votre dossier.\n\nTapez *0* pour revenir au menu` });
    }
    return;
  }

  if (msg === '3') {
    await sock.sendMessage(sender, { text: MENUS.packages });
    return;
  }

  if (msg === '4') {
    await sock.sendMessage(sender, { text: `👨‍💼 *Un agent Kyswa Travel va vous répondre*\n\nMerci de patienter quelques instants...\n\n📞 Ou appelez directement : *+221 78 781 16 16*\n\nTapez *0* pour revenir au menu` });
    return;
  }

  if (msg === '5') {
    await sock.sendMessage(sender, { text: MENUS.contact });
    return;
  }

  await sock.sendMessage(sender, { text: MENUS.accueil });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n🤖 KYSWA CHATBOT — Scannez ce QR code avec WhatsApp :\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('✅ Chatbot Kyswa Travel connecté !');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 Reconnexion...');
        startBot();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const sender = msg.key.remoteJid;
    if (sender.includes('g.us')) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text) return;
    console.log(`📩 Message de ${sender}: ${text}`);
    await handleMessage(sock, sender, text);
  });
}

startBot();
