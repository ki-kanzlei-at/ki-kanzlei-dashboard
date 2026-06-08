# E-Mail-Konten via OAuth einrichten (Microsoft + Google)

Damit „E-Mail-Konto hinzufügen → Mit Microsoft / Mit Google anmelden" (1-Klick) funktioniert,
brauchst du **einmalig pro Anbieter eine OAuth-App** (das ist das SaaS-Modell: EINE App,
alle Kund:innen verbinden sich darüber, Tokens werden pro Konto gespeichert).

## Was du am Ende brauchst (ENV)

In `.env.local` (lokal) **und** in der Hosting-Umgebung (z. B. Vercel) setzen:

```bash
# Microsoft / Outlook / Office 365
MS_OAUTH_CLIENT_ID=...
MS_OAUTH_CLIENT_SECRET=...

# Google / Gmail / Google Workspace
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Damit die Redirect-URIs in Produktion stimmen (sonst wird die Request-Origin genommen)
NEXT_PUBLIC_APP_URL=https://app.deine-domain.at
```

Nach dem Setzen: Dev-Server neu starten bzw. neu deployen.

> **Wichtig:** Die Redirect-URIs müssen **exakt** übereinstimmen (Schema, Domain, Pfad, **kein** Slash am Ende).

### Redirect-URIs (genau diese eintragen)

| | Lokal | Produktion |
|---|---|---|
| Microsoft | `http://localhost:3000/api/email-accounts/microsoft/callback` | `https://app.deine-domain.at/api/email-accounts/microsoft/callback` |
| Google | `http://localhost:3000/api/email-accounts/google/callback` | `https://app.deine-domain.at/api/email-accounts/google/callback` |

---

## A) Microsoft (Azure Portal / Microsoft Entra ID)

1. **portal.azure.com** → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. **Name:** z. B. `KI Kanzlei Mailbox`.
3. **Supported account types:** „Accounts in any organizational directory **and** personal Microsoft accounts" (multi-tenant — die App nutzt `…/common/…`).
4. **Redirect URI:** Plattform **Web** → die Microsoft-Callback-URLs von oben (lokal + Prod). → **Register**.
5. **Application (client) ID** kopieren → `MS_OAUTH_CLIENT_ID`.
6. **Certificates & secrets** → **New client secret** → den **Value** (nicht die Secret-ID!) kopieren → `MS_OAUTH_CLIENT_SECRET`.
   - Ablaufdatum merken (z. B. 24 Monate) und rechtzeitig erneuern.
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → hinzufügen:
   - `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access`, `openid`, `email`, `profile`
   - Bei Org-Konten ggf. **Grant admin consent** klicken.

Fertig. Beim Verbinden meldet sich der/die User mit dem **eigenen** Microsoft-/365-Konto an und bestätigt einmalig.

---

## B) Google (Google Cloud Console / GCP)

1. **console.cloud.google.com** → Projekt anlegen/auswählen.
2. **APIs & Services** → **Library** → **Gmail API** suchen → **Enable**.
3. **APIs & Services** → **OAuth consent screen**:
   - **User type:**
     - **Internal** = nur Nutzer:innen deiner Google-Workspace-Organisation → **keine Google-Verifizierung nötig**. Empfohlen, wenn alle Versand-Postfächer in deinem Workspace sind.
     - **External** = beliebige Google-Konten → für Produktion mit `gmail.send` ist eine **Google-Verifizierung / Security Assessment** nötig. Im **Testing**-Modus geht es sofort mit hinzugefügten Test-Usern.
   - App-Name, Support-E-Mail, Entwickler-E-Mail ausfüllen.
   - **Scopes** → `.../auth/gmail.send` hinzufügen (restricted).
   - (Bei External + Testing) unter **Test users** deine Test-Adressen hinzufügen.
4. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**:
   - **Application type:** **Web application**.
   - **Authorized redirect URIs:** die Google-Callback-URLs von oben (lokal + Prod).
   - **Create** → **Client ID** → `GOOGLE_OAUTH_CLIENT_ID`, **Client secret** → `GOOGLE_OAUTH_CLIENT_SECRET`.

Fertig. Beim Verbinden meldet sich der/die User mit dem **eigenen** Google-/Workspace-Konto an, bestätigt den Zugriff (`gmail.send`), und das Postfach ist sendebereit.

---

## Wie es im Code zusammenpasst (zur Kontrolle)

- Start: `GET /api/email-accounts/{microsoft|google}/start` → leitet zum Anbieter (nur wenn `*_CLIENT_ID` gesetzt ist, sonst klarer Fehler-Toast).
- Callback: `…/callback` → Code→Token, Profil holen, Konto in `email_accounts` anlegen/aktualisieren (`provider = microsoft_oauth | google_oauth`, Tokens in `oauth_*`).
- Versand: `sendEmailViaAccount` wählt automatisch Graph `sendMail` (MS) bzw. Gmail API `messages.send` (Google) — mit **automatischem Token-Refresh** über den gespeicherten `refresh_token`.
- SMTP/Custom bleibt als Fallback (Host/Port/Benutzer/Passwort direkt in den Feldern).
