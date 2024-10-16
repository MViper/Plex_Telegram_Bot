# Viper-Plex Bot 📽️

Willkommen beim **Viper-Plex Bot**! Dieser Bot bietet eine einfache Möglichkeit, Filme und Serien zu entdecken, Benachrichtigungen zu erhalten und mehr. Diese Anleitung erklärt die wichtigsten Funktionen und Befehle.

## Allgemeine Benutzerbefehle

### 1. Starten des Bots
- **Befehl:** `/start`
- **Beschreibung:** Registriert Sie als Benutzer und startet die Interaktion mit dem Bot.

### 2. Benachrichtigungen aktivieren/deaktivieren
- **Befehl:** `/notification_on`
- **Beschreibung:** Aktiviert Benachrichtigungen für neu hinzugefügte Filme.

- **Befehl:** `/notification_off`
- **Beschreibung:** Deaktiviert Benachrichtigungen für neue Filme.

### 3. Serien anzeigen
- **Befehl:** `/serien`
- **Beschreibung:** Zeigt eine Liste aller Serien in der Datenbank.

### 4. Letzter hinzugefügter Film
- **Befehl:** `/latestmovie`
- **Beschreibung:** Zeigt den zuletzt hinzugefügten Film an.

### 5. Die letzten 10 hinzugefügten Filme anzeigen
- **Befehl:** `/latest10movies`
- **Beschreibung:** Zeigt eine Liste der letzten 10 hinzugefügten Filme an.

### 6. Top-bewertete Filme anzeigen
- **Befehl:** `/top_rated`
- **Beschreibung:** Zeigt die am besten bewerteten Filme an.

### 7. Wunschfilm anfragen
- **Befehl:** `/wunsch`
- **Beschreibung:** Fügt einen Film in Ihre Wunschliste hinzu.

### 8. Wunschliste anzeigen
- **Befehl:** `/w_list`
- **Beschreibung:** Zeigt Ihre persönliche Wunschliste an.

### 9. Filmempfehlung des Tages
- **Befehl:** `/empfehlung`
- **Beschreibung:** Zeigt die tägliche Filmempfehlung an.

### 10. Newsletter abonnieren/abmelden
- **Befehl:** `/newsletter`
- **Beschreibung:** Abonniert den wöchentlichen Newsletter oder meldet Sie davon ab.

### 11. Hilfe anzeigen
- **Befehl:** `/help`
- **Beschreibung:** Zeigt eine Liste aller verfügbaren Befehle und deren Beschreibungen.

---

## Zusätzliche Benutzerbefehle

### 1. Profil anzeigen
- **Befehl:** `/profil`
- **Beschreibung:** Zeigt Ihr Benutzerprofil und Ihre Einstellungen an. Sie können Informationen wie Ihren Benutzernamen, Ihre ID und andere relevante Einstellungen einsehen.

### 2. Feature-Anfragen oder Fehlerberichte senden
- **Befehl:** `/dev`
- **Beschreibung:** Senden Sie eine Feature-Anfrage oder melden Sie einen Fehler.

### 3. Feedback abgeben
- **Befehl:** `/feedback`
- **Beschreibung:** Geben Sie Feedback zum Bot ab.

### 4. FAQ anzeigen
- **Befehl:** `/faq`
- **Beschreibung:** Zeigt eine Liste häufig gestellter Fragen und Antworten.

### 5. Informationen zur Anzahl der Filme und Serien
- **Befehl:** `/info`
- **Beschreibung:** Zeigt die Anzahl verfügbarer Filme und Serien an.

### 6. Bot-Informationen
- **Befehl:** `/bot`
- **Beschreibung:** Zeigt Informationen über den Bot an, wie Version, letzte Aktualisierungen oder geplante Funktionen.

### 7. Fehlerprotokolle anzeigen
- **Befehl:** `/logs`
- **Beschreibung:** Zeigt die neuesten Fehlerprotokolle an.

---

## Admin-Befehle (Nur für Administratoren)

### 1. Nachricht an alle Benutzer senden
- **Befehl:** `/admin`
- **Beschreibung:** Sendet eine Nachricht an alle Benutzer.

### 2. Offene Filmwünsche anzeigen
- **Befehl:** `/open_wishes`
- **Beschreibung:** Zeigt eine Liste aller offenen Benutzerwünsche an.

### 3. Benutzerinformationen anzeigen
- **Befehl:** `/user`
- **Beschreibung:** Zeigt Informationen über einen Benutzer an.

### 4. Newsletter manuell senden
- **Befehl:** `/send_newsletter`
- **Beschreibung:** Sendet den wöchentlichen Newsletter manuell an alle Abonnenten.

### 5. Feedback als Textdatei
- **Befehl:** `/f_log`
- **Beschreibung:** Sendet das Feedback als `.txt`-Datei an den Admin.

### 6. Fehlerprotokolle löschen
- **Befehl:** `/log_delete`
- **Beschreibung:** Löscht die Fehlerprotokolle.

### 7. FAQ bearbeiten
- **Befehl:** `/add_faq`
- **Beschreibung:** Fügt eine neue Frage und Antwort in die FAQ ein.

- **Befehl:** `/del_faq`
- **Beschreibung:** Löscht einen FAQ-Eintrag.

---

## Dev-Befehle 👨‍💻

### 1. Benutzerdatei aktualisieren
- **Befehl:** `/update`
- **Beschreibung:** Aktualisiert die Datei `user.yml`, die die Benutzerinformationen speichert.

### 2. Befehlsverlauf anzeigen
- **Befehl:** `/command_history`
- **Beschreibung:** Zeigt eine Liste der zuletzt verwendeten Befehle an.

### 3. Backup erstellen
- **Befehl:** `/backup`
- **Beschreibung:** Erstellt ein Backup der relevanten Dateien und sendet es als ZIP-Datei.

### 4. Serverinformationen anzeigen
- **Befehl:** `/serverinfo`
- **Beschreibung:** Zeigt Informationen über den Server, auf dem der Bot läuft.

### 5. Bot-Gesundheitscheck
- **Befehl:** `/healthcheck`
- **Beschreibung:** Überprüft den Status und die Funktionalität des Bots.

### 6. Debug-Modus ein-/ausschalten
- **Befehl:** `/setdebug`
- **Beschreibung:** Aktiviert oder deaktiviert den Debug-Modus.

### 7. Support-Ticket erstellen
- **Befehl:** `/support`
- **Beschreibung:** Erstellt ein Support-Ticket und sendet es an den Bot-Ersteller.

---

## Zusätzliche Hinweise
- Der Bot sendet jeden Sonntag automatisch einen Newsletter mit den neuesten Filmen.
- Geben Sie Ihre korrekte E-Mail-Adresse an, um den Newsletter zu erhalten.
- Administratoren und Entwickler können zusätzliche Funktionen nutzen, wie das Bearbeiten der FAQ, das Versenden von Nachrichten an alle Benutzer und die Verwaltung der Bot-Diagnosen.

---

Viel Spaß mit dem Viper-Plex Bot! 🎬
