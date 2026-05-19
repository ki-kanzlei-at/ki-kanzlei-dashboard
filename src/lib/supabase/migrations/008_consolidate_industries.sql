-- ── Migration 008: Branchen-Konsolidierung ──
-- Mapped ~50 alte Sub-Branchen auf die konsolidierte Liste in src/types/leads.ts.
-- 8898 Leads werden vereinheitlicht. Vor Ausführung Backup empfohlen.

BEGIN;

-- Recht & Steuern
UPDATE leads SET industry = 'Rechtsanwalt'    WHERE industry IN ('Kanzlei', 'Patentanwalt');
UPDATE leads SET industry = 'Buchhaltung'     WHERE industry IN ('Personalverrechnung');
UPDATE leads SET industry = 'Wirtschaftsprüfer' WHERE industry IN ('Treuhand');

-- Ärzte: Hausarzt bleibt unter "Arzt", alle Spezialisten → "Facharzt"
UPDATE leads SET industry = 'Arzt'      WHERE industry IN ('Hausarzt');
UPDATE leads SET industry = 'Facharzt'  WHERE industry IN (
  'Internist', 'Orthopäde', 'Augenarzt', 'Hautarzt', 'Kinderarzt',
  'Gynäkologe', 'HNO-Arzt', 'Kardiologe'
);
UPDATE leads SET industry = 'Zahnarzt'        WHERE industry IN ('Zahntechniker');
UPDATE leads SET industry = 'Psychotherapie'  WHERE industry IN ('Psychologie');

-- Klinik & Pflege
UPDATE leads SET industry = 'Krankenhaus' WHERE industry IN ('Labor');
UPDATE leads SET industry = 'Optiker'     WHERE industry IN ('Hörgeräteakustiker');

-- Bau & Planung
UPDATE leads SET industry = 'Architekt'     WHERE industry IN ('Innenarchitekt');
UPDATE leads SET industry = 'Ingenieurbüro' WHERE industry IN ('Vermessungsbüro');

-- Handwerk
UPDATE leads SET industry = 'Schreinerei'      WHERE industry IN ('Tischlerei');
UPDATE leads SET industry = 'Dachdeckerei'     WHERE industry IN ('Zimmerei');
UPDATE leads SET industry = 'Schlosserei'      WHERE industry IN ('Metallbau');
UPDATE leads SET industry = 'Handwerksbetrieb' WHERE industry IN ('Schornsteinfeger', 'Gerüstbau');
UPDATE leads SET industry = 'Bodenleger'       WHERE industry IN ('Fliesenleger');
UPDATE leads SET industry = 'Klimatechnik'     WHERE industry IN ('Gebäudetechnik');

-- Auto & Verkehr
UPDATE leads SET industry = 'Autohaus' WHERE industry IN ('Autohandel');

-- Logistik
UPDATE leads SET industry = 'Spedition' WHERE industry IN ('Transportunternehmen');

-- Gastronomie
UPDATE leads SET industry = 'Restaurant' WHERE industry IN ('Imbiss');
UPDATE leads SET industry = 'Weingut'    WHERE industry IN ('Brauerei');

-- Handel
UPDATE leads SET industry = 'Einzelhandel' WHERE industry IN ('Tierhandlung');
UPDATE leads SET industry = 'Vertrieb'     WHERE industry IN ('Import-Export');

-- IT
UPDATE leads SET industry = 'Hosting'  WHERE industry IN ('Rechenzentrum');
UPDATE leads SET industry = 'Sonstige' WHERE industry IN ('Coworking', 'Technologiepark');

-- Marketing & Medien
UPDATE leads SET industry = 'Webagentur'      WHERE industry IN ('Webdesign');
UPDATE leads SET industry = 'Videoproduktion' WHERE industry IN ('Tonstudio');

-- Beratung & Personal
UPDATE leads SET industry = 'Leasing'             WHERE industry IN ('Inkasso');
UPDATE leads SET industry = 'Personalvermittlung' WHERE industry IN ('Zeitarbeit');

