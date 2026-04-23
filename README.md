# die Ragebaiters – Login + Mediathek mit Supabase

Rein statisches Paket, läuft auf **GitHub Pages** (oder jedem anderen Static-Host).
Kein PHP, keine eigene Datenbank. Supabase übernimmt:

- Auth (Login / Registrierung)
- Datenbank (Profile + Fotos + Einladungscodes)
- Dateispeicher (Fotos im Supabase Storage)

---

## Einmaliges Setup (10 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) einen kostenlosen Account erstellen.
2. **New Project** → Name: `ragebaiters`, Region: Frankfurt (EU), Passwort für die DB setzen und merken.
3. Warten, bis das Projekt fertig ist (ca. 1 Minute).

### 2. Schema importieren
1. Im Supabase-Dashboard links auf **SQL Editor** klicken.
2. Inhalt von `supabase-setup.sql` (aus diesem ZIP) komplett einfügen.
3. **Run** drücken.

Dabei werden automatisch angelegt:
- Tabellen `profiles`, `invites`, `photos`
- View `photos_public`
- Storage-Bucket `photos` (öffentlich lesbar)
- Der erste Einladungscode: **`TEAM-RAGEBAIT-2026`**

### 3. API-Keys kopieren
1. Links auf **Project Settings** → **API**.
2. Du brauchst zwei Werte:
   - `Project URL` (z.B. `https://xyzabc.supabase.co`)
   - `anon public` Key (ein langer Token, beginnt mit `eyJ...`)

### 4. config.js füllen
Öffne `config.js` im Paket und trage die beiden Werte ein:
```js
window.SUPABASE_URL      = 'https://DEIN-PROJEKT.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...dein-anon-key...';
```

Diese Werte sind **öffentlich** und gehören in den Frontend-Code. Gesperrt wird alles
über Row-Level-Security (RLS) in der Datenbank – niemand kann ohne Berechtigung
schreiben.

### 5. E-Mail-Bestätigung abschalten (optional, aber bequem)
Im Supabase-Dashboard:
- **Authentication → Sign In / Up → Email → Confirm email** → ausschalten.

Sonst bekommt jedes neue Teammitglied eine Bestätigungs-Mail – auch ok, aber etwas mehr Reibung.

### 6. Upload zu GitHub
Kopiere alle Dateien aus diesem ZIP ins Root-Verzeichnis deines GitHub-Pages-Repos
(zusammen mit dem vorhandenen `images/`-Ordner). Committen, pushen, fertig.

---

## Struktur

```
ragebaiters.de/
├── index.html          Startseite
├── team.html           Einheit
├── impressum.html      Impressum
├── mediathek.html      öffentliche Galerie (Lightbox)
├── login.html          Anmeldung
├── register.html       Registrierung mit Invite-Code
├── dashboard.html      interner Bereich: Upload + eigene Bilder
├── styles.css          Haupt-Design
├── impressum.css       Zusatzstyles Impressum
├── app.css             Styles für Login / Upload / Galerie
├── script.js           Team-Modal
├── config.js           ← deine Supabase-Zugangsdaten (du füllst sie aus)
├── auth.js             Supabase-Client + dynamische Nav
├── supabase-setup.sql  Schema für Supabase (einmalig importieren)
└── images/             deine bestehenden Logos und Banner
```

---

## Neue Teammitglieder einladen

Jedes neue Mitglied braucht einen **Einladungscode**. So legst du einen an:

1. Supabase-Dashboard → **Table Editor** → Tabelle `invites`.
2. **Insert row** → `code` = z.B. `JASON-2026` → Save.
3. Den Code an das Teammitglied weitergeben.
4. Nach der Registrierung auf `register.html` ist der Code verbraucht.

## Admin-Rechte vergeben

Nach der Registrierung steht dein Account auf `role = 'member'`. Ein Admin kann
bisher nichts Besonderes – das Feld ist vorbereitet für spätere Erweiterungen
(z.B. andere Bilder löschen dürfen).
Zum Upgraden: Supabase → Table Editor → `profiles` → deine Zeile → `role` auf `admin` setzen.

---

## Was die Regeln garantieren (RLS-Policies)

- Jeder (auch ausgeloggt) darf die **Mediathek** sehen.
- Nur **eingeloggte** User dürfen Bilder **hochladen**.
- Jeder User kann **nur seine eigenen** Bilder löschen.
- Direkte Schreibzugriffe auf `invites` sind komplett gesperrt – Codes werden
  ausschließlich über die SQL-Funktion `redeem_invite()` eingelöst.

---

## Was kostet das?
Der kostenlose Supabase-Plan reicht locker für euch:
- 500 MB Datenbank
- 1 GB Datei-Storage
- 50.000 aktive User / Monat
- 5 GB Traffic / Monat

Für ein Airsoft-Team-Portal ist das völlig ausreichend.