-- Beauty & Wellness
UPDATE leads SET industry = 'Kosmetikstudio' WHERE industry IN ('Beautysalon');

-- Service
UPDATE leads SET industry = 'Sicherheitsdienst' WHERE industry IN ('Detektei');
UPDATE leads SET industry = 'Eventmanagement'   WHERE industry IN ('Veranstaltungstechnik');
UPDATE leads SET industry = 'Reinigungsfirma'   WHERE industry IN ('Gebäudeservice');

-- Garten
UPDATE leads SET industry = 'Gartenbau' WHERE industry IN ('Landschaftspflege');

-- Energie & Umwelt
UPDATE leads SET industry = 'Photovoltaik' WHERE industry IN ('Wärmepumpe');
UPDATE leads SET industry = 'Recycling'    WHERE industry IN ('Abfallentsorgung');

-- Bildung
UPDATE leads SET industry = 'Sprachschule' WHERE industry IN ('Nachhilfe');
UPDATE leads SET industry = 'Sonstige'     WHERE industry IN ('Hundeschule');

-- Alles was nicht mehr in der neuen Liste vorkommt → Sonstige
UPDATE leads SET industry = 'Sonstige'
WHERE industry IS NOT NULL
  AND industry NOT IN (
    'Rechtsanwalt', 'Notar', 'Steuerberater', 'Wirtschaftsprüfer', 'Buchhaltung',
    'Arzt', 'Facharzt', 'Zahnarzt', 'Tierarzt', 'Apotheke',
    'Physiotherapie', 'Psychotherapie', 'Heilpraktiker',
    'Krankenhaus', 'Pflegeheim', 'Pflegedienst', 'Medizintechnik', 'Optiker',
    'Immobilienmakler', 'Hausverwaltung', 'Bauträger',
    'Architekt', 'Ingenieurbüro', 'Gutachter', 'Bauunternehmen',
    'Handwerksbetrieb', 'Elektrotechnik', 'Sanitär', 'Heizung', 'Klimatechnik',
    'Installateur', 'Schreinerei', 'Schlosserei', 'Dachdeckerei', 'Malerbetrieb',
    'Bodenleger', 'Glaserei',
    'KFZ-Werkstatt', 'Autohaus', 'Tankstelle',
    'Spedition', 'Kurierdienst', 'Umzugsunternehmen',
    'Hotel', 'Pension', 'Campingplatz', 'Ferienhaus', 'Tourismus', 'Reisebüro',
    'Restaurant', 'Café', 'Catering', 'Bäckerei', 'Metzgerei', 'Weingut',
    'Einzelhandel', 'Großhandel', 'E-Commerce', 'Modegeschäft', 'Supermarkt',
    'Juwelier', 'Buchhandlung', 'Vertrieb',
    'IT-Dienstleister', 'Softwareentwicklung', 'Hosting', 'Telekommunikation',
    'Werbeagentur', 'Marketingagentur', 'Webagentur', 'PR-Agentur',
    'Grafikdesign', 'Druckerei', 'Werbetechnik', 'Fotograf', 'Videoproduktion', 'Medien',
    'Unternehmensberatung', 'Wirtschaftsberatung', 'Coaching',
    'Personalvermittlung', 'Personalberatung',
    'Bank', 'Versicherung', 'Versicherungsmakler', 'Finanzberater',
    'Vermögensverwaltung', 'Leasing',
    'Friseur', 'Kosmetikstudio', 'Wellnesscenter', 'Nagelstudio', 'Tattoo-Studio',
    'Fitnessstudio', 'Sportverein', 'Tanzschule',
    'Fahrschule', 'Sprachschule', 'Musikschule', 'Kindergarten',
    'Reinigungsfirma', 'Facility Management', 'Sicherheitsdienst', 'Eventmanagement', 'Bestattung',
    'Gartenbau', 'Floristik', 'Landwirtschaft',
    'Energieversorger', 'Photovoltaik', 'Energieberatung', 'Recycling',
    'Sonstige'
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
