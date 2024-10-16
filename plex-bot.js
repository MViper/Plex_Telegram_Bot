require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const yaml = require('yamljs');
const path = require('path');
const dayjs = require('dayjs');
const dayOfYear = require('dayjs/plugin/dayOfYear'); 
const express = require('express');
const bodyParser = require('body-parser');
const NodeCache = require('node-cache');
const schedule = require('node-schedule');
const moment = require('moment');
const nodemailer = require('nodemailer');
const { scheduleJob } = require('node-schedule');
const { format } = require('date-fns');
const archiver = require('archiver');

const today = format(new Date(), 'yyyy-MM-dd');
console.log(today); // Sollte das aktuelle Datum im Format yyyy-MM-dd ausgeben

const CacheDir = path.join(__dirname, 'Cache');
const cacheFilePath = path.join(CacheDir, 'cache.json');

// Setze PROJECT_ROOT auf das aktuelle Verzeichnis
const PROJECT_ROOT = __dirname;

// Konstanten aus .env-Datei
const BOT_TOKEN = process.env.BOT_TOKEN;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const PLEX_DOMAIN = process.env.PLEX_DOMAIN;
const PLEX_LIBRARY_URL = `${PLEX_DOMAIN}/library/sections/all?X-Plex-Token=${PLEX_TOKEN}`;
const USER_YML_PATH = path.resolve(PROJECT_ROOT, process.env.USER_YML_PATH);
const LOG_DIR = path.resolve(PROJECT_ROOT, process.env.LOG_DIR);
const ERROR_LOG_PATH = path.resolve(LOG_DIR, process.env.ERROR_LOG_PATH);
const PORT = process.env.PORT;
const USER1_ID = process.env.USER1_ID;
const USER2_ID = process.env.USER2_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID;
const errorLogPath = process.env.ERROR_LOG_PATH;

// Debug-Ausgaben für Pfade
console.log('USER_YML_PATH:', USER_YML_PATH);
console.log('LOG_DIR:', LOG_DIR);
console.log('ERROR_LOG_PATH:', ERROR_LOG_PATH);

// Sicherstellen, dass Verzeichnisse und Dateien existieren
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

if (!fs.existsSync(USER_YML_PATH)) {
  fs.writeFileSync(USER_YML_PATH, yaml.stringify({}, 4));
}

if (!fs.existsSync(ERROR_LOG_PATH)) {
  fs.writeFileSync(ERROR_LOG_PATH, ''); // Leere Datei erstellen
}

// Erstelle den Cache-Ordner, falls er nicht existiert
if (!fs.existsSync(CacheDir)) {
  fs.mkdirSync(CacheDir);
}

// Initialisiere den Cache mit einer bestimmten Lebensdauer (TTL) von 1 Stunde
const cache = new NodeCache({ stdTTL: 3600 });

// Funktion zum Speichern des Caches in eine Datei
function saveCacheToFile() {
  const cacheData = cache.keys().reduce((acc, key) => {
    acc[key] = cache.get(key);
    return acc;
  }, {});

  fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData));
}

// Funktion zum Laden des Caches aus einer Datei
function loadCacheFromFile() {
  if (fs.existsSync(cacheFilePath)) {
    const cacheData = JSON.parse(fs.readFileSync(cacheFilePath));
    for (const [key, value] of Object.entries(cacheData)) {
      cache.set(key, value);
    }
  }
}

// Funktion zum Abrufen von Plex-Daten
async function fetchPlexData(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'X-Plex-Token': PLEX_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    logError(`Error fetching Plex data: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen aller Filme
async function fetchAllMovies() {
  try {
    const sectionsData = await fetchPlexData(PLEX_LIBRARY_URL);
    const sections = sectionsData.MediaContainer.Directory;

    let movies = [];

    for (const section of sections) {
      const sectionUrl = `${PLEX_DOMAIN}/library/sections/${section.key}/all?X-Plex-Token=${PLEX_TOKEN}`;
      const sectionData = await fetchPlexData(sectionUrl);

      if (sectionData.MediaContainer && sectionData.MediaContainer.Metadata) {
        const metadata = sectionData.MediaContainer.Metadata;
        movies = movies.concat(metadata.filter(media => media.type === 'movie'));
      }
    }

    movies.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    return movies;
  } catch (error) {
    logError(`Error fetching all movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der Filme mit Caching
async function fetchMoviesWithCache() {
  const cacheKey = 'allMovies';
  const cachedMovies = cache.get(cacheKey);

  if (cachedMovies) {
    logMessage('Movies fetched from cache');
    return cachedMovies;
  }

  try {
    const movies = await fetchAllMovies();
    cache.set(cacheKey, movies);
    logMessage('Movies fetched from API and cached');
    return movies;
  } catch (error) {
    logError(`Error fetching movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen eines zufälligen Films mit Caching
async function fetchRandomMovie() {
  try {
    const movies = await fetchMoviesWithCache();
    if (movies.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * movies.length);
    return movies[randomIndex];
  } catch (error) {
    logError(`Error fetching random movie: ${error.message}`);
    throw error;
  }
}

// Funktion zum Durchführen der Filmsuche mit Caching
async function searchMovies(query) {
  try {
    const movies = await fetchMoviesWithCache();
    const results = movies.filter(movie =>
      movie.title.toLowerCase().includes(query.toLowerCase())
    );
    return results;
  } catch (error) {
    logError(`Error searching movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der gut bewerteten Filme mit Caching
async function fetchTopRatedMovies() {
  try {
    const movies = await fetchMoviesWithCache();
    const ratedMovies = movies.filter(movie => movie.rating && movie.rating > 0);
    ratedMovies.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return ratedMovies;
  } catch (error) {
    logError(`Error fetching top-rated movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen des Films des Tages mit Caching
async function fetchDailyRecommendation() {
  try {
    const ratedMovies = await fetchTopRatedMovies();
    if (ratedMovies.length === 0) return null;

    dayjs.extend(dayOfYear); // Füge das Plugin hier hinzu
    const dayOfYear = dayjs().dayOfYear();
    const todayIndex = dayOfYear % ratedMovies.length;
    return ratedMovies[todayIndex];
  } catch (error) {
    logError(`Error fetching daily recommendation: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der letzten 10 hinzugefügten Filme mit Caching
async function fetchLatest10Movies() {
  try {
    const movies = await fetchMoviesWithCache();
    const sortedMovies = movies
      .filter(movie => movie.addedAt)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 10);

    return sortedMovies;
  } catch (error) {
    logError(`Error fetching latest 10 movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum automatischen Aktualisieren des Caches
async function updateCache() {
  try {
    await fetchMoviesWithCache(); // Stellt sicher, dass der Cache aktualisiert wird
    logMessage('Cache wurde automatisch aktualisiert');
  } catch (error) {
    logError(`Fehler beim automatischen Aktualisieren des Caches: ${error.message}`);
  }
}

// Lade den Cache beim Start
(async function start() {
  try {
    await fetchMoviesWithCache(); // Initialisiert den Cache beim Start
    logMessage('Cache beim Start initialisiert');
    
    // Speicher den Cache regelmäßig (z.B. jede Stunde)
    schedule.scheduleJob('0 * * * *', saveCacheToFile);

    // Plane die automatische Aktualisierung des Caches jede Stunde
    schedule.scheduleJob('0 * * * *', updateCache);

    // Beispiel für die Verwendung von node-schedule
    function checkForNewMovies() {
      // Hier könntest du eine Funktion zum Überprüfen neuer Filme einfügen
      console.log('Checking for new movies...');
    }

    // Beispiel für geplante Aufgaben
    schedule.scheduleJob('*/1 * * * *', checkForNewMovies);
  } catch (error) {
    logError(`Fehler beim Start des Bots: ${error.message}`);
  }
})();

// Telegram-Bot-Instanz erstellen
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Express-Server für Webhooks
const app = express();
app.use(bodyParser.json());

// Funktion zum Protokollieren von allgemeinen Nachrichten
function logMessage(message) {
  const today = dayjs().format('YYYY-MM-DD');
  const logFilePath = path.join(LOG_DIR, `${today}.log`);
  fs.appendFileSync(logFilePath, `${dayjs().format('HH:mm:ss')} - ${message}\n`);
}

// Funktion zur Fehlerprotokollierung
function logError(error) {
  const errorMessage = `${dayjs().format('HH:mm:ss')} - Error: ${error}\n`;
  fs.appendFileSync(ERROR_LOG_PATH, errorMessage);
}

const faqFilePath = path.join(__dirname, 'faq.json');  // Pfad zur faq.json im Hauptverzeichnis
const authorizedUsers = [USER1_ID, USER2_ID];

// Funktion zum Laden der FAQs
function loadFaqs() {
  if (!fs.existsSync(faqFilePath)) {
    fs.writeFileSync(faqFilePath, JSON.stringify([])); // Leere Datei erstellen, wenn sie nicht existiert
  }
  const faqs = JSON.parse(fs.readFileSync(faqFilePath));
  return faqs;
}

// Funktion zum Speichern der FAQs
function saveFaqs(faqs) {
  fs.writeFileSync(faqFilePath, JSON.stringify(faqs, null, 2));
}

// Befehl zum Abrufen von Trailern
bot.onText(/\/trailer/, (msg) => {
  const chatId = msg.chat.id;

  // Nach dem Filmtitel fragen
  bot.sendMessage(chatId, 'Bitte geben Sie den Titel des Films ein:');

  // Auf die nächste Nachricht warten, die den Filmnamen enthält
  bot.once('message', async (msg) => {
      const filmTitle = msg.text;

      try {
          // YouTube API URL für die Suche
          const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(filmTitle + ' trailer')}&key=${process.env.YOUTUBE_API_KEY}`;

          const response = await axios.get(url);
          const videos = response.data.items;

          // Überprüfen, ob Videos gefunden wurden
          if (videos.length > 0) {
              const videoId = videos[0].id.videoId; // ID des ersten gefundenen Trailers
              const trailerUrl = `https://www.youtube.com/watch?v=${videoId}`;
              const reply = `Hier ist der Trailer für "${filmTitle}": ${trailerUrl}`;
              bot.sendMessage(chatId, reply);
          } else {
              bot.sendMessage(chatId, `Leider konnte ich keinen Trailer für "${filmTitle}" finden.`);
          }
      } catch (error) {
          console.error('Fehler beim Abrufen des Trailers:', error);
          bot.sendMessage(chatId, 'Es gab ein Problem beim Abrufen des Trailers. Bitte versuche es später erneut.');
      }
  });
});

// Befehl zum Abrufen des Passworts
bot.onText(/\/passwd/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); // Konvertiere die userId in einen String für den Vergleich

  // Überprüfen, ob der Benutzer autorisiert ist
  if (authorizedUsers.includes(userId)) {
    // Passwort aus der .env-Datei zurückgeben
    const password = process.env.ADMIN_PW; // Passwort aus der .env-Datei
    const reply = `🔒 Das Passwort für den Adminbereich lautet:\n\n${password}\n\n‼️*Hinweis:* Diese Nachricht wird automatisch in 1 Minute gelöscht.`;

    // Nachricht senden und ihre message_id speichern
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).then((sentMessage) => {
      // Nachricht nach 1 Minute löschen
      setTimeout(() => {
        bot.deleteMessage(chatId, sentMessage.message_id).catch((err) => {
          console.error('Fehler beim Löschen der Antwortnachricht:', err);
        });
      }, 60000); // 60000 ms = 1 Minute
    });

    // Ursprünglichen Befehl löschen
    setTimeout(() => {
      bot.deleteMessage(chatId, msg.message_id).catch((err) => {
        console.error('Fehler beim Löschen der ursprünglichen Nachricht:', err);
      });
    }, 60000); // 60000 ms = 1 Minute

  } else {
    const reply = `🚫 Zugriff verweigert! \nLeider hast du keine Berechtigung, diesen Befehl auszuführen.`;

    // Nachricht senden und nach 1 Minute löschen
    bot.sendMessage(chatId, reply).then((sentMessage) => {
      setTimeout(() => {
        bot.deleteMessage(chatId, sentMessage.message_id).catch((err) => {
          console.error('Fehler beim Löschen der Antwortnachricht:', err);
        });
      }, 60000); // 1 Minute
    });

    // Ursprünglichen Befehl löschen
    setTimeout(() => {
      bot.deleteMessage(chatId, msg.message_id).catch((err) => {
        console.error('Fehler beim Löschen der ursprünglichen Nachricht:', err);
      });
    }, 60000); // 1 Minute
  }
});

const usersNightMode = {}; // Temporärer Speicher für Nachtmodus

// Funktion zum Laden der Benutzerdaten aus der user.yml
function loadUserData() {
    if (!fs.existsSync(USER_YML_PATH)) {
        fs.writeFileSync(USER_YML_PATH, yaml.stringify({}));
    }
    return yaml.load(USER_YML_PATH);
}

// Funktion zum Speichern der Benutzerdaten in die user.yml
function saveUserData(userData) {
    fs.writeFileSync(USER_YML_PATH, yaml.stringify(userData, 4));
}

// /night Befehl
bot.onText(/\/night/, (msg) => {
    const chatId = msg.chat.id;
    const userData = loadUserData(); // Lade die Benutzerdaten
    const userId = chatId.toString();

    bot.sendMessage(chatId, 'Bitte geben Sie die Startzeit des Nachtmodus im Format HH:mm ein (z.B. 22:00):');

    bot.once('message', (msg) => {
        const startTime = msg.text;
        if (!/^\d{2}:\d{2}$/.test(startTime)) {
            return bot.sendMessage(chatId, 'Ungültiges Zeitformat. Bitte geben Sie die Zeit im Format HH:mm ein.');
        }

        bot.sendMessage(chatId, 'Bitte geben Sie die Endzeit des Nachtmodus im Format HH:mm ein (z.B. 06:00):');

        bot.once('message', (msg) => {
            const endTime = msg.text;
            if (!/^\d{2}:\d{2}$/.test(endTime)) {
                return bot.sendMessage(chatId, 'Ungültiges Zeitformat. Bitte geben Sie die Zeit im Format HH:mm ein.');
            }

            // Speichere die Nachtmodus-Daten ohne die Benachrichtigungen sofort zu deaktivieren
            userData[userId] = userData[userId] || {};
            userData[userId].nightMode = { startTime, endTime };
            saveUserData(userData); // Speichere die Daten in die yml-Datei

            bot.sendMessage(chatId, `Nachtmodus geplant von ${startTime} bis ${endTime}. Benachrichtigungen werden deaktiviert, wenn der Nachtmodus beginnt.`);
        });
    });
});

// Funktion zur Überprüfung, ob der Benutzer im Nachtmodus ist
function isUserInNightMode(chatId) {
    const userData = loadUserData();
    const userId = chatId.toString();
    const userNightMode = userData[userId] && userData[userId].nightMode;

    if (!userNightMode) return false;

    const now = moment();
    const start = moment(userNightMode.startTime, 'HH:mm');
    const end = moment(userNightMode.endTime, 'HH:mm');

    if (end.isBefore(start)) {
        return now.isAfter(start) || now.isBefore(end); // Nachtmodus über Mitternacht
    } else {
        return now.isBetween(start, end); // Normaler Nachtmodus
    }
}

// Überprüft und stellt den Nachtmodus nach Ablauf wieder her
function resetNotificationsAfterNightMode() {
    const userData = loadUserData();

    for (const userId in userData) {
        if (isUserInNightMode(userId)) continue;

        // Setze die Benachrichtigungseinstellungen auf den ursprünglichen Wert zurück
        if (userData[userId].originalNotifications !== undefined) {
            userData[userId].notifications = userData[userId].originalNotifications;
            delete userData[userId].originalNotifications; // Lösche die temporäre Speicherung
            saveUserData(userData);
        }
    }
}

// Funktion zur automatischen Aktivierung des Nachtmodus
function activateNightMode() {
    const userData = loadUserData();

    for (const userId in userData) {
        const userNightMode = userData[userId] && userData[userId].nightMode;
        if (!userNightMode) continue;

        const now = moment();
        const start = moment(userNightMode.startTime, 'HH:mm');
        const end = moment(userNightMode.endTime, 'HH:mm');

        // Wenn die Startzeit erreicht ist und die Benachrichtigungen noch nicht deaktiviert wurden, deaktiviere sie
        if (now.isSameOrAfter(start) && userData[userId].notifications !== false) {
            userData[userId].originalNotifications = userData[userId].notifications;
            userData[userId].notifications = false;
            saveUserData(userData);
            console.log(`Nachtmodus für Benutzer ${userId} aktiviert.`);
        }
    }
}

// Automatische Nachtmodus-Aktivierung und Zurücksetzung überwachen
setInterval(() => {
    activateNightMode(); // Nachtmodus aktivieren, wenn es Zeit ist
    resetNotificationsAfterNightMode(); // Benachrichtigungen nach dem Nachtmodus zurücksetzen
}, 60 * 1000); // Überprüfung alle 60 Sekunden

// /night_off Befehl
bot.onText(/\/n_off/, (msg) => {
  const chatId = msg.chat.id;
  const userData = loadUserData(); // Lade die Benutzerdaten
  const userId = chatId.toString();

  if (userData[userId] && userData[userId].nightMode) {
      // Setze die Benachrichtigungseinstellungen auf den ursprünglichen Wert zurück
      if (userData[userId].originalNotifications !== undefined) {
          userData[userId].notifications = userData[userId].originalNotifications;
          delete userData[userId].originalNotifications; // Lösche die temporäre Speicherung
      }

      // Entferne die Nachtmodus-Daten
      delete userData[userId].nightMode;

      // Speichere die Änderungen in der user.yml-Datei
      saveUserData(userData);

      bot.sendMessage(chatId, 'Der Nachtmodus wurde deaktiviert. Benachrichtigungen sind wieder aktiviert.');
  } else {
      bot.sendMessage(chatId, 'Es ist kein Nachtmodus aktiv.');
  }
});

// /faq Befehl: Zeigt alle FAQs an
bot.onText(/\/faq/, (msg) => {
  const chatId = msg.chat.id;
  const faqs = loadFaqs();

  if (faqs.length === 0) {
    bot.sendMessage(chatId, 'Es gibt derzeit keine FAQs.');
  } else {
    let response = 'Häufig gestellte Fragen:\n\n';
    faqs.forEach((faq, index) => {
      response += `${index + 1}. *${faq.question}*\n${faq.answer}\n\n`;
    });
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  }
});

// /add_faq Befehl: Interaktives Hinzufügen einer neuen FAQ (nur für autorisierte Benutzer)
bot.onText(/\/add_faq/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (!authorizedUsers.includes(userId)) {
    bot.sendMessage(chatId, '❌ Du bist nicht autorisiert, diesen Befehl auszuführen.');
    return;
  }

  // Frage nach der FAQ-Frage
  bot.sendMessage(chatId, 'Bitte gib die FAQ-Frage ein:', {
    reply_markup: { force_reply: true }
  }).then(sentMessage => {
    bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, (reply) => {
      const question = reply.text;

      // Frage nach der FAQ-Antwort
      bot.sendMessage(chatId, 'Bitte gib die Antwort auf die Frage ein:', {
        reply_markup: { force_reply: true }
      }).then(sentMessage => {
        bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, (reply) => {
          const answer = reply.text;

          // FAQ speichern
          const faqs = loadFaqs();
          faqs.push({ question, answer });
          saveFaqs(faqs);

          bot.sendMessage(chatId, '✅ FAQ erfolgreich hinzugefügt.');
        });
      });
    });
  });
});

// /del_faq Befehl: Interaktives Entfernen einer FAQ (nur für autorisierte Benutzer)
bot.onText(/\/del_faq/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (!authorizedUsers.includes(userId)) {
    bot.sendMessage(chatId, '❌ Du bist nicht autorisiert, diesen Befehl auszuführen.');
    return;
  }

  const faqs = loadFaqs();

  if (faqs.length === 0) {
    bot.sendMessage(chatId, 'Es gibt derzeit keine FAQs zum Löschen.');
    return;
  }

  // Liste der FAQs anzeigen und um Eingabe der Nummer bitten
  let response = 'Welche FAQ möchtest du löschen?\n\n';
  faqs.forEach((faq, index) => {
    response += `${index + 1}. *${faq.question}*\n${faq.answer}\n\n`;
  });

  bot.sendMessage(chatId, response, {
    parse_mode: 'Markdown',
    reply_markup: { force_reply: true }
  }).then(sentMessage => {
    bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, (reply) => {
      const faqIndex = parseInt(reply.text, 10) - 1;

      if (isNaN(faqIndex) || faqIndex < 0 || faqIndex >= faqs.length) {
        bot.sendMessage(chatId, '❌ Ungültige Auswahl.');
        return;
      }

      // FAQ löschen
      faqs.splice(faqIndex, 1);
      saveFaqs(faqs);

      bot.sendMessage(chatId, '✅ FAQ erfolgreich gelöscht.');
    });
  });
});

// Pfad zur Abonnentendatei
const subscribersFilePath = './subscribers.json';
const moviesApiUrl = `${process.env.PLEX_DOMAIN}/api/movies/latest`; // Beispiel-API-URL, anpassen

// Erstelle die subscribers.json, wenn sie nicht existiert
if (!fs.existsSync(subscribersFilePath)) {
    fs.writeFileSync(subscribersFilePath, JSON.stringify([]));
}

let subscribers = [];

// Lade Abonnenten aus der subscribers.json
function loadSubscribers() {
    try {
        const data = fs.readFileSync(subscribersFilePath);
        subscribers = JSON.parse(data);
    } catch (error) {
        console.error('Fehler beim Laden der Abonnenten:', error);
    }
}

// Sende den Newsletter
async function sendNewsletter() {
    loadSubscribers(); // Abonnenten laden

    if (subscribers.length === 0) {
        console.log('Keine Abonnenten gefunden.');
        return;
    }

    const movies = await fetchLatestMovies(); // Filme abrufen
    const htmlContent = createNewsletterContent(movies); // HTML-Inhalt erstellen

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    subscribers.forEach(subscriber => {
        const mailOptions = {
            from: process.env.SMTP_USER,
            to: subscriber.email,
            subject: 'Wöchentlicher Film-Newsletter',
            html: htmlContent,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log('Fehler beim Senden der E-Mail:', error);
            }
            console.log('Newsletter gesendet an:', subscriber.email);
        });
    });
}

// Sofortige Bestätigungs-E-Mail senden
async function sendConfirmationEmail(email) {
    const latestMovies = await fetchLatestMovies(); // Den zuletzt hinzugefügten Film abrufen
    const latestMovie = latestMovies.length > 0 ? latestMovies[0] : null;

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const logoUrl = process.env.PLEX_LOGO_URL; // Füge hier die URL zu deinem Plex-Logo hinzu
    const latestMovieThumb = latestMovie ? `${process.env.PLEX_DOMAIN}${latestMovie.thumb}?X-Plex-Token=${process.env.PLEX_TOKEN}` : '';
    const latestMovieTitle = latestMovie ? latestMovie.title : 'Kein Film gefunden';
    const latestMovieSummary = latestMovie ? latestMovie.summary : 'Keine Zusammenfassung verfügbar';

    const mailOptions = {
        from: process.env.SMTP_USER,
        to: email,
        subject: '🎉 Bestätigung der Newsletter-Anmeldung 🎉',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
                <h1 style="color: #4CAF50;">Willkommen zum Viper-Plex Newsletter!</h1>
                <p style="font-size: 18px;">Vielen Dank, dass Sie sich für unseren Newsletter angemeldet haben! 🎊</p>
                <p style="font-size: 16px;">Ab sofort erhalten Sie jeden Sonntag die neuesten Informationen über spannende Filme.</p>
                <img src="${logoUrl}" alt="Plex Logo" style="width: 100px; margin: 20px 0;"/>
                <h2 style="color: #2196F3;">Zuletzt hinzugefügter Film:</h2>
                <p style="font-size: 20px; font-weight: bold;">${latestMovieTitle}</p>
                ${latestMovieThumb ? `<img src="${latestMovieThumb}" alt="${latestMovieTitle} Poster" width="200" height="300" style="margin: 10px 0;"/>` : ''}
                <p style="font-size: 18px;"><strong>Zusammenfassung:</strong> ${latestMovieSummary}</p>
                <p style="font-size: 16px; color: #777;">Wir freuen uns, Sie als Teil unserer Viper-Plex Familie zu haben!</p>
                <footer style="margin-top: 20px; font-size: 14px; color: #999;">Falls Sie Fragen haben, zögern Sie nicht, uns zu kontaktieren.</footer>
            </div>
        `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log('Fehler beim Senden der Bestätigungs-E-Mail:', error);
        }
        console.log('Bestätigungs-E-Mail gesendet an:', email);
    });
}

// Filme abrufen
async function fetchLatestMovies() {
    try {
        const response = await axios.get(moviesApiUrl);
        // Filtere nur Filme aus und ignoriere Serien und Staffeln
        return response.data.movies.filter(movie => !movie.isSeries);
    } catch (error) {
        console.error('Fehler beim Abrufen der Filme:', error);
        return [];
    }
}

// Erstelle den HTML-Inhalt des Newsletters
function createNewsletterContent(movies) {
    let html = `
        <div style="font-family: Arial, sans-serif; text-align: center; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
            <h1 style="color: #4CAF50;">Neueste Filme auf Viper-Plex</h1>
            <div style="width: 80%; margin: auto;">
    `;

    movies.forEach(movie => {
        const movieTitle = movie.title || 'Unbekannt';
        const movieSummary = movie.summary || 'Keine Zusammenfassung verfügbar';
        const addedAtDate = new Date((movie.addedAt || 0) * 1000).toLocaleString('de-DE'); // Konvertierung von Unix-Zeitstempel in lesbares Datum
        const movieThumb = movie.thumb ? `${process.env.PLEX_DOMAIN}${movie.thumb}?X-Plex-Token=${process.env.PLEX_TOKEN}` : '';

        html += `
            <div style="background: #fff; border-radius: 8px; padding: 15px; margin: 10px 0; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);">
                <h2 style="color: #2196F3;">${movieTitle}</h2>
                ${movieThumb ? `<img src="${movieThumb}" alt="${movieTitle} Poster" width="200" height="300" style="border-radius: 5px;"/>` : ''}
                <p><strong>Zusammenfassung:</strong> ${movieSummary}</p>
                <p><strong>Hinzugefügt am:</strong> ${addedAtDate}</p>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;
    return html;
}

// Abmeldung vom Newsletter
bot.on('callback_query', (query) => {
  const chatId = query.from.id; // Extrahiere die chatId aus dem Benutzer

  // Überprüfen, ob die Abmeldung angefordert wird
  if (query.data.startsWith('unsubscribe_')) {
      const subscriberIndex = subscribers.findIndex(subscriber => subscriber.chatId === chatId);
      if (subscriberIndex !== -1) {
          const subscriber = subscribers[subscriberIndex];
          const options = {
              reply_markup: {
                  inline_keyboard: [
                      [
                          {
                              text: 'Ja',
                              callback_data: `unsubscribe_yes_${chatId}`,
                          },
                          {
                              text: 'Nein',
                              callback_data: `unsubscribe_no_${chatId}`,
                          },
                      ],
                  ],
              },
          };
          bot.sendMessage(chatId, `😥 Möchten Sie sich wirklich von dem Newsletter abmelden, ${subscriber.username}?`, options);
      } else {
          bot.sendMessage(chatId, '❗️ Sie sind nicht für den Newsletter angemeldet.');
      }
  }
});


// Verarbeite die Callback-Daten für die Bestätigung
bot.on('callback_query', (query) => {
  const chatId = query.from.id; // Hier verwenden wir query.from.id, um die chatId zu erhalten
  if (query.data.startsWith('unsubscribe_yes')) {
      const subscriberIndex = subscribers.findIndex(subscriber => subscriber.chatId === chatId);
      if (subscriberIndex !== -1) {
          subscribers.splice(subscriberIndex, 1); // Abonnenten entfernen
          fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers, null, 2));
          bot.sendMessage(chatId, '✅ Sie wurden erfolgreich vom Newsletter abgemeldet.');
      } else {
          bot.sendMessage(chatId, '❗️ Abonnent nicht gefunden.');
      }
  } else if (query.data.startsWith('unsubscribe_no')) {
      bot.sendMessage(chatId, '❌ Abmeldung vom Newsletter abgebrochen.');
  }
});

// Abmeldebefehl (z.B. /unsubscribe)
bot.onText(/\/unsubscribe/, (msg) => {
  const chatId = msg.chat.id;
  unsubscribeFromNewsletter(chatId);
});

// Planen des Newsletter-Versands jeden Sonntag um 10:00 Uhr
schedule.scheduleJob('0 10 * * 0', () => {
    console.log('Sende wöchentlichen Newsletter...');
    sendNewsletter();
});

// Abonnieren
bot.onText(/\/newsletter/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || 'Unbekannt';
  
  // Überprüfen, ob der Benutzer bereits abonniert ist
  const subscriber = subscribers.find(subscriber => subscriber.chatId === chatId);
  
  if (!subscriber) {
      // Wenn nicht abonniert, frage nach der E-Mail-Adresse
      bot.sendMessage(chatId, 'Bitte geben Sie Ihre E-Mail-Adresse ein:');

      bot.once('message', (msg) => {
          const email = msg.text;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(email)) {
              // Neuen Abonnenten hinzufügen
              subscribers.push({ chatId, email, username });
              fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers, null, 2));
              sendConfirmationEmail(email); // Bestätigungs-E-Mail senden
              bot.sendMessage(chatId, '🎉 Sie haben sich erfolgreich für den Newsletter angemeldet!');
          } else {
              bot.sendMessage(chatId, '❌ Ungültige E-Mail-Adresse. Bitte versuchen Sie es erneut.');
          }
      });
  } else {
      // Wenn bereits abonniert, zeige die Optionen an
      const options = {
          reply_markup: {
              inline_keyboard: [
                  [
                      {
                          text: 'Abmelden',
                          callback_data: `unsubscribe_${chatId}`,
                      },
                      {
                          text: 'Mailadresse ändern',
                          callback_data: `change_email_${chatId}`,
                      },
                  ],
                  // Zusätzliche Optionen für Administratoren
                  ...(isAdmin(chatId) ? [
                      [
                          {
                              text: 'Send Newsletter',
                              callback_data: 'send_newsletter',
                          },
                          {
                              text: 'Abonnenten',
                              callback_data: 'list_subscribers',
                          },
                          {
                              text: 'Abonnenten Entfernen',
                              callback_data: 'remove_subscriber',
                          },
                      ]
                  ] : []),
              ],
          },
      };
      bot.sendMessage(chatId, 'Sie sind bereits angemeldet. Was möchten Sie tun?', options);
  }
});

// Funktion, um zu überprüfen, ob der Benutzer ein Administrator ist
function isAdmin(chatId) {
  const adminIds = [process.env.USER1_ID, process.env.USER2_ID];
  return adminIds.includes(chatId.toString());
}

// Callback-Handler für die Buttons
bot.on('callback_query', (query) => {
const chatId = query.from.id; // chatId aus der Anfrage erhalten

if (query.data.startsWith('change_email')) {
    bot.sendMessage(chatId, 'Bitte geben Sie Ihre neue E-Mail-Adresse ein:');
    bot.once('message', (msg) => {
        const newEmail = msg.text;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(newEmail)) {
            const subscriberIndex = subscribers.findIndex(subscriber => subscriber.chatId === chatId);
            if (subscriberIndex !== -1) {
                subscribers[subscriberIndex].email = newEmail; // E-Mail-Adresse aktualisieren
                fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers, null, 2));
                bot.sendMessage(chatId, '✅ Ihre E-Mail-Adresse wurde erfolgreich aktualisiert.');
            }
        } else {
            bot.sendMessage(chatId, '❌ Ungültige E-Mail-Adresse. Bitte versuchen Sie es erneut.');
        }
    });
} else if (query.data === 'send_newsletter') {
    sendNewsletter(); // Newsletter sofort senden
    bot.sendMessage(chatId, '📧 Der Newsletter wurde gesendet!');
} else if (query.data === 'list_subscribers') {
    // Hier wird die Abonnentenliste formatiert
    const subscriberList = subscribers.map(subscriber => `🔹 @${subscriber.username} - ${subscriber.email}`).join('\n') || 'Keine Abonnenten gefunden.';
    bot.sendMessage(chatId, `📋 Abonnenten:\n\n${subscriberList}`);
} else if (query.data === 'remove_subscriber') {
    bot.sendMessage(chatId, 'Bitte geben Sie die E-Mail-Adresse des Abonnenten ein, den Sie entfernen möchten:');
    bot.once('message', (msg) => {
        const emailToRemove = msg.text;
        const subscriberIndex = subscribers.findIndex(subscriber => subscriber.email === emailToRemove);
        if (subscriberIndex !== -1) {
            subscribers.splice(subscriberIndex, 1); // Abonnenten entfernen
            fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers, null, 2));
            bot.sendMessage(chatId, `✅ Der Abonnent ${emailToRemove} wurde entfernt.`);
        } else {
            bot.sendMessage(chatId, '❌ Abonnent nicht gefunden.');
        }
    });
}
});

// Lade Abonnenten beim Start
loadSubscribers();

// Profilbefehl
bot.onText(/\/profil/, (msg) => {
  const chatId = msg.chat.id;

  const userFilePath = path.join(__dirname, 'user.yml');
  const subscribersFilePath = path.join(__dirname, 'subscribers.json');
  const wishesFilePath = path.join(__dirname, 'wunsch', `wishes_${chatId}.json`);
  const feedbackFilePath = path.join(__dirname, 'feedback.log');

  // Schritt 1: Benutzerinformationen aus user.yml lesen
  fs.readFile(userFilePath, 'utf8', (err, userData) => {
      if (err) {
          console.error(`Fehler beim Lesen der Datei ${userFilePath}: ${err}`);
          bot.sendMessage(chatId, 'Fehler beim Laden der Benutzerinformationen.')
              .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
          return;
      }

      const users = load(userData);
      const user = users[chatId] || {}; // Benutzerdaten für den aktuellen Benutzer

      // Initialisiere Benutzerinformationen
      const userName = escapeMarkdownV2(user.username || 'Unbekannt');
      const userId = chatId;
      const firstUsedDate = escapeMarkdownV2(formatDate(user.firstUsed || new Date().toISOString())); // Aktuelles Datum verwenden, falls nicht vorhanden

      // Benutzerlevel initialisieren
      const commandCount = user.commandCount || 0; // Anzahl der Befehle aus den Benutzerdaten
      const wishesCount = user.wishesCount || 0; // Anzahl der Wünsche aus Benutzerdaten
      const userLevel = getUserLevel(commandCount, wishesCount); // Benutzerlevel ermitteln

      // Lieblingsgenre aus user.yml ermitteln
      const favoriteGenre = user.favoriteGenre || "Nicht festgelegt"; // Lieblingsgenre aus user.yml oder Standardwert

      // Admin und Dev IDs aus .env auslesen
      const adminIds = [process.env.USER1_ID, process.env.USER2_ID];
      const devId = process.env.DEV_CHAT_ID;

      // Bestimme die Rolle basierend auf der ID
      let roles = [];
      if (adminIds.includes(String(chatId))) {
          roles.push('Admin');
      }
      if (String(chatId) === devId) {
          roles.push('DEV');
      }
      const role = roles.length > 0 ? roles.join(', ') : 'Benutzer';

      // Schritt 2: Newsletter-Status aus subscribers.json lesen
      fs.readFile(subscribersFilePath, 'utf8', (err, subsData) => {
          if (err) {
              console.error(`Fehler beim Lesen der Datei ${subscribersFilePath}: ${err}`);
              bot.sendMessage(chatId, 'Fehler beim Laden des Newsletter-Status.')
                  .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
              return;
          }

          const subscribers = JSON.parse(subsData);
          const isSubscribed = subscribers.some(subscriber => subscriber.chatId === chatId);
          const newsletterStatus = isSubscribed ? 'Ja' : 'Nein';

          // Schritt 3: Wünsche aus wishes_${chatId}.json lesen
          fs.readFile(wishesFilePath, 'utf8', (err, wishesData) => {
              let wishesCount = 0; // Initialisierung der Wünsche
              let notificationStatus = user.notifications ? 'Ja' : 'Nein';

              if (!err) {
                  const userWishes = JSON.parse(wishesData);
                  wishesCount = userWishes.length;
              }

              // Schritt 4: Anzahl der Feedbacks zählen
              fs.stat(feedbackFilePath, (err) => {
                  let feedbackCount = 0; // Standardwert für Feedbacks

                  if (!err) { // Datei existiert
                      fs.readFile(feedbackFilePath, 'utf8', (err, feedbackData) => {
                          if (!err) {
                              const feedbackLines = feedbackData.split('\n');
                              feedbackCount = feedbackLines.filter(line => line.includes(`chatId ${chatId}`)).length; // Zähle nur die Feedbacks des aktuellen Benutzers
                          }

                          // Benutzerlevel aktualisieren basierend auf den aktuellen Wünschen
                          const updatedUserLevel = getUserLevel(commandCount, wishesCount);

                          // Schritt 5: Nachricht formatieren und senden
                          const profileMessage = `
📝 *Profil Informationen:*\n\n
👤 *Name:* @${userName}\n
🔑 *ID:* ${userId}\n
👤 *Nutzerrolle:* ${role}\n
🌟 *Benutzerlevel:* ${updatedUserLevel}\n
📅 *Registrierung:* ${firstUsedDate}\n
📰 *Newsletter:* ${newsletterStatus}\n
📋 *Anzahl der Wünsche:* ${wishesCount}\n
📬 *Anzahl der Feedbacks:* ${feedbackCount}\n
🔔 *Benachrichtigung:* ${notificationStatus}\n
`.trim(); // Whitespace entfernen

//🎞️ *Lieblingsgenre:* ${favoriteGenre}\n

                          // Sende Profilinformationen und zeige Button an
                          bot.sendMessage(chatId, profileMessage, {
                              parse_mode: 'MarkdownV2',
                              reply_markup: {
                                  inline_keyboard: [
                                      [{ text: 'Profil Bearbeiten', callback_data: 'edit_profile' }]
                                  ]
                              }
                          }).catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                      });
                  } else {
                      // Datei existiert nicht, einfach die Nachricht senden
                      const profileMessage = `
📝 *Profil Informationen:*\n\n
👤 *Name:* @${userName}\n
🔑 *ID:* ${userId}\n
👤 *Nutzerrolle:* ${role}\n
🌟 *Benutzerlevel:* ${userLevel}\n
📅 *Registrierung:* ${firstUsedDate}\n
📰 *Newsletter:* ${newsletterStatus}\n
📋 *Anzahl der Wünsche:* ${wishesCount}\n
📬 *Anzahl der Feedbacks:* 0\n
🔔 *Benachrichtigung:* ${notificationStatus}\n
`.trim(); // Whitespace entfernen

                      bot.sendMessage(chatId, profileMessage, {
                          parse_mode: 'MarkdownV2',
                          reply_markup: {
                              inline_keyboard: [
                                  [{ text: 'Profil Bearbeiten', callback_data: 'edit_profile' }]
                              ]
                          }
                      }).catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  }
              });
          });
      });
  });
});

// Callback query handler for profile editing
bot.on('callback_query', (callbackQuery) => {
  const action = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;

  if (action === 'edit_profile') {
    // Zeige Bearbeitungsoptionen an, wenn der Benutzer "Profil Bearbeiten" drückt
    bot.sendMessage(chatId, '🔍 Was möchten Sie tun? Wählen Sie eine der folgenden Optionen:', {
        reply_markup: {
            inline_keyboard: [
                [
                    //{ text: 'Lieblingsgenre setzen', callback_data: 'set_favorite_genre' },
                    { text: 'Profil zurücksetzen', callback_data: 'reset_profile' }
                ],
                [
                    { text: 'Punkte löschen', callback_data: 'delete_points' },
                    { text: 'Profil löschen', callback_data: 'delete_profile' }
                ]
            ]
        }
    });
  } else if (action === 'set_favorite_genre') {
      bot.sendMessage(chatId, 'Bitte geben Sie Ihre Lieblingsgenres ein, getrennt durch Kommas. Verfügbare Genres sind: \n\nAction, Abenteuer, Anime, Dokumentation, Drama, Familie, Fantasy, Horror, Katastrophen, Kinderfilme, Komödie, Krimi, Mystery, Syfy, Thriller, Western.');

      // Hier fangen wir die Nachricht des Benutzers ab
      bot.once('message', (msg) => {
          const newFavoriteGenre = msg.text;

          // Debugging: Logge das neue Lieblingsgenre
          console.log(`Neues Lieblingsgenre: ${newFavoriteGenre} für Benutzer ${chatId}`);

          // Update the favorite genre in user.yml
          fs.readFile(USER_YML_PATH, 'utf8', (err, userData) => {
              if (err) {
                  console.error(`Fehler beim Lesen der Datei ${USER_YML_PATH}: ${err}`);
                  bot.sendMessage(chatId, 'Fehler beim Aktualisieren des Lieblingsgenres.')
                      .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  return;
              }

              const users = load(userData);

              // Überprüfen, ob der Benutzer bereits existiert
              if (users[chatId]) {
                  // Setze das Lieblingsgenre
                  users[chatId].favoriteGenre = newFavoriteGenre; // Aktualisiere das Lieblingsgenre
              } else {
                  // Benutzer initialisieren, falls nicht vorhanden
                  users[chatId] = {
                      userId: chatId,
                      username: msg.from.username,
                      firstUsed: new Date().toISOString(),
                      notifications: true, // Standardwert, falls nicht gesetzt
                      commandCount: 0, // Standardwert für Befehlsanzahl
                      userLevel: 'Neuling', // Standardbenutzerlevel
                      favoriteGenre: newFavoriteGenre // Setze das Lieblingsgenre
                  };
              }

              // Schreibe die aktualisierten Benutzerinformationen zurück in die Datei
              fs.writeFile(USER_YML_PATH, dump(users), 'utf8', (err) => {
                  if (err) {
                      console.error(`Fehler beim Schreiben in die Datei ${USER_YML_PATH}: ${err}`);
                      bot.sendMessage(chatId, 'Fehler beim Aktualisieren des Lieblingsgenres.')
                          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  } else {
                      bot.sendMessage(chatId, `✅ Ihr Lieblingsgenre wurde auf "${newFavoriteGenre}" gesetzt.`)
                          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  }
              });
          });
      });
  } else if (action === 'delete_points') {
      // Punkte auf 0 setzen
      fs.readFile(USER_YML_PATH, 'utf8', (err, userData) => {
          if (err) {
              console.error(`Fehler beim Lesen der Datei ${USER_YML_PATH}: ${err}`);
              bot.sendMessage(chatId, 'Fehler beim Zurücksetzen der Punkte.')
                  .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
              return;
          }

          const users = load(userData);

          // Überprüfen, ob der Benutzer existiert
          if (users[chatId]) {
              users[chatId].commandCount = 0; // Setze die Punkte auf 0

              // Schreibe die aktualisierten Benutzerinformationen zurück in die Datei
              fs.writeFile(USER_YML_PATH, dump(users), 'utf8', (err) => {
                  if (err) {
                      console.error(`Fehler beim Schreiben in die Datei ${USER_YML_PATH}: ${err}`);
                      bot.sendMessage(chatId, 'Fehler beim Zurücksetzen der Punkte.')
                          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  } else {
                      bot.sendMessage(chatId, '✅ Ihre Punkte wurden erfolgreich auf 0 gesetzt.')
                          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  }
              });
          } else {
              bot.sendMessage(chatId, '❌ Benutzer nicht gefunden.')
                  .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
          }
      });
  } else if (action === 'reset_profile') {
      // Profil zurücksetzen
      fs.readFile(USER_YML_PATH, 'utf8', (err, userData) => {
          if (err) {
              console.error(`Fehler beim Lesen der Datei ${USER_YML_PATH}: ${err}`);
              bot.sendMessage(chatId, 'Fehler beim Zurücksetzen des Profils.')
                  .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
              return;
          }

          const users = load(userData);

          // Überprüfen, ob der Benutzer existiert
          if (users[chatId]) {
              // Setze die Standardwerte zurück
              users[chatId] = {
                  userId: chatId,
                  username: users[chatId].username, // Behalte den Benutzernamen bei
                  firstUsed: users[chatId].firstUsed, // Behalte das erste Nutzungsdatum bei
                  notifications: true, // Standardwert für Benachrichtigungen
                  commandCount: 0, // Punkte zurücksetzen
                  userLevel: 'Neuling', // Benutzerlevel zurücksetzen
                  favoriteGenre: 'Nicht festgelegt' // Setze das Lieblingsgenre auf den Standardwert
              };

              // Schreibe die aktualisierten Benutzerinformationen zurück in die Datei
              fs.writeFile(USER_YML_PATH, dump(users), 'utf8', (err) => {
                  if (err) {
                      console.error(`Fehler beim Schreiben in die Datei ${USER_YML_PATH}: ${err}`);
                      bot.sendMessage(chatId, 'Fehler beim Zurücksetzen des Profils.')
                          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  } else {
                      bot.sendMessage(chatId, '✅ Ihr Profil wurde erfolgreich zurückgesetzt.')
                          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  }
              });
          } else {
              bot.sendMessage(chatId, '❌ Benutzer nicht gefunden.')
                  .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
          }
      });
  } else if (action === 'delete_profile') {
    // Profil löschen
    fs.readFile(USER_YML_PATH, 'utf8', (err, userData) => {
        if (err) {
            console.error(`Fehler beim Lesen der Datei ${USER_YML_PATH}: ${err}`);
            bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
            return;
        }

        const users = load(userData);

        // Überprüfen, ob der Benutzer existiert
        if (users[chatId]) {
            // Benutzer aus user.yml entfernen
            delete users[chatId];

            // Schreibe die aktualisierten Benutzerinformationen zurück in die Datei
            fs.writeFile(USER_YML_PATH, dump(users), 'utf8', (err) => {
                if (err) {
                    console.error(`Fehler beim Schreiben in die Datei ${USER_YML_PATH}: ${err}`);
                    bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                        .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                    return;
                }

                // Lösche zugehörige Einträge in w_offen.json
                const wOffenFilePath = path.join(__dirname, 'w_offen.json'); // Pfad zur w_offen.json-Datei
                fs.readFile(wOffenFilePath, 'utf8', (err, wOffenData) => {
                    if (err) {
                        console.error(`Fehler beim Lesen der Datei ${wOffenFilePath}: ${err}`);
                        bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                            .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                        return;
                    }

                    const wOffen = load(wOffenData);
                    delete wOffen[chatId]; // Entferne den Benutzer aus w_offen.json

                    // Schreibe die aktualisierten Einträge zurück in die w_offen.json
                    fs.writeFile(wOffenFilePath, dump(wOffen), 'utf8', (err) => {
                        if (err) {
                            console.error(`Fehler beim Schreiben in die Datei ${wOffenFilePath}: ${err}`);
                            bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                                .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                            return;
                        }

                        // Lösche die Datei im Wunsch-Ordner
                        const wunschFolderPath = path.join(__dirname, 'wunsch');
                        const userFilePath = path.join(wunschFolderPath, `wishes_${chatId}.json`); // Stelle sicher, dass der Dateiname korrekt ist
                        fs.unlink(userFilePath, (err) => {
                            if (err && err.code !== 'ENOENT') { // ENOENT bedeutet, die Datei existiert nicht
                                console.error(`Fehler beim Löschen der Datei ${userFilePath}: ${err}`);
                                bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                                    .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                                return;
                            }

                            // Lösche den Benutzer aus subscribers.json
                            const subscribersFilePath = path.join(__dirname, 'subscribers.json');
                            fs.readFile(subscribersFilePath, 'utf8', (err, subscribersData) => {
                                if (err) {
                                    console.error(`Fehler beim Lesen der Datei ${subscribersFilePath}: ${err}`);
                                    bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                                        .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                                    return;
                                }

                                let subscribers;
                                try {
                                    subscribers = JSON.parse(subscribersData);
                                } catch (parseErr) {
                                    console.error(`Fehler beim Parsen der subscribers.json: ${parseErr}`);
                                    bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                                        .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                                    return;
                                }

                                // Entferne den Benutzer aus der Liste
                                const updatedSubscribers = subscribers.filter(subscriber => subscriber.chatId !== chatId);

                                // Schreibe die aktualisierten Abonnenten zurück in die Datei
                                fs.writeFile(subscribersFilePath, JSON.stringify(updatedSubscribers, null, 2), 'utf8', (err) => {
                                    if (err) {
                                        console.error(`Fehler beim Schreiben in die Datei ${subscribersFilePath}: ${err}`);
                                        bot.sendMessage(chatId, 'Fehler beim Löschen des Profils.')
                                            .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                                    } else {
                                        bot.sendMessage(chatId, '✅ Ihr Profil wurde erfolgreich gelöscht.')
                                            .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                                    }
                                });
                            });
                        });
                    });
                });
            });
        } else {
            bot.sendMessage(chatId, '❌ Benutzer nicht gefunden.')
                .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
        }
    });
}
});

const { load, dump } = require('js-yaml'); // Stelle sicher, dass js-yaml installiert ist

// Funktion zum Escapen von Markdown V2-Sonderzeichen
function escapeMarkdownV2(text) {
  return text.replace(/([_*[\]()~>#+\-=.])/g, '\\$1'); // Escape-Zeichen
}

// Funktion zum Formatieren des Datums in DD-MM-YYYY
function formatDate(dateString) {
  const [year, month, day] = dateString.split('-'); // Datum in Jahr, Monat, Tag zerlegen
  return `${day}-${month}-${year}`; // DD-MM-YYYY Format zurückgeben
}

// Funktion zum Bestimmen des Benutzerlevels
function getUserLevel(commandCount, wishCount) {
  let level = 'Neuling';

  // Kriterien für die Vergabe des Benutzerlevels
  if (commandCount > 50) {
    level = 'VIP Benutzer';
  } else if (commandCount > 20) {
    level = 'Erfahrener Benutzer';
  } else if (commandCount > 5 || wishCount > 1) {
    level = 'Aktiver Benutzer';
  }

  return level;
}

// Funktion zum Aktualisieren des Benutzerlevels
function updateUserLevel(chatId) {
  const userFilePath = path.join(__dirname, 'user.yml');

  // Benutzerinformationen aus user.yml lesen
  fs.readFile(userFilePath, 'utf8', (err, userData) => {
    if (err) {
      console.error(`Fehler beim Lesen der Datei ${userFilePath}: ${err}`);
      return;
    }

    const users = load(userData);
    const user = users[chatId];

    if (user) {
      // Benutzerlevel bestimmen
      const commandCount = user.commandCount || 0;
      const wishCount = user.wishCount || 0;
      user.userLevel = getUserLevel(commandCount, wishCount); // Benutzerlevel aktualisieren

      // Benutzerinformationen zurück in die Datei schreiben
      const updatedUserData = dump(users);
      fs.writeFile(userFilePath, updatedUserData, 'utf8', (err) => {
        if (err) {
          console.error(`Fehler beim Schreiben der Datei ${userFilePath}: ${err}`);
        }
      });
    }
  });
}

// Befehl zum Aktualisieren des Benutzerlevels bei jeder Nachricht
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userFilePath = path.join(__dirname, 'user.yml');

  // Hier kannst du die Anzahl der Befehle erhöhen
  fs.readFile(userFilePath, 'utf8', (err, userData) => {
    if (!err) {
      const users = load(userData);
      if (users[chatId]) {
        users[chatId].commandCount = (users[chatId].commandCount || 0) + 1;
        const updatedUserData = dump(users);
        fs.writeFile(userFilePath, updatedUserData, 'utf8', (err) => {
          if (err) {
            console.error(`Fehler beim Schreiben der Datei ${userFilePath}: ${err}`);
          } else {
            // Benutzerlevel aktualisieren, nachdem die Anzahl der Befehle erhöht wurde
            updateUserLevel(chatId);
          }
        });
      }
    }
  });
});

// Befehl zum Sichern der Dateien
bot.onText(/\/backup/, (msg) => {
  const chatId = msg.chat.id;

  // Überprüfen, ob die Nachricht vom Dev kommt
  if (msg.from.id.toString() === process.env.DEV_CHAT_ID) {
      const filesToBackup = [
          'user.yml',
          'faq.json',
          'subscribers.json',
          'w_offen.json',
          'feedback.log',
          'command_history.json',
          'dev_reports.json'
      ];
      const backupFolder = path.join(__dirname, 'wunsch'); // Pfad zum Wunsch-Ordner
      const zipFilePath = path.join(__dirname, 'backup.zip'); // Speicherort für die ZIP-Datei

      // Erstelle einen ZIP-Stream
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip');

      output.on('close', () => {
          console.log(`Backup abgeschlossen, ${archive.pointer()} total bytes.`);
          bot.sendDocument(chatId, zipFilePath, { caption: '📦 Hier ist dein Backup!' }) // Sende die ZIP-Datei an den Developer
              .then(() => {
                  fs.unlinkSync(zipFilePath); // Lösche die ZIP-Datei nach dem Senden
              })
              .catch(err => {
                  console.error(`Fehler beim Senden der Backup-Datei: ${err.message}`);
                  bot.sendMessage(chatId, `❌ Fehler beim Senden der Backup-Datei: ${err.message}`);
              });
      });

      archive.on('error', (err) => {
          console.error(`Fehler beim Erstellen des Backups: ${err}`);
          bot.sendMessage(chatId, `❌ Fehler beim Erstellen des Backups: ${err.message}`);
      });

      archive.pipe(output);

      // Füge die Dateien hinzu
      filesToBackup.forEach(file => {
          const filePath = path.join(__dirname, file);
          if (fs.existsSync(filePath)) {
              archive.file(filePath, { name: file });
          }
      });

      // Füge den Wunsch-Ordner hinzu, wenn er existiert
      if (fs.existsSync(backupFolder)) {
          archive.directory(backupFolder + '/', 'wunsch/'); // Füge den Inhalt des Wunsch-Ordners hinzu
      }

      archive.finalize(); // Beende die Archivierung
  } else {
      bot.sendMessage(chatId, '🚫 Dieser Befehl ist nur für den Developer verfügbar.');
  }
});

let debugMode = false;

bot.onText(/\/setdebug/, (msg) => {
    const chatId = msg.chat.id;
    if (msg.from.id !== parseInt(process.env.DEV_CHAT_ID)) {
        return bot.sendMessage(chatId, "🚫 Dieser Befehl ist nur für den Entwickler zugänglich.");
    }
    debugMode = !debugMode;
    const status = debugMode ? "aktiviert" : "deaktiviert";
    bot.sendMessage(chatId, `🐞 Debug-Modus wurde ${status}.`);
});

const os = require('os');

bot.onText(/\/serverinfo/, (msg) => {
    const chatId = msg.chat.id;
    if (msg.from.id !== parseInt(process.env.DEV_CHAT_ID)) {
        return bot.sendMessage(chatId, "🚫 Dieser Befehl ist nur für den Entwickler zugänglich.");
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    // Umrechnung in Gigabyte
    const totalMemoryGB = (totalMemory / (1024 ** 3)).toFixed(2); // Umrechnen in GB
    const freeMemoryGB = (freeMemory / (1024 ** 3)).toFixed(2); // Umrechnen in GB

    const info = `🖥️ *Server-Info:*\n\n\n` +
                 `🔹 Plattform: ${os.platform()}\n\n` +
                 `🔹 Architektur: ${os.arch()}\n\n` +
                 `🔹 Gesamter Speicher: ${totalMemoryGB} GB\n\n` +
                 `🔹 Freier Speicher: ${freeMemoryGB} GB`;

    bot.sendMessage(chatId, info);
});

bot.onText(/\/healthcheck/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id !== parseInt(process.env.DEV_CHAT_ID)) {
      return bot.sendMessage(chatId, "🚫 Dieser Befehl ist nur für den Entwickler zugänglich.");
  }

  let responseMessages = [];
  responseMessages.push("🖥️ *Bot-Status:*\n\n");

  // 1. Überprüfung, ob der Bot online ist
  responseMessages.push("✅ *Bot ist online und funktionsfähig.*\n");

  // 2. Überprüfung der Verbindung zur Plex API
  try {
      const plexResponse = await axios.get(`${process.env.PLEX_DOMAIN}/status`, {
          headers: {
              'X-Plex-Token': process.env.PLEX_TOKEN
          }
      });
      responseMessages.push("✅ *Verbindung zur Plex API ist erfolgreich.*\n\n\n");
  } catch (error) {
      responseMessages.push("❌ *Verbindung zur Plex API fehlgeschlagen.*\n\n\n");
  }

  // 3. Überprüfung, ob wichtige Dateien vorhanden sind
  responseMessages.push("📂 *Dateiüberprüfung:*\n\n");
  const requiredFiles = ['user.yml', 'faq.json', 'subscribers.json', 'dev_reports.json', 'w_offen.json', 'feedback.log', 'command_history.json', 'error.log', 'Cache/cache-series.json', 'Cache/cache.json', 'Log/message.log', 'wunsch', 'backups'];
  for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
          responseMessages.push(`✅ *Datei ${file} ist vorhanden.*\n`);
      } else {
          responseMessages.push(`❌ *Datei ${file} fehlt.*\n`);
      }
  }

  // Sende die gesammelten Antworten als Nachricht
  bot.sendMessage(chatId, responseMessages.join(''), { parse_mode: 'Markdown' });
});

const commandHistoryFilePath = './command_history.json'; // Pfad zur Datei
let commandHistory = [];


// Lade die Historie aus der Datei, falls vorhanden
if (fs.existsSync(commandHistoryFilePath)) {
  try {
      const data = fs.readFileSync(commandHistoryFilePath, 'utf8'); // Stelle sicher, dass die Datei als UTF-8 gelesen wird
      commandHistory = JSON.parse(data);
  } catch (error) {
      console.error("Fehler beim Laden der Kommando-Historie:", error.message);
      commandHistory = []; // Setze die Historie zurück, wenn ein Fehler auftritt
  }
}

// Funktion zum Protokollieren der Befehle
function logCommand(command, username) {
    const timestamp = new Date(); // Aktuelles Datum und Uhrzeit
    const formattedDate = timestamp.toLocaleString(); // Formatierung des Datums

    // Füge den Befehl zur Historie hinzu
    commandHistory.push(`${formattedDate} - @${username} - ${command}`);
    
    if (commandHistory.length > 30) {
        commandHistory.shift(); // Behalte nur die letzten 10 Befehle
    }

    // Speichere die Historie in der Datei
    fs.writeFileSync(commandHistoryFilePath, JSON.stringify(commandHistory, null, 2));

}

// Funktion zum Formatieren der Historie
function formatCommandHistory(history) {
  return history.map(entry => {
      const [date, time, username, command] = entry.split(' - ');
      return `${date} ${time} | ${username} | ${command}`;
  }).join('\n'); // Jeder Eintrag wird in eine neue Zeile geschrieben
}


bot.onText(/\/command_history/, (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id !== parseInt(process.env.DEV_CHAT_ID)) {
      return bot.sendMessage(chatId, "🚫 Dieser Befehl ist nur für den Entwickler zugänglich.");
  }

  if (commandHistory.length === 0) {
      return bot.sendMessage(chatId, "📜 Keine Befehle in der Historie gefunden.");
  }

  const historyMessage = `🗃️ Kommando-Historie:\n\n` +
      `Datum - Uhrzeit | Benutzername | Befehl\n` +
      `-----------------------------------------\n` +
      formatCommandHistory(commandHistory).replace(/,/g, ''); // Entferne Kommas und füge neue Zeilen hinzu
  
  bot.sendMessage(chatId, historyMessage);
});

// Beispiel für andere Befehle
bot.onText(/\/start/, (msg) => {
    logCommand('/update', msg.from.username);
    // Logik für den Update-Befehl...
});

bot.onText(/\/notification_on/, (msg) => {
  logCommand('/notification_on', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/notification_off/, (msg) => {
  logCommand('/notification_off', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/serien/, (msg) => {
  logCommand('/serien', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/latestmovie/, (msg) => {
  logCommand('/latestmovie', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/latest10movies/, (msg) => {
  logCommand('/latest10movies', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/top_rated/, (msg) => {
  logCommand('/top_rated', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/wunsch/, (msg) => {
  logCommand('/wunsch', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/trailer/, (msg) => {
  logCommand('/trailer', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/empfehlung/, (msg) => {
  logCommand('/empfehlung', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/newsletter/, (msg) => {
  logCommand('/newsletter', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/help/, (msg) => {
  logCommand('/help', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/profil/, (msg) => {
  logCommand('/profil', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/w_list/, (msg) => {
  logCommand('/w_list', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/dev/, (msg) => {
  logCommand('/dev', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/feedback/, (msg) => {
  logCommand('/feedback', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/faq/, (msg) => {
  logCommand('/faq', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/info/, (msg) => {
  logCommand('/info', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/bot/, (msg) => {
  logCommand('/bot', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/admin/, (msg) => {
  logCommand('/admin', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/open_wishes/, (msg) => {
  logCommand('/open_wishes', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/user/, (msg) => {
  logCommand('/user', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/update/, (msg) => {
  logCommand('/update', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/logs/, (msg) => {
  logCommand('/logs', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/logs_delete/, (msg) => {
  logCommand('/logs_delete', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/f_log/, (msg) => {
  logCommand('/f_log', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/add_faq/, (msg) => {
  logCommand('/add_faq', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/del_faq/, (msg) => {
  logCommand('/del_faq', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/command_history/, (msg) => {
  logCommand('/command_history', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/backup/, (msg) => {
  logCommand('/backup', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/serverinfo/, (msg) => {
  logCommand('/serverinfo', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/healthcheck/, (msg) => {
  logCommand('/healthcheck', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/setdebug/, (msg) => {
  logCommand('/setdebug', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/support/, (msg) => {
  logCommand('/support', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/night/, (msg) => {
  logCommand('/night', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/n_off/, (msg) => {
  logCommand('/n_off', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/passwd/, (msg) => {
  logCommand('/passwd', msg.from.username);
  // Logik für den Befehl...
});

bot.onText(/\/support/, (msg) => {
  const chatId = msg.chat.id;

  // Direkt die Telegram-ID verwenden
  const adminId = 5507179337;

  if (msg.from.id !== adminId) {
      return bot.sendMessage(chatId, "🚫 Dieser Befehl ist nur für Administratoren zugänglich.");
  }

  bot.sendMessage(chatId, "💬 Bitte gib zusätzliche Informationen für den Support an:");

  // Setze einen Listener für die nächste Nachricht des Admins
  bot.once('message', async (reply) => {
      const additionalText = reply.text || "Keine zusätzlichen Informationen bereitgestellt.";
      const filesToZip = [
          'error.log',
          'command_history.json',
          'user.yml',
          'subscribers.json',
      ];
      const logFolder = 'Log';

      const zipPath = 'support.zip';
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip');

      output.on('close', async () => {
          const botName = process.env.BOT_NAME || "Unbekannter Bot"; // Bot-Namen aus der .env
          const adminNames = `${process.env.USER1_ID}, ${process.env.USER2_ID}`; // Namen der Administratoren

          const supportMessage = `🛠️ *Externe Support-Anfrage* \n\n\n` +
              `🔧 Bot-Name: @${botName}\n\n` +
              `👨‍💻 Administratoren:\n ${adminNames}\n\n\n` +
              `💬 Zusätzliche Informationen:\n\n ${additionalText}`;

          await bot.sendMessage(adminId, supportMessage, { parse_mode: 'Markdown' });
          await bot.sendDocument(adminId, zipPath);
          fs.unlinkSync(zipPath); // Löscht die ZIP-Datei nach dem Senden
      });

      archive.on('error', (err) => {
          throw err;
      });

      archive.pipe(output);

      // Füge die Dateien zum ZIP-Archiv hinzu
      filesToZip.forEach((file) => {
          if (fs.existsSync(file)) {
              archive.file(file, { name: file });
          } else {
              console.warn(`Datei ${file} nicht gefunden.`);
          }
      });

      // Füge den Log-Ordner hinzu
      if (fs.existsSync(logFolder)) {
          archive.directory(logFolder + '/', logFolder + '/');
      }

      await archive.finalize();  // Warte, bis das Archiv abgeschlossen ist
  });
});

// Handler für den /admin-Befehl
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Prüfe, ob der Benutzer autorisiert ist
  if (userId.toString() === USER1_ID || userId.toString() === USER2_ID) {
    bot.sendMessage(chatId, 'Bitte gib die Nachricht ein, die du an alle Benutzer senden möchtest:', {
      reply_markup: {
        force_reply: true
      }
    }).then(() => {
      bot.once('message', async (msg) => {
        if (msg.chat.id === chatId && msg.text) {
          const messageText = msg.text;

          // Sende die Nachricht an alle Benutzer
          const users = yaml.load(USER_YML_PATH);
          const sendMessages = Object.keys(users).map(userChatId => {
            return bot.sendMessage(userChatId, `❗️Systemnachricht\n\n"${messageText}"`).catch(error => {
              logError(`Fehler beim Senden der Systemnachricht an chatId ${userChatId}: ${error.message}`);
            });
          }).filter(promise => promise !== undefined);

          await Promise.all(sendMessages);

          bot.sendMessage(chatId, 'Nachricht wurde an alle Benutzer gesendet.').catch(error => {
            logError(`Fehler beim Senden der Bestätigung an chatId ${chatId}: ${error.message}`);
          });
        }
      });
    }).catch(error => {
      logError(`Fehler beim Senden der Nachrichteneingabeaufforderung an chatId ${chatId}: ${error.message}`);
    });
  } else {
    bot.sendMessage(chatId, '❌ Du bist nicht autorisiert, diesen Befehl auszuführen.');
  }
});

// Pfad zur Cache-Datei
const CACHE_FILE_PATH = path.join('Cache', 'cache-series.json');

// Funktion zum Speichern des Caches in eine Datei
function saveSeriesCache(series) {
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(series, null, 2));
}

// Funktion zum Laden des Caches aus einer Datei
function loadSeriesCache() {
  if (fs.existsSync(CACHE_FILE_PATH)) {
    return JSON.parse(fs.readFileSync(CACHE_FILE_PATH));
  }
  return null;
}

// Funktion zum Abrufen aller Serien
async function fetchAllSeries() {
  try {
    const sectionsData = await fetchPlexData(PLEX_LIBRARY_URL);
    const sections = sectionsData.MediaContainer.Directory;

    let series = [];

    for (const section of sections) {
      const sectionUrl = `${PLEX_DOMAIN}/library/sections/${section.key}/all?X-Plex-Token=${PLEX_TOKEN}`;
      const sectionData = await fetchPlexData(sectionUrl);

      if (sectionData.MediaContainer && sectionData.MediaContainer.Metadata) {
        const metadata = sectionData.MediaContainer.Metadata;
        series = series.concat(metadata.filter(media => media.type === 'show'));
      }
    }

    series.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    return series;
  } catch (error) {
    logError(`Error fetching all series: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der Serien mit Caching
async function fetchSeriesWithCache() {
  const cachedSeries = loadSeriesCache();

  if (cachedSeries) {
    logMessage('Series fetched from cache');
    return cachedSeries;
  }

  try {
    const series = await fetchAllSeries();
    saveSeriesCache(series);
    logMessage('Series fetched from API and cached');
    return series;
  } catch (error) {
    logError(`Error fetching series: ${error.message}`);
    throw error;
  }
}

// Automatische Cache-Aktualisierung jede Stunde
schedule.scheduleJob('0 * * * *', async () => {
  try {
    const series = await fetchAllSeries();
    saveSeriesCache(series);
    logMessage('Series cache updated automatically');
  } catch (error) {
    logError(`Error updating series cache: ${error.message}`);
  }
});

// Handler für den /serien-Befehl
bot.onText(/\/serien/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const series = await fetchSeriesWithCache();
    const seriesList = series.map((s, index) => `${index + 1}. ${s.title}`).join('\n');

    bot.sendMessage(chatId, `Hier sind die Serien in deiner Plex-Mediathek:\n\n${seriesList}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Weitere Informationen', callback_data: 'get_series_info' }]
        ]
      }
    });
  } catch (error) {
    bot.sendMessage(chatId, 'Fehler beim Abrufen der Serien. Bitte versuche es später erneut.');
    logError(`Error handling /serien command: ${error.message}`);
  }
});

// Handler für die Callback-Abfragen von Inline-Buttons
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  if (query.data.startsWith('get_series_info')) {
    try {
      const series = await fetchSeriesWithCache();
      const responseMessage = `Bitte gib die Nummer der Serie ein, um weitere Informationen zu erhalten.`;

      bot.sendMessage(chatId, responseMessage, {
        reply_markup: {
          force_reply: true
        }
      }).then(() => {
        bot.once('message', async (msg) => {
          if (msg.chat.id === chatId && msg.text) {
            const seriesNumber = parseInt(msg.text, 10);
            if (!isNaN(seriesNumber) && seriesNumber > 0 && seriesNumber <= series.length) {
              const seriesInfo = series[seriesNumber - 1];
              const { title, summary, thumb, addedAt } = seriesInfo;
              const imageUrl = `https://plex.viper-918.myds.me${thumb}?X-Plex-Token=Pk5PySz_imbA3y24yDei`; // Beispiel-URL anpassen

              // Debugging-Ausgabe
              console.log(`Image URL: ${imageUrl}`);

              // Formatieren des Hinzufügungsdatums
              const addedDate = addedAt ? dayjs(addedAt * 1000).format('DD.MM.YYYY') : 'Unbekannt';

              const caption = `📺 *Titel:* ${title}\n\n` +
                              `📝 *Beschreibung:* \n${summary}\n\n` +
                              `📅 *Hinzugefügt am:* ${addedDate}`;

              // Bild herunterladen und lokal speichern
              const imagePath = path.join(__dirname, 'temp_image.jpg');
              const writer = fs.createWriteStream(imagePath);

              const response = await axios({
                url: imageUrl,
                method: 'GET',
                responseType: 'stream'
              });

              response.data.pipe(writer);

              writer.on('finish', async () => {
                // Senden des Bildes
                try {
                  await bot.sendPhoto(chatId, imagePath, { caption, parse_mode: 'Markdown' });
                  // Optional: Nach dem Senden das Bild löschen
                  fs.unlinkSync(imagePath);
                } catch (sendPhotoError) {
                  logError(`Fehler beim Senden des Fotos: ${sendPhotoError.message}`);
                  bot.sendMessage(chatId, 'Fehler beim Senden des Bildes. Bitte versuche es später erneut.');
                }
              });

              writer.on('error', (error) => {
                logError(`Fehler beim Schreiben der Bilddatei: ${error.message}`);
                bot.sendMessage(chatId, 'Fehler beim Abrufen des Bildes. Bitte versuche es später erneut.');
              });
            } else {
              bot.sendMessage(chatId, 'Ungültige Nummer. Bitte gib eine gültige Nummer ein.');
            }
          }
        });
      }).catch(error => {
        logError(`Fehler beim Senden der Eingabeaufforderung: ${error.message}`);
      });
    } catch (error) {
      bot.sendMessage(chatId, 'Fehler beim Abrufen der Serieninformationen. Bitte versuche es später erneut.');
      logError(`Error handling callback query: ${error.message}`);
    }
  }
});

// Log-Error-Funktion (Optional)
function logError(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync('error.log', `${timestamp} - ${message}\n`);
}
// Umgebungsvariable für die Chat-ID der Entwickler
const DEV_CHAT_ID = parseInt(process.env.DEV_CHAT_ID, 10);

// Der Pfad zur Datei, in der die Dev Reports gespeichert werden
const DEV_REPORTS_FILE_PATH = path.join(__dirname, 'dev_reports.json');

// Funktion zum Erstellen der Datei, wenn sie nicht vorhanden ist
function createDevReportsFile() {
    if (!fs.existsSync(DEV_REPORTS_FILE_PATH)) {
        fs.writeFileSync(DEV_REPORTS_FILE_PATH, JSON.stringify([])); // Leeres Array initialisieren
        console.log('Dev Reports Datei erstellt.');
    }
}

// Funktion zum Erstellen des Inline-Keyboards
function getDevOptionsKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💡 Funktionswunsch', callback_data: 'dev_request' }],
                [{ text: '🐞 Bug melden', callback_data: 'dev_bug' }]
            ]
        }
    };
}

// Handler für den /dev-Befehl
bot.onText(/\/dev/, (msg) => {
    const chatId = msg.chat.id;
    const message = '🔧 *Dev-Feedback* - Bitte wählen Sie eine der folgenden Optionen, um Ihr Feedback zu übermitteln:';

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...getDevOptionsKeyboard()
    });
});

// Handler für Callback-Queries im /dev-Befehl
bot.on('callback_query', (query) => {
    console.log('Callback-Query-Daten:', query.data); // Debugging-Ausgabe

    const chatId = query.message.chat.id;
    const data = query.data;

    let responseText = '';
    let replyMarkup;

    switch (data) {
        case 'dev_request':
            responseText = '✏️ *Bitte geben Sie Ihren Funktionswunsch ein:*';
            replyMarkup = {
                reply_markup: {
                    force_reply: true
                }
            };
            break;

        case 'dev_bug':
            responseText = '✏️ *Bitte beschreiben Sie den Bug, den Sie melden möchten:*';
            replyMarkup = {
                reply_markup: {
                    force_reply: true
                }
            };
            break;

        default:
            // Kein Popup oder Nachricht senden, wenn die Auswahl unbekannt ist
            return;
    }

    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown', ...replyMarkup });
});

// Handler für die Antworten auf die Feedback-Anfrage
bot.on('message', async (msg) => {
    if (msg.reply_to_message && (msg.reply_to_message.text.includes('Bitte geben Sie Ihren Funktionswunsch ein:') ||
                                 msg.reply_to_message.text.includes('Bitte beschreiben Sie den Bug, den Sie melden möchten:'))) {
        const chatId = msg.chat.id;
        const text = msg.text;
        const userName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '');
        const userId = msg.from.id;
        const messageType = msg.reply_to_message.text.includes('Funktionswunsch') ? 'Funktionswunsch' : 'Bug';

        const devMessage = {
            id: null, // ID wird später zugewiesen
            type: messageType,
            user: {
                name: userName,
                id: userId
            },
            message: text,
            timestamp: new Date().toISOString()
        };

        // Dev Report in die Datei schreiben
        try {
            console.log('Sende Nachricht an Entwickler-Chat-ID:', DEV_CHAT_ID); // Debugging-Ausgabe
            await bot.sendMessage(DEV_CHAT_ID, formatDevMessage(devMessage), { parse_mode: 'Markdown' });
            console.log('Nachricht erfolgreich gesendet.');

            // Dev Report in die JSON-Datei speichern
            saveDevReport(devMessage);

            bot.sendMessage(chatId, '✅ Ihre Nachricht wurde erfolgreich gesendet! Vielen Dank.');
        } catch (error) {
            console.error('Fehler beim Senden der Nachricht:', error);
            bot.sendMessage(chatId, '🚫 Etwas ist schiefgelaufen. Ihre Nachricht konnte nicht gesendet werden.');
        }
    }
});

// Funktion zur Formatierung der Dev-Nachricht
function formatDevMessage(report) {
    return `📩 *${report.type}*\n\n` +
           `von: ${report.user.name} (${report.user.id})\n\n` +
           `"${report.message}"`;
}

// Funktion zum Speichern des Dev Reports in die JSON-Datei
function saveDevReport(report) {
    const reports = JSON.parse(fs.readFileSync(DEV_REPORTS_FILE_PATH));
    report.id = reports.length; // ID basierend auf der aktuellen Länge des Arrays zuweisen
    reports.push(report);
    fs.writeFileSync(DEV_REPORTS_FILE_PATH, JSON.stringify(reports, null, 2)); // Schön formatieren
}

// Starte den Bot und erstelle die Datei
createDevReportsFile();

// Handler für den /bot-Befehl
bot.onText(/\/bot/, (msg) => {
  const chatId = msg.chat.id;

  try {
    // Bot-Version dynamisch aus der .env-Datei
    const botVersion = process.env.BOT_VERSION || "1.7.0";

    // Laufzeit des Prozesses in Sekunden
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const runtime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Benutzeranzahl aus user.yml
    const users = yaml.load(USER_YML_PATH);
    const userCount = Object.keys(users).length;

    // Abonnentenanzahl aus subscribers.json
    const subscribers = JSON.parse(fs.readFileSync('subscribers.json', 'utf8'));
    const subscriberCount = subscribers.length;

    // Letzter Neustart des Bots
    const lastRestart = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // Speicherbelegung
    const memoryUsage = process.memoryUsage();
    const memoryStats = `Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB, Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`;

    // Cache-Status
    const cacheKeys = cache.keys().length;
    const cacheStats = cache.getStats(); // Hole die vollständigen Cache-Stats
    const cacheTTL = cacheStats.stdTTL || 0; // Setze Default-Wert auf 0, falls nicht definiert

    // Fehlerprotokoll-Status
    const errorLogCount = fs.existsSync(ERROR_LOG_PATH) ? fs.readFileSync(ERROR_LOG_PATH, 'utf8').split('\n').length - 1 : 0;

    // Aktuelle Aufgaben
    const currentTasks = `
- Cache wird jede Stunde aktualisiert \n
- Geplante Überprüfungen neuer Filme alle 1 Minute \n
- Newsletter Versand jeden Sonntag \n
    `;

    // Bot Token und Webhook URL (falls vorhanden)
    const botToken = BOT_TOKEN;
    const webhookStatus = WEBHOOK_URL ? "Aktiv" : "Inaktiv";

    // Nachricht erstellen
    const infoMessage = `
📊 *Bot Informationen* \n\n

🆙 *Version:* ${botVersion} \n
⏱️ *Laufzeit:* ${runtime} \n
👥 *Benutzeranzahl:* ${userCount} \n
📰 *Abonnentenanzahl:* ${subscriberCount} \n
🔄 *Letzter Neustart:* ${lastRestart} \n
💾 *Speicherbelegung:* ${memoryStats} \n
🔑 *Bot Token:* ${botToken.slice(0, 0)}... (Ausgeblendet für Sicherheit) \n
🌐 *Webhook URL:* ${webhookStatus} \n
🔑 *Cache Keys:* ${cacheKeys} \n
⏳ *Cache TTL:* ${cacheTTL} Sekunden \n
📝 *Fehlerprotokoll-Anzahl:* ${errorLogCount} \n\n

🛠️ *Aktuelle Aufgaben:* \n
${currentTasks.trim()}
`;

    // Inline-Button erstellen
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Kontakt",
              url: process.env.CONTACT_LINK // Link aus der .env-Datei
            }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };

    // Nachricht senden
    bot.sendMessage(chatId, infoMessage, options).catch(error => {
      logError(`Fehler beim Senden der Bot-Informationen an chatId ${chatId}: ${error.message}`);
    });

  } catch (error) {
    // Fehlerprotokollierung für unerwartete Fehler
    logError(`Fehler beim Abrufen von Bot-Informationen: ${error.message}`);
    bot.sendMessage(chatId, 'Fehler beim Abrufen der Bot-Informationen.').catch(err => {
      logError(`Fehler beim Senden der Fehlermeldung an chatId ${chatId}: ${err.message}`);
    });
  }
});

// Handler für den /logs-Befehl
bot.onText(/\/logs(?: (\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === USER1_ID || userId.toString() === USER2_ID) {
    const count = match[1] ? parseInt(match[1], 10) : 10;
    const recentErrors = getRecentErrors(count).join('\n');
    const message = recentErrors.length > 0 ? `Fehlermeldungen:\n${recentErrors}` : 'Keine Fehlermeldungen vorhanden.';
    bot.sendMessage(chatId, message).catch(error => {
      logError(`Fehler beim Senden der Logs an chatId ${chatId}: ${error.message}`);
    });
  } else {
    bot.sendMessage(chatId, '❌ Du bist nicht autorisiert, diesen Befehl auszuführen.');
  }
});

// Definiere den Pfad zur feedback.yml
const FEEDBACK_FILE_PATH = path.resolve(__dirname, 'Log', 'feedback.yml');

// Handler für den /log_delete-Befehl
bot.onText(/\/log_delete/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === USER1_ID || userId.toString() === USER2_ID) {
    const inlineKeyboard = [
      [{ text: 'Error Log Löschen', callback_data: 'delete_error_log' }],
      [{ text: 'User Log Löschen', callback_data: 'delete_user_log' }],
      [{ text: 'Feedback Log Löschen', callback_data: 'delete_feedback_log' }] // Neuer Button
    ];

    bot.sendMessage(chatId, 'Wähle, welches Log du löschen möchtest:', {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    }).catch(error => {
      logError(`Fehler beim Senden der Log-Lösch-Nachricht an chatId ${chatId}: ${error.message}`);
    });
  } else {
    bot.sendMessage(chatId, '❌ Du bist nicht autorisiert, diesen Befehl auszuführen.');
  }
});

// Handler für Inline-Button-Callbacks
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  if (data === 'delete_error_log') {
    // Lösche das gesamte Error Log
    if (fs.existsSync(ERROR_LOG_PATH)) {
      fs.unlinkSync(ERROR_LOG_PATH); // Lösche die Error Log Datei komplett
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Error Log wurde gelöscht.' });
      bot.sendMessage(chatId, 'Das Error Log wurde erfolgreich gelöscht.').catch(error => {
        logError(`Fehler beim Senden der Bestätigung für das Löschen des Error Logs an chatId ${chatId}: ${error.message}`);
      });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Error Log existiert nicht.' });
    }
  } else if (data === 'delete_user_log') {
    // Lösche alle User Logs im LOG_DIR
    try {
      const files = fs.readdirSync(LOG_DIR);
      const userLogFiles = files.filter(file => /^\d{4}-\d{2}-\d{2}\.log$/.test(file));

      if (userLogFiles.length > 0) {
        userLogFiles.forEach(file => fs.unlinkSync(path.join(LOG_DIR, file))); // Lösche jede User Log Datei
        bot.answerCallbackQuery(callbackQuery.id, { text: 'User Logs wurden gelöscht.' });
        bot.sendMessage(chatId, 'Alle User Logs wurden erfolgreich gelöscht.').catch(error => {
          logError(`Fehler beim Senden der Bestätigung für das Löschen der User Logs an chatId ${chatId}: ${error.message}`);
        });
      } else {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Keine User Logs zum Löschen gefunden.' });
      }
    } catch (error) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Fehler beim Löschen der User Logs.' });
      logError(`Fehler beim Löschen der User Logs: ${error.message}`);
    }
  } else if (data === 'delete_feedback_log') {
    // Lösche die Feedback-Datei
    if (fs.existsSync(FEEDBACK_FILE_PATH)) {
      fs.unlinkSync(FEEDBACK_FILE_PATH); // Lösche die Feedback-Datei komplett
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Feedback Log wurde gelöscht.' });
      bot.sendMessage(chatId, 'Das Feedback Log wurde erfolgreich gelöscht.').catch(error => {
        logError(`Fehler beim Senden der Bestätigung für das Löschen des Feedback Logs an chatId ${chatId}: ${error.message}`);
      });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Feedback Log existiert nicht.' });
    }
  } else {
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Unbekannte Auswahl.' });
  }
});

// Handler für den /user-Befehl
bot.onText(/\/user/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Überprüfen, ob der Benutzer autorisiert ist
  if (userId.toString() === USER1_ID || userId.toString() === USER2_ID) {
    try {
      // Lade die Benutzer aus der YAML-Datei
      const users = yaml.load(USER_YML_PATH);
      let responseMessage = "Benutzerinformationen:\n\n";

      // Gehe durch die Benutzer und baue die Antwortnachricht auf
      for (const [id, user] of Object.entries(users)) {
        const name = user.username || 'Unbekannt';
        const notificationsStatus = user.notifications ? 'Aktiv' : 'Inaktiv';
        responseMessage += `Name: ${name}\nID: ${id}\nBenachrichtigung Status: ${notificationsStatus}\n\n`; // Zwei Leerzeilen für Abstand
      }

      // Sende die Antwortnachricht
      bot.sendMessage(chatId, responseMessage.trim()).catch(error => {
        logError(`Fehler beim Senden der Benutzerinformationen an chatId ${chatId}: ${error.message}`);
      });
    } catch (error) {
      // Fehlerprotokollierung für unerwartete Fehler
      logError(`Fehler beim Abrufen der Benutzerinformationen: ${error.message}`);
      bot.sendMessage(chatId, 'Fehler beim Abrufen der Benutzerinformationen.').catch(err => {
        logError(`Fehler beim Senden der Fehlermeldung an chatId ${chatId}: ${err.message}`);
      });
    }
  } else {
    bot.sendMessage(chatId, '❌ Du bist nicht autorisiert, diesen Befehl auszuführen.');
  }
});

// Maximale Länge einer Telegram-Nachricht in Zeichen
const MAX_MESSAGE_LENGTH = 4096;

// Hilfsfunktion zum Aufteilen einer Nachricht in kleinere Teile
function splitMessage(message) {
  const messages = [];
  while (message.length > MAX_MESSAGE_LENGTH) {
    let splitIndex = message.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitIndex === -1) {
      splitIndex = MAX_MESSAGE_LENGTH; // Wenn kein neuer Zeilenumbruch gefunden wird, einfach am Limit aufteilen
    }
    messages.push(message.substring(0, splitIndex));
    message = message.substring(splitIndex);
  }
  if (message.length > 0) {
    messages.push(message);
  }
  return messages;
}

// Handler für den /top_rated-Befehl
bot.onText(/\/top_rated/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const movies = await fetchTopRatedMovies();
    if (movies.length > 0) {
      // Begrenze die Anzahl der angezeigten Filme auf 20
      const topMovies = movies.slice(0, 15);
      
      let message = '🌟 *Top 15 Am besten bewertete Filme:*\n\n';
      topMovies.forEach((movie, index) => {
        message += `🎬 *${index + 1}. ${movie.title}* \n` +
                   `⭐ Bewertung: ${movie.rating.toFixed(1)} \n\n`;
      });

      // Teile die Nachricht in kleinere Teile auf, wenn sie zu lang ist
      const messageParts = splitMessage(message);

      for (const part of messageParts) {
        await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' });
      }
    } else {
      await bot.sendMessage(chatId, '🚫 Keine gut bewerteten Filme gefunden.');
    }
  } catch (error) {
    logError(`Fehler beim Abrufen der besten Filme für chatId ${chatId}: ${error.message}`);
    await bot.sendMessage(chatId, 'Beim Abrufen der besten Filme ist ein Fehler aufgetreten.');
  }
});

// Handler für Inline-Button-Callbacks
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  if (data.startsWith('delete_log_')) {
    const index = parseInt(data.split('_')[2], 10);
    const recentErrors = getRecentErrors();

    if (index >= 0 && index < recentErrors.length) {
      recentErrors.splice(index, 1); // Lösche den ausgewählten Eintrag

      fs.writeFileSync(ERROR_LOG_PATH, recentErrors.join('\n'), 'utf8');
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Fehlermeldung gelöscht.' });
      bot.sendMessage(chatId, 'Die Fehlermeldung wurde gelöscht.').catch(error => {
        logError(`Fehler beim Senden der Bestätigungsnachricht über das Löschen der Fehlermeldung an chatId ${chatId}: ${error.message}`);
      });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Ungültiger Index.' });
    }
  }
});

// Funktion zum Abrufen der letzten Fehlermeldungen
function getRecentErrors(count = 10) {
  if (!fs.existsSync(ERROR_LOG_PATH)) return [];

  const logLines = fs.readFileSync(ERROR_LOG_PATH, 'utf8').trim().split('\n');
  return logLines.slice(-count);
}

// Funktion zum Protokollieren von Fehlern
function logError(error) {
  const errorMessage = `${dayjs().format('HH:mm:ss')} - Error: ${error}\n`;
  fs.appendFileSync(ERROR_LOG_PATH, errorMessage);
}

// /start-Befehl verarbeiten
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || 'Unbekannt'; // Benutzername, falls vorhanden, sonst 'Unbekannt'

  // Aktuelles Datum im ISO-Format
  const firstUsedDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

  // Benutzerdaten in user.yml speichern
  let users = yaml.load(USER_YML_PATH);
  users[chatId] = { 
      userId: userId, 
      username: username, 
      notifications: true, // Standardmäßig Benachrichtigungen aktiviert
      firstUsed: firstUsedDate, // Datum des ersten Gebrauchs
      favoriteGenre: "Nicht festgelegt" // Standardwert für das Lieblingsgenre
  };
  fs.writeFileSync(USER_YML_PATH, yaml.stringify(users, 4));

  // Bot-Start-Nachricht
  const welcomeMessage = `👋 Willkommen ${username}!
Dein Zugang zum Bot wurde erfolgreich eingerichtet. ✅

Um die verfügbaren Befehle anzuzeigen, tippe 👉 /help.

🔔 Hinweis: Benachrichtigungen über neue Filme sind standardmäßig aktiviert. 
Um sie zu deaktivieren, tippe 👉 /notification_off.

👤 Möchtest du dein Profil sehen? Tippe 👉 /profil.`;

  // Inline-Button zu einer Webadresse
  const options = {
      reply_markup: {
          inline_keyboard: [
              [
                  {
                      text: 'zur Web Oberfläche',
                      url: 'https://plex.viper.ipv64.net/'
                  }
              ]
          ]
      }
  };

  bot.sendMessage(chatId, welcomeMessage, options);

  // /start-Befehl protokollieren
  logMessage(`Received /start command from chatId ${chatId} (userId ${userId}, username ${username})`);
});


// /notification-on-Befehl verarbeiten
bot.onText(/\/notification_on/, (msg) => {
  const chatId = msg.chat.id;
  
  // Benutzerdaten in user.yml laden
  let users = yaml.load(USER_YML_PATH);
  if (users[chatId]) {
    users[chatId].notifications = true;
    fs.writeFileSync(USER_YML_PATH, yaml.stringify(users, 4));
    bot.sendMessage(chatId, 'Benachrichtigungen wurden aktiviert.');
  } else {
    bot.sendMessage(chatId, 'Du musst den Bot zuerst mit /start aktivieren.');
  }
});

// /notification-off-Befehl verarbeiten
bot.onText(/\/notification_off/, (msg) => {
  const chatId = msg.chat.id;
  
  // Benutzerdaten in user.yml laden
  let users = yaml.load(USER_YML_PATH);
  if (users[chatId]) {
    users[chatId].notifications = false;
    fs.writeFileSync(USER_YML_PATH, yaml.stringify(users, 4));
    bot.sendMessage(chatId, 'Benachrichtigungen wurden deaktiviert.');
  } else {
    bot.sendMessage(chatId, 'Du musst den Bot zuerst mit /start aktivieren.');
  }
});

// /update Befehl
bot.onText(/\/update/, async (msg) => {
  const chatId = msg.chat.id;

  // Überprüfen, ob der Benutzer berechtigt ist
  if (chatId.toString() !== process.env.DEV_CHAT_ID) {
      bot.sendMessage(chatId, '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.');
      return;
  }

  try {
      // Benutzer.yml laden
      const userYmlData = yaml.load(USER_YML_PATH);

      // Aktuelles Datum im Format 'YYYY-MM-DD'
      const currentDate = dayjs().format('YYYY-MM-DD');

      // Durchlaufe alle Benutzer und aktualisiere das Datum, falls es fehlt
      for (const userId in userYmlData) {
          if (!userYmlData[userId].firstUsed) {
              userYmlData[userId].firstUsed = currentDate; // Setze das aktuelle Datum
          }

          // Überprüfen, ob das Feld favoriteGenre existiert
          if (!userYmlData[userId].favoriteGenre) {
              userYmlData[userId].favoriteGenre = "Nicht festgelegt"; // Setze Standardwert, wenn das Genre fehlt
          }
      }

      // Benutzer.yml speichern
      fs.writeFileSync(USER_YML_PATH, yaml.stringify(userYmlData, 4));
      bot.sendMessage(chatId, '✅ Die user.yml wurde erfolgreich aktualisiert.');
  } catch (error) {
      logError(`Fehler beim Aktualisieren der user.yml: ${error.message}`);
      bot.sendMessage(chatId, `❌ Fehler beim Aktualisieren der user.yml: ${error.message}`);
  }
});

let lastAddedMovieTime = null; // Variable zum Speichern des Zeitpunkts des letzten Films

// Funktion zum Abrufen der letzten hinzugefügten Filme
async function fetchLatestMovies() {
  try {
    const response = await axios.get(`${PLEX_DOMAIN}/library/recentlyAdded?X-Plex-Token=${PLEX_TOKEN}`);
    const movies = response.data.MediaContainer.Metadata;

    if (movies && movies.length > 0) {
      return movies;
    }

    return [];
  } catch (error) {
    console.error(`Error fetching latest movies: ${error.message}`);
    return [];
  }
}

// Funktion zum Überprüfen und Benachrichtigen über neue Filme
async function checkForNewMovies() {
  try {
    const movies = await fetchLatest10Movies();  // Verwende fetchLatest10Movies, um die letzten 10 Filme zu erhalten

    if (movies.length > 0) {
      const latestMovie = movies[0];

      if (!lastAddedMovieTime || dayjs.unix(latestMovie.addedAt).isAfter(lastAddedMovieTime)) {
        // Neuer Film wurde hinzugefügt und ist neuer als der zuletzt gesendete Film
        lastAddedMovieTime = dayjs.unix(latestMovie.addedAt); // Update the last added movie time

        const movieTitle = latestMovie.title || 'Unbekannt';
        const movieSummary = latestMovie.summary || 'Keine Zusammenfassung verfügbar';
        const movieThumb = latestMovie.thumb ? `${PLEX_DOMAIN}${latestMovie.thumb}?X-Plex-Token=${PLEX_TOKEN}` : '';

        // Kürze die Zusammenfassung, wenn sie zu lang ist
        const maxSummaryLength = 200; // Maximale Länge der Zusammenfassung
        const truncatedSummary = movieSummary.length > maxSummaryLength 
          ? `${movieSummary.substring(0, maxSummaryLength)}...` 
          : movieSummary;

        const message = `Ein neuer Film wurde hinzugefügt:\n\nTitel: ${movieTitle}\n\nZusammenfassung:\n${truncatedSummary}`;

        const users = yaml.load(USER_YML_PATH);
        const sendMessages = Object.keys(users).map(chatId => {
          if (users[chatId].notifications) {
            if (movieThumb) {
              // Wenn ein Bild vorhanden ist, sende es mit der Nachricht
              return bot.sendPhoto(chatId, movieThumb, { caption: message }).catch(error => {
                console.error(`Error sending photo to chatId ${chatId}: ${error.message}`);
              });
            } else {
              // Wenn kein Bild vorhanden ist, sende nur die Nachricht
              return bot.sendMessage(chatId, message).catch(error => {
                console.error(`Error sending message to chatId ${chatId}: ${error.message}`);
              });
            }
          }
        }).filter(promise => promise !== undefined);

        await Promise.all(sendMessages);
        console.log(`Sent new movie message to all users`);

        // Speichern der letzten gesendeten Zeit in einer Datei, um Wiederholungen zu vermeiden
        fs.writeFileSync('lastAddedMovieTime.json', JSON.stringify({ time: lastAddedMovieTime.unix() }));
      }
    }
  } catch (error) {
    logError(`Error checking for new movies: ${error.message}`);
  }
}

// Lade den letzten gesendeten Film-Zeitstempel beim Start des Bots
if (fs.existsSync('lastAddedMovieTime.json')) {
  const lastAddedMovieData = JSON.parse(fs.readFileSync('lastAddedMovieTime.json'));
  lastAddedMovieTime = dayjs.unix(lastAddedMovieData.time);
}

// Plane die kontinuierliche Überprüfung alle 1 Minute
schedule.scheduleJob('*/1 * * * *', checkForNewMovies);

// Initiale Überprüfung beim Start
checkForNewMovies();

// /latestmovie-Befehl verarbeiten
bot.onText(/\/latestmovie/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const movies = await fetchAllMovies();
    const sortedMovies = movies
      .filter(movie => movie.addedAt)
      .sort((a, b) => b.addedAt - a.addedAt);

    const latestMovie = sortedMovies[0];
    if (latestMovie) {
      const movieTitle = latestMovie.title || 'Unbekannt';
      const movieSummary = latestMovie.summary || 'Keine Zusammenfassung verfügbar';
      const addedAtDate = new Date((latestMovie.addedAt || 0) * 1000).toLocaleString(); // Konvertierung von Unix-Zeitstempel in lesbares Datum
      const movieThumb = latestMovie.thumb ? `${PLEX_DOMAIN}${latestMovie.thumb}?X-Plex-Token=${PLEX_TOKEN}` : '';

      // Trailer-URL abrufen
      const trailerUrl = await fetchTrailerUrl(latestMovie); // Funktion zum Abrufen des Trailer-Links

      const message = `Der zuletzt hinzugefügte Film ist:\n\nTitel: ${movieTitle}\n\nZusammenfassung: \n${movieSummary}\n\nHinzugefügt am: ${addedAtDate}`;
      
      // Erstelle den Inline-Button für den Trailer
      const replyMarkup = {
        inline_keyboard: [
          [{ text: "Trailer ansehen", url: trailerUrl || '#' }] // Fallback-URL falls kein Trailer vorhanden
        ]
      };

      // Bild anzeigen, wenn vorhanden
      if (movieThumb) {
        bot.sendPhoto(chatId, movieThumb, { caption: message, reply_markup: replyMarkup }).catch(error => {
          logError(`Error sending photo to chatId ${chatId}: ${error.message}`);
        });
      } else {
        bot.sendMessage(chatId, message, { reply_markup: replyMarkup }).catch(error => {
          logError(`Error sending message to chatId ${chatId}: ${error.message}`);
        });
      }
      
      logMessage(`Sent latest movie info to chatId ${chatId}`);
    } else {
      bot.sendMessage(chatId, 'Keine Filme gefunden.').catch(error => {
        logError(`Error sending no movies message to chatId ${chatId}: ${error.message}`);
      });
      logMessage(`No movies found for chatId ${chatId}`);
    }
  } catch (error) {
    if (error.response) {
      bot.sendMessage(chatId, `Fehler beim Abrufen der neuesten Filme. Statuscode: ${error.response.status}`).catch(err => {
        logError(`Error sending error message to chatId ${chatId}: ${err.message}`);
      });
      logError(`Error fetching latest movie: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      bot.sendMessage(chatId, 'Fehler beim Abrufen der neuesten Filme. Keine Antwort vom Server.').catch(err => {
        logError(`Error sending no response message to chatId ${chatId}: ${err.message}`);
      });
      logError(`Error fetching latest movie: No response from server`);
    } else {
      logError(`Error fetching latest movie: ${error.message}`);
    }
  }
});

// /info-Befehl verarbeiten
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const plexDomain = PLEX_DOMAIN;

  try {
    // Überprüfe den Serverstatus
    const serverStatus = await checkServerStatus();
    const {
      movieCount,
      showCount,
      episodeCount,
      seasonCount,
      topGenre,
      totalSize,
      oldestMovie,
      newestMovie
    } = await fetchAllMedia();

    // Serverstatus Text
    const serverStatusText = serverStatus
      ? '🟢 Server Status: Online'
      : '🔴 Server Status: Offline';

    const message = `${serverStatusText}\n\n` +
                    `*In der Bibliothek befinden sich derzeit:*\n\n` +
                    `📽️ Filme: ${movieCount}\n\n` +
                    `📺 Serien: ${showCount}\n\n` +
                    `🎞️ Episoden: ${episodeCount}\n\n` +
                    `📚 Staffeln: ${seasonCount}\n\n\n` +
                    `📊 Top-Genre: ${topGenre}\n\n` +
                    `💾 Gesamtgröße-Filme: ${totalSize}\n\n` +
                    `💾 Gesamtgröße-Serien: 1.70TB\n\n\n` +
                    `⏳ Ältester Film: ${oldestMovie.title} (${oldestMovie.year})\n\n` +
                    `🆕 Neuester Film: ${newestMovie.title} (${newestMovie.year})\n\n\n` +
                    `© 2024 M_Viper`;

                    

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: 'Zu Plex gehen', url: plexDomain }]
        ]
      })
    };

    await bot.sendMessage(chatId, message, options).catch(error => {
      logError(`Error sending message to chatId ${chatId}: ${error.message}`);
    });

    // Ursprüngliche Nachricht löschen (den /info-Befehl)
    await bot.deleteMessage(chatId, messageId).catch(error => {
      logError(`Error deleting message from chatId ${chatId}: ${error.message}`);
    });

    logMessage(`Sent detailed media info, copyright, and Plex button to chatId ${chatId}`);
  } catch (error) {
    logError(`Error fetching media info: ${error.message}`);
    await bot.sendMessage(chatId, 'Fehler beim Abrufen der Medieninformationen.').catch(err => {
      logError(`Error sending media info error message to chatId ${chatId}: ${err.message}`);
    });
  }
});

// Funktion zum Überprüfen des Serverstatus
async function checkServerStatus() {
  try {
    const response = await axios.get(`${PLEX_DOMAIN}/status`, {
      headers: { 'X-Plex-Token': PLEX_TOKEN }
    });
    return response.status === 200; // Server ist online, wenn Status 200 zurückgegeben wird
  } catch (error) {
    console.error(`Server is offline or unreachable: ${error.message}`);
    return false; // Server ist offline oder nicht erreichbar
  }
}

// Funktion zum Abrufen von Plex-Daten
async function fetchPlexData(url) {
  try {
    const response = await axios.get(url, {
      headers: { 'X-Plex-Token': PLEX_TOKEN }
    });
    return response.data;
  } catch (error) {
    logError(`Error fetching Plex data from ${url}: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der erweiterten Medieninformationen
async function fetchAllMedia() {
  try {
    const movies = await fetchAllMovies();
    const shows = await fetchAllShows();

    const episodeCount = shows.reduce((sum, show) => sum + (show.leafCount || 0), 0);
    const seasonCount = shows.reduce((sum, show) => sum + (show.childCount || 0), 0);

    const topGenre = findTopGenre(movies.concat(shows));
    const totalSize = await calculateTotalSize(movies.concat(shows));
    const oldestMovie = findOldestMedia(movies);
    const newestMovie = findNewestMedia(movies);

    return {
      movieCount: movies.length,
      showCount: shows.length,
      episodeCount: episodeCount,
      seasonCount: seasonCount,
      topGenre: topGenre,
      totalSize: totalSize,
      oldestMovie: oldestMovie,
      newestMovie: newestMovie
    };
  } catch (error) {
    logError(`Error fetching all media: ${error.message}`);
    throw error;
  }
}

// Funktion zur Ermittlung des am häufigsten vorkommenden Genres
function findTopGenre(mediaArray) {
  const genreCount = {};

  mediaArray.forEach(media => {
    if (media.Genre) {
      media.Genre.forEach(genre => {
        genreCount[genre.tag] = (genreCount[genre.tag] || 0) + 1;
      });
    }
  });

  return Object.keys(genreCount).reduce((a, b) => genreCount[a] > genreCount[b] ? a : b, '');
}

// Funktion zur Berechnung der Gesamtgröße der Mediendateien
async function calculateTotalSize(mediaArray) {
  let totalSizeBytes = 0;

  for (const media of mediaArray) {
    if (media.Media && media.Media.length > 0) {
      media.Media.forEach(mediaItem => {
        if (mediaItem.Part && mediaItem.Part.length > 0) {
          mediaItem.Part.forEach(part => {
            if (part.size) {
              const sizeInBytes = parseInt(part.size, 10);
              totalSizeBytes += sizeInBytes;
            }
          });
        }
      });
    }
  }

  // Log total size in bytes for debugging
  console.log(`Total size in bytes: ${totalSizeBytes}`);

  // Convert bytes to terabytes (TB) and gigabytes (GB)
  const totalSizeTB = totalSizeBytes / (1024 * 1024 * 1024 * 1024);
  const totalSizeGB = totalSizeBytes / (1024 * 1024 * 1024);

  // Log sizes in GB and TB
  console.log(`Total size in TB: ${totalSizeTB}`);
  console.log(`Total size in GB: ${totalSizeGB}`);

  // Determine the appropriate size unit to display
  if (totalSizeTB >= 1) {
    return `${totalSizeTB.toFixed(2)} TB`;
  } else {
    return `${totalSizeGB.toFixed(2)} GB`;
  }
}

// Funktion zum Finden des ältesten Mediums
function findOldestMedia(mediaArray) {
  return mediaArray.reduce((oldest, media) => {
    if (!oldest || (media.year && media.year < oldest.year)) {
      return media;
    }
    return oldest;
  }, null);
}

// Funktion zum Finden des neuesten Mediums
function findNewestMedia(mediaArray) {
  return mediaArray.reduce((newest, media) => {
    if (!newest || (media.year && media.year > newest.year)) {
      return media;
    }
    return newest;
  }, null);
}

// Funktion zum Abrufen aller Filme
async function fetchAllMovies() {
  try {
    const sectionsData = await fetchPlexData(`${PLEX_DOMAIN}/library/sections?X-Plex-Token=${PLEX_TOKEN}`);
    const sections = sectionsData.MediaContainer.Directory;

    let movies = [];

    for (const section of sections) {
      const sectionUrl = `${PLEX_DOMAIN}/library/sections/${section.key}/all?X-Plex-Token=${PLEX_TOKEN}`;
      const sectionData = await fetchPlexData(sectionUrl);

      if (sectionData.MediaContainer && sectionData.MediaContainer.Metadata) {
        const metadata = sectionData.MediaContainer.Metadata;
        movies = movies.concat(metadata.filter(media => media.type === 'movie'));
      }
    }

    return movies;
  } catch (error) {
    logError(`Error fetching all movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen aller Serien
async function fetchAllShows() {
  try {
    const sectionsData = await fetchPlexData(`${PLEX_DOMAIN}/library/sections?X-Plex-Token=${PLEX_TOKEN}`);
    const sections = sectionsData.MediaContainer.Directory;

    let shows = [];

    for (const section of sections) {
      const sectionUrl = `${PLEX_DOMAIN}/library/sections/${section.key}/all?X-Plex-Token=${PLEX_TOKEN}`;
      const sectionData = await fetchPlexData(sectionUrl);

      if (sectionData.MediaContainer && sectionData.MediaContainer.Metadata) {
        const metadata = sectionData.MediaContainer.Metadata;
        shows = shows.concat(metadata.filter(media => media.type === 'show'));
      }
    }

    return shows;
  } catch (error) {
    logError(`Error fetching all shows: ${error.message}`);
    throw error;
  }
}

// Fehlerprotokollierung
function logError(message) {
  fs.appendFile(path.join(__dirname, 'Log', 'error.log'), `${new Date().toISOString()} - ${message}\n`, err => {
    if (err) {
      console.error(`Failed to log error: ${err.message}`);
    }
  });
}

// Erfolgsprotokollierung
function logMessage(message) {
  fs.appendFile(path.join(__dirname, 'Log', 'message.log'), `${new Date().toISOString()} - ${message}\n`, err => {
    if (err) {
      console.error(`Failed to log message: ${err.message}`);
    }
  });
}

// Hilfsfunktion zum Abrufen von Plex-Daten
async function fetchPlexData(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    logError(`Error fetching Plex data: ${error.message}`);
    throw error;
  }
}

// Funktion zum Erstellen der Datei 'w_offen.json' im Hauptverzeichnis, falls sie noch nicht existiert
function ensureWOffenFileExists() {
  const filePath = path.join(__dirname, 'w_offen.json'); // Hauptverzeichnis
  if (!fs.existsSync(filePath)) {
    // Datei erstellen und leeres Array als Inhalt speichern
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), (err) => {
      if (err) {
        console.error(`Fehler beim Erstellen der Datei 'w_offen.json': ${err}`);
      }
    });
    console.log(`Die Datei 'w_offen.json' wurde im Hauptverzeichnis erstellt.`);
  } else {
    console.log(`Die Datei 'w_offen.json' existiert bereits.`);
  }
}

// Funktion zum Erstellen des Ordners 'wunsch', falls dieser noch nicht existiert
function ensureWunschFolderExists() {
  const folderPath = path.join(__dirname, 'wunsch');
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Ordner 'wunsch' wurde erstellt.`);
  }
}

// Funktion zum Speichern eines Wunsches in der Datei 'wishes_<chatId>.json'
function saveWish(chatId, wish, type, fulfilled = false) {
  ensureWunschFolderExists(); // Ordner sicherstellen
  const filePath = path.join(__dirname, 'wunsch', `wishes_${chatId}.json`);
  const wishData = { type, wish, fulfilled };

  fs.readFile(filePath, (err, data) => {
    let wishes = [];
    if (!err) {
      wishes = JSON.parse(data); // Vorhandene Wünsche lesen
    }
    wishes.push(wishData); // Neuen Wunsch hinzufügen

    fs.writeFile(filePath, JSON.stringify(wishes, null, 2), (err) => {
      if (err) {
        console.error(`Fehler beim Speichern des Wunsches: ${err}`);
      } else {
        console.log(`Wunsch von ${chatId} erfolgreich gespeichert.`);
      }
    });
  });
}

// Funktion zum Erstellen des Inline-Keyboards für die Auswahl von Film oder Serie
function getTypeKeyboard() {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: 'Film', callback_data: 'type_film' }],
        [{ text: 'Serie', callback_data: 'type_serie' }]
      ]
    })
  };
}

// Funktion zum Senden des Wunsches an zwei Benutzer mit Inline-Buttons für 'Erfüllt' und 'Nicht erfüllt'
async function sendWish(wish, type, chatId) {
  const message = `✨ Achtung! ✨\n\nEin neuer Wunsch ist eingegangen:\n\n🔹 Typ: ${type}\n\n🔹 Titel:\n${wish}`;

  // Inline-Keyboard mit den zwei Buttons
  const inlineKeyboard = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: 'Wunsch erfüllt', callback_data: `wish_fulfilled_${chatId}` },
          { text: 'Wunsch nicht erfüllt', callback_data: `wish_not_fulfilled_${chatId}` }
        ]
      ]
    })
  };

  try {
    await Promise.all([
      bot.sendMessage(USER1_ID, message, inlineKeyboard),
      bot.sendMessage(USER2_ID, message, inlineKeyboard),
    ]);
    console.log(`Wunsch von Typ ${type} wurde an ${USER1_ID} und ${USER2_ID} gesendet.`);
  } catch (error) {
    console.error(`Fehler beim Senden des Wunsches: ${error.message}`);
  }

  // Speichern des Wunsches in der Datei
  saveWish(chatId, wish, type);
}

// Verarbeite Callback Queries (für die Inline-Buttons)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('type_')) {
    // Benutzer hat den Typ ausgewählt (Film oder Serie)
    const type = data === 'type_film' ? 'Film' : 'Serie';
    bot.sendMessage(chatId, `Du hast ${type} ausgewählt. Bitte gib den Titel des ${type} ein.`)
      .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
    userStates[chatId] = { type, waitingForWish: true }; // Setze den Status auf "wartend auf Wunsch"
  }

  if (data.startsWith('wish_fulfilled_')) {
    const userId = data.split('_')[2]; // Der Ersteller des Wunsches
    const messageText = query.message.text; // Der Text des Wunsches
    const wishTitle = messageText.split('Titel:\n')[1].trim(); // Titel korrekt extrahieren
  
    bot.sendMessage(userId, '🎉 Dein Wunsch wurde erfüllt!')
      .catch(error => console.error(`Fehler beim Senden der Nachricht: ${error.message}`));
  
    // Wunsch in der Datei 'wishes_<chatId>.json' als erfüllt markieren
    const filePath = path.join(__dirname, 'wunsch', `wishes_${userId}.json`);
    fs.readFile(filePath, (err, data) => {
      if (!err) {
        let wishes = JSON.parse(data);
        // Suche den spezifischen Wunsch und markiere ihn als erfüllt
        wishes = wishes.map(wish => {
          if (wish.wish === wishTitle) {
            return { ...wish, fulfilled: true }; // Nur den spezifischen Wunsch als erfüllt markieren
          }
          return wish; // Alle anderen Wünsche unverändert lassen
        });
  
        fs.writeFile(filePath, JSON.stringify(wishes, null, 2), (err) => {
          if (err) {
            console.error(`Fehler beim Aktualisieren des Wunsches: ${err}`);
          }
        });
      }
    });
  }
  
  if (data.startsWith('wish_not_fulfilled_')) {
    const userId = query.message.chat.id; // Nutze die Chat-ID des Nachrichtenautors
    bot.sendMessage(userId, '😢 Dein Wunsch wurde leider nicht erfüllt.')
      .catch(error => console.error(`Fehler beim Senden der Nachricht: ${error.message}`));

    // Wunsch in der Datei 'w_offen.json' speichern
    const filePath = path.join(__dirname, 'w_offen.json');
    const wishDetails = {
      userId,
      message: query.message.text,
    };

    fs.readFile(filePath, (err, data) => {
      let openWishes = [];
      if (!err) {
        openWishes = JSON.parse(data); // Vorhandene offene Wünsche lesen
      }
      openWishes.push(wishDetails); // Neuen offenen Wunsch hinzufügen

      fs.writeFile(filePath, JSON.stringify(openWishes, null, 2), (err) => {
        if (err) {
          console.error(`Fehler beim Speichern des offenen Wunsches: ${err}`);
        } else {
          console.log('Der nicht erfüllte Wunsch wurde in der Datei "w_offen.json" gespeichert.');
        }
      });
    });
  }

  bot.answerCallbackQuery(query.id).catch(error => {
    console.error(`Fehler bei der Callback-Abfrage: ${error.message}`);
  });
});

// Verarbeite eingehende Nachrichten
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (userStates[chatId] && userStates[chatId].waitingForWish) {
    const wish = text.trim();
    if (wish) {
      const type = userStates[chatId].type;
      await sendWish(wish, type, chatId);
      bot.sendMessage(chatId, `Dein ${type}-Wunsch wurde übermittelt.`)
        .catch(error => console.error(`Fehler bei der Bestätigungsnachricht: ${error.message}`));
      userStates[chatId].waitingForWish = false;
    } else {
      bot.sendMessage(chatId, `Bitte gib den Titel des ${userStates[chatId].type} ein.`)
        .catch(error => console.error(`Fehler bei der Wunsch-Nachricht: ${error.message}`));
    }
    return;
  }

  if (text.startsWith('/wunsch')) {
    bot.sendMessage(chatId, 'Möchtest du einen Film oder eine Serie wünschen? Wähle bitte eine Option:', getTypeKeyboard())
      .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
    userStates[chatId] = { waitingForType: true };
  }

  if (text.startsWith('/w_list')) {
    // Liste der Wünsche für den Benutzer anzeigen
    const filePath = path.join(__dirname, 'wunsch', `wishes_${chatId}.json`);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        bot.sendMessage(chatId, 'Es wurden keine Wünsche gefunden.')
          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
      } else {
        const wishes = JSON.parse(data);
        let wishList = '📜 Deine Wünsche:\n\n';
        wishes.forEach((wish, index) => {
          const statusEmoji = wish.fulfilled ? '🟢' : '🔴';
          wishList += `${index + 1}. ${statusEmoji} ${wish.type}: ${wish.wish} \n\n`;
        });
        bot.sendMessage(chatId, wishList)
          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
      }
    });
  }
});

// Objekt zur Verfolgung der Benutzer, die auf eine Eingabe warten
let waitingForWishIndex = {};

// Funktion zum Anzeigen aller offenen Wünsche und Inline-Button zum Markieren eines Wunsches als erfüllt
bot.onText(/\/open_wishes/, (msg) => {
  const chatId = msg.chat.id;

  // Pfad zur 'w_offen.json' Datei
  const filePath = path.join(__dirname, 'w_offen.json');

  fs.readFile(filePath, (err, data) => {
    if (err || data.length === 0) {
      bot.sendMessage(chatId, 'Es gibt keine offenen Wünsche.')
        .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
    } else {
      const openWishes = JSON.parse(data);
      if (openWishes.length === 0) {
        bot.sendMessage(chatId, 'Es gibt keine offenen Wünsche.')
          .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
        return;
      }

      let message = '📜 Offene Wünsche:\n\n';
      openWishes.forEach((wish, index) => {
        message += `${index + 1}. User ID: ${wish.userId}\n🔹 Titel: ${wish.message}\n\n`;
      });

      // Inline-Keyboard mit einem Button, um einen Wunsch als erfüllt zu markieren
      const inlineKeyboard = {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: 'Wunsch als erfüllt markieren', callback_data: 'mark_wish_fulfilled' }]
          ]
        })
      };

      bot.sendMessage(chatId, message, inlineKeyboard)
        .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
    }
  });
});

// Verarbeite die Auswahl des Inline-Buttons zum Markieren eines Wunsches als erfüllt
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'mark_wish_fulfilled') {
    bot.sendMessage(chatId, 'Bitte gib die Nummer des Wunsches ein, den du als erfüllt markieren möchtest:')
      .then(() => {
        bot.once('message', (msg) => {
          const wishIndex = parseInt(msg.text.trim()) - 1; // Wunschindex basierend auf der eingegebenen Zahl

          // Lese die Datei 'w_offen.json' aus
          const filePath = path.join(__dirname, 'w_offen.json');
          fs.readFile(filePath, (err, data) => {
            if (!err) {
              let openWishes = JSON.parse(data);

              if (wishIndex >= 0 && wishIndex < openWishes.length) {
                const fulfilledWish = openWishes[wishIndex];

                // Log zur Überprüfung
                console.log(`Markiere Wunsch: ${fulfilledWish.message} von User ID: ${fulfilledWish.userId}`);

                // Wunsch als erfüllt markieren in 'wishes_<userId>.json'
                const userWishFile = path.join(__dirname, 'wunsch', `wishes_${fulfilledWish.userId}.json`);
                fs.readFile(userWishFile, (err, wishData) => {
                  if (!err) {
                    let userWishes = JSON.parse(wishData);

                    // Suche den spezifischen Wunsch und markiere ihn als erfüllt
                    let wishFound = false;

                    // Extrahiere den Titel aus der Wunschnachricht
                    const wishMatch = fulfilledWish.message.match(/🔹 Titel:\s*(.*)/);
                    const extractedTitle = wishMatch ? wishMatch[1].trim() : '';

                    userWishes.forEach(wish => {
                      // Entferne Leerzeichen und Zeilenumbrüche vor dem Vergleich
                      const normalizedFileWishText = wish.wish.trim().toLowerCase();

                      console.log(`Wunschtext aus der Datei: "${normalizedFileWishText}"`);
                      console.log(`Wunschtext aus der Eingabe: "${extractedTitle.toLowerCase()}"`);

                      if (normalizedFileWishText === extractedTitle.toLowerCase()) {
                        wishFound = true;
                        wish.fulfilled = true; // Setze fulfilled auf true
                        console.log(`Wunsch "${wish.wish}" wurde erfolgreich auf 'fulfilled: true' gesetzt.`);
                      }
                    });

                    if (!wishFound) {
                      console.log(`Wunsch "${fulfilledWish.message}" nicht gefunden.`);
                      bot.sendMessage(chatId, 'Wunsch konnte nicht gefunden werden.')
                        .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                    } else {
                      // Schreibe die aktualisierte Wunschliste zurück in die Datei
                      fs.writeFile(userWishFile, JSON.stringify(userWishes, null, 2), (err) => {
                        if (err) {
                          console.error(`Fehler beim Aktualisieren des Wunsches: ${err}`);
                          bot.sendMessage(chatId, 'Fehler beim Aktualisieren des Wunsches.')
                            .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                        } else {
                          // Entferne den Wunsch aus 'w_offen.json'
                          openWishes.splice(wishIndex, 1);
                          fs.writeFile(filePath, JSON.stringify(openWishes, null, 2), (err) => {
                            if (err) {
                              console.error(`Fehler beim Aktualisieren von 'w_offen.json': ${err}`);
                              bot.sendMessage(chatId, 'Fehler beim Aktualisieren der offenen Wünsche.')
                                .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                            } else {
                              bot.sendMessage(chatId, `Der Wunsch von User ID ${fulfilledWish.userId} wurde als erfüllt markiert.`)
                                .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                            }
                          });
                        }
                      });
                    }
                  } else {
                    console.error(`Fehler beim Lesen der Datei ${userWishFile}: ${err}`);
                    bot.sendMessage(chatId, 'Fehler beim Lesen der Benutzerdaten.')
                      .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
                  }
                });
              } else {
                bot.sendMessage(chatId, 'Ungültige Wunschnummer.')
                  .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
              }
            } else {
              console.error(`Fehler beim Lesen der Datei ${filePath}: ${err}`);
              bot.sendMessage(chatId, 'Fehler beim Lesen der offenen Wünsche.')
                .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
            }
          });
        });
      })
      .catch(error => console.error(`Fehler bei der Nachricht: ${error.message}`));
  }

  bot.answerCallbackQuery(query.id).catch(error => {
    console.error(`Fehler bei der Callback-Abfrage: ${error.message}`);
  });
});

// /zufall-Befehl verarbeiten
bot.onText(/\/zufall/, async (msg) => {
  const chatId = msg.chat.id;

  try {
      const randomMovie = await fetchRandomMovie();
      if (randomMovie) {
          const movieTitle = randomMovie.title || 'Unbekannt';
          const movieSummary = randomMovie.summary || 'Keine Zusammenfassung verfügbar';
          const movieThumb = randomMovie.thumb ? `${PLEX_DOMAIN}${randomMovie.thumb}?X-Plex-Token=${PLEX_TOKEN}` : '';

          const message = `Hier ist ein zufälliger Film:\n\nTitel: ${movieTitle}\n\nZusammenfassung: \n${movieSummary}`;

          // YouTube Trailer Link erstellen
          const youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(movieTitle + ' trailer')}`;

          // Inline-Button für den Trailer hinzufügen
          const options = {
              reply_markup: {
                  inline_keyboard: [
                      [
                          {
                              text: "Trailer ansehen",
                              url: youtubeLink,
                          }
                      ]
                  ]
              }
          };

          // Bild anzeigen, wenn vorhanden
          if (movieThumb) {
              bot.sendPhoto(chatId, movieThumb, { caption: message, reply_markup: options.reply_markup }).catch(error => {
                  logError(`Error sending photo to chatId ${chatId}: ${error.message}`);
              });
          } else {
              bot.sendMessage(chatId, message, options).catch(error => {
                  logError(`Error sending message to chatId ${chatId}: ${error.message}`);
              });
          }
          
          logMessage(`Sent random movie info to chatId ${chatId}`);
      } else {
          bot.sendMessage(chatId, 'Keine Filme gefunden.').catch(error => {
              logError(`Error sending no movies message to chatId ${chatId}: ${error.message}`);
          });
          logMessage(`No movies found for chatId ${chatId}`);
      }
  } catch (error) {
      if (error.response) {
          bot.sendMessage(chatId, `Fehler beim Abrufen eines zufälligen Films. Statuscode: ${error.response.status}`).catch(err => {
              logError(`Error sending error message to chatId ${chatId}: ${err.message}`);
          });
          logError(`Error fetching random movie: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
          bot.sendMessage(chatId, 'Fehler beim Abrufen eines zufälligen Films. Keine Antwort vom Server.').catch(err => {
              logError(`Error sending no response message to chatId ${chatId}: ${err.message}`);
          });
          logError(`Error fetching random movie: No response from server`);
      } else {
          bot.sendMessage(chatId, 'Fehler beim Abrufen eines zufälligen Films. Unbekannter Fehler.').catch(err => {
              logError(`Error sending unknown error message to chatId ${chatId}: ${err.message}`);
          });
          logError(`Error fetching random movie: ${error.message}`);
      }
  }
});

// Speichern des Status der Benutzerinteraktionen
const userStates = {}; // Einfache In-Memory-Datenstruktur

// /search-Befehl verarbeiten
bot.onText(/\/search/, (msg) => {
  const chatId = msg.chat.id;

  // Setze den Status auf "wartet auf Suchbegriff"
  userStates[chatId] = { waitingForQuery: true };

  const message = 'Bitte gib den Suchbegriff für die Film-Suche ein.';

  bot.sendMessage(chatId, message).catch(error => {
    logError(`Error sending search prompt to chatId ${chatId}: ${error.message}`);
  });

  logMessage(`Prompted for search query from chatId ${chatId}`);
});

// Eingehende Nachrichten verarbeiten
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Überprüfen, ob der Benutzer auf eine Suchabfrage wartet
  if (userStates[chatId] && userStates[chatId].waitingForQuery) {
    const query = text; // Suchbegriff erhalten

    try {
      const results = await searchMovies(query);
      if (results.length === 0) {
        await bot.sendMessage(chatId, 'Keine Filme gefunden, die deiner Suche entsprechen.').catch(error => {
          logError(`Error sending no results message to chatId ${chatId}: ${error.message}`);
        });
        logMessage(`No search results found for chatId ${chatId} with query "${query}"`);
      } else {
        // Erstelle Nachrichten für jedes Ergebnis
        const messages = results.map(async (movie) => {
          const { title, summary, thumb } = movie;
          const movieThumbUrl = thumb ? `${process.env.PLEX_DOMAIN}${thumb}?X-Plex-Token=${process.env.PLEX_TOKEN}` : '';
          const message = `Titel: ${title}\n\nZusammenfassung: \n\n${summary}`;

          try {
            if (movieThumbUrl) {
              await bot.sendPhoto(chatId, movieThumbUrl, { caption: message });
              logMessage(`Sent photo for movie "${title}" to chatId ${chatId}`);
            } else {
              await bot.sendMessage(chatId, message);
              logMessage(`Sent message for movie "${title}" to chatId ${chatId}`);
            }
          } catch (error) {
            logError(`Error sending message or photo to chatId ${chatId}: ${error.message}`);
            // Optional: Sende nur die Textnachricht, wenn das Bild nicht gesendet werden konnte
            await bot.sendMessage(chatId, message).catch(err => {
              logError(`Error sending fallback message to chatId ${chatId}: ${err.message}`);
            });
          }
        });

        // Führe alle Nachrichten-Operationen aus
        await Promise.all(messages);

        logMessage(`Sent search results for query "${query}" to chatId ${chatId}`);
      }
    } catch (error) {
      let errorMessage = 'Fehler beim Durchführen der Suche.';

      if (error.response) {
        errorMessage += ` Statuscode: ${error.response.status}`;
        logError(`Error searching movies: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        errorMessage += ' Keine Antwort vom Server.';
        logError(`Error searching movies: No response from server`);
      } else {
        errorMessage += ` Unbekannter Fehler: ${error.message}`;
        logError(`Error searching movies: ${error.message}`);
      }

      await bot.sendMessage(chatId, errorMessage).catch(err => {
        logError(`Error sending search error message to chatId ${chatId}: ${err.message}`);
      });
    }

    // Benutzerstatus zurücksetzen
    userStates[chatId].waitingForQuery = false;
  }
});

// Funktion zum Abrufen der Filme basierend auf der Suche
async function searchMovies(query) {
  try {
    // Placeholder für die tatsächliche Implementierung
    // Diese Funktion sollte Filme basierend auf dem Suchbegriff abfragen und zurückgeben
    const movies = await fetchMoviesFromAPI(query); // Ersetze dies durch die echte Implementierung
    return movies;
  } catch (error) {
    logError(`Error searching movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der Filme aus der API (placeholder)
async function fetchMoviesFromAPI(query) {
  try {
    const url = `${process.env.PLEX_DOMAIN}/search?query=${encodeURIComponent(query)}&X-Plex-Token=${process.env.PLEX_TOKEN}`;
    const response = await axios.get(url);
    return response.data.MediaContainer.Metadata; // Oder wie auch immer die API antwortet
  } catch (error) {
    logError(`Error fetching movies from API: ${error.message}`);
    throw error;
  }
}

// Array, um empfohlene Filme zu speichern
const recommendedMovies = [];

let dailyMovieCache = {}; // Cache für den Film des Tages

// Funktion zum Abrufen des täglichen Films basierend auf dem Datum
async function fetchDailyRecommendation() {
  try {
    // Berechne das heutige Datum
    const today = moment().format('YYYY-MM-DD');

    // Überprüfen, ob wir bereits einen Film für heute gespeichert haben
    if (dailyMovieCache[today]) {
      return dailyMovieCache[today];
    }

    // Anfrage zur Mediathek, um alle Filme abzurufen
    const url = `${process.env.PLEX_DOMAIN}/library/sections/1/all?X-Plex-Token=${process.env.PLEX_TOKEN}`;
    const response = await axios.get(url);

    const data = response.data;
    if (data && data.MediaContainer && Array.isArray(data.MediaContainer.Metadata) && data.MediaContainer.Metadata.length > 0) {
      // Wähle einen zufälligen Film aus der Liste der Filme aus
      const movies = data.MediaContainer.Metadata;
      const randomIndex = Math.floor(Math.random() * movies.length);
      const selectedMovie = movies[randomIndex];

      // Speichern des Films für heute im Cache
      dailyMovieCache[today] = selectedMovie;
      return selectedMovie;
    } else {
      // Protokolliere, wenn keine Filme gefunden wurden
      console.log('No movies found in API response or unexpected response format');
      return null;
    }
  } catch (error) {
    logError(`Error fetching daily recommendation from API: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen des Trailers für einen bestimmten Film
async function fetchTrailerUrl(filmTitle) {
  try {
    // YouTube API URL für die Suche
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(filmTitle + ' trailer')}&key=${process.env.YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    const videos = response.data.items;

    // Überprüfen, ob Videos gefunden wurden
    if (videos.length > 0) {
      const videoId = videos[0].id.videoId; // ID des ersten gefundenen Trailers
      return `https://www.youtube.com/watch?v=${videoId}`; // URL des Trailers
    } else {
      return null; // Kein Trailer gefunden
    }
  } catch (error) {
    logError(`Error fetching trailer URL: ${error.message}`);
    return null; // Fehler beim Abrufen des Trailers
  }
}

// Funktion zum Kürzen der Zusammenfassung
function truncateSummary(summary, maxLength) {
  if (summary.length > maxLength) {
    return summary.slice(0, maxLength) + '...'; // Kürzen und "..." hinzufügen
  }
  return summary;
}

// Funktion zum Erstellen der Bildunterschrift
function createCaption(title, summary) {
  // Initiale Bildunterschrift ohne Kürzung
  let caption = `
Hier ist der empfohlene Film des Tages:

🎬 Titel: ${title || 'Unbekannt'}

📝 Zusammenfassung: 
${summary || 'Keine Zusammenfassung verfügbar'}
  `;

  // Überprüfen, ob die Bildunterschrift zu lang ist
  if (caption.length > MAX_CAPTION_LENGTH) {
    // Berechnen der maximalen Länge für die Zusammenfassung
    const maxSummaryLength = MAX_CAPTION_LENGTH - (caption.length - summary.length);
    // Kürzen der Zusammenfassung auf die berechnete Länge
    const truncatedSummary = truncateSummary(summary, maxSummaryLength);

    // Neu zusammenstellen der Bildunterschrift mit der gekürzten Zusammenfassung
    caption = `
Hier ist der empfohlene Film des Tages:

🎬 Titel: ${title || 'Unbekannt'}

📝 Zusammenfassung: 
${truncatedSummary}
    `;
  }

  return caption;
}

// /empfehlung-Befehl verarbeiten
bot.onText(/\/empfehlung/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const dailyMovie = await fetchDailyRecommendation();
    if (dailyMovie) {
      // Film empfehlen
      const movieTitle = dailyMovie.title || 'Unbekannt';
      const movieSummary = dailyMovie.summary || 'Keine Zusammenfassung verfügbar';
      const movieThumb = dailyMovie.thumb ? `${process.env.PLEX_DOMAIN}${dailyMovie.thumb}?X-Plex-Token=${process.env.PLEX_TOKEN}` : '';

      // Erstellen der Bildunterschrift und Kürzen, falls nötig
      const message = createCaption(movieTitle, movieSummary);

      // Trailer URL abrufen
      const trailerUrl = await fetchTrailerUrl(movieTitle);

      // Bild anzeigen, wenn vorhanden
      if (movieThumb) {
        const options = {
          caption: message,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Trailer ansehen",
                  url: trailerUrl || "https://www.youtube.com", // Fallback-URL, falls kein Trailer gefunden wird
                }
              ]
            ]
          }
        };
        await bot.sendPhoto(chatId, movieThumb, options).catch(error => {
          logError(`Error sending photo to chatId ${chatId}: ${error.message}`);
        });
      } else {
        const options = {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Trailer ansehen",
                  url: trailerUrl || "https://www.youtube.com", // Fallback-URL, falls kein Trailer gefunden wird
                }
              ]
            ]
          }
        };
        await bot.sendMessage(chatId, message, options).catch(error => {
          logError(`Error sending message to chatId ${chatId}: ${error.message}`);
        });
      }

      logMessage(`Sent daily recommendation to chatId ${chatId}`);
    } else {
      await bot.sendMessage(chatId, 'Keine Empfehlungen verfügbar.').catch(error => {
        logError(`Error sending no recommendation message to chatId ${chatId}: ${error.message}`);
      });
      logMessage(`No daily recommendation found for chatId ${chatId}`);
    }
  } catch (error) {
    let errorMessage = 'Fehler beim Abrufen der Empfehlung.';

    if (error.response) {
      errorMessage += ` Statuscode: ${error.response.status}`;
      logError(`Error fetching daily recommendation: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      errorMessage += ' Keine Antwort vom Server.';
      logError(`Error fetching daily recommendation: No response from server`);
    } else {
      errorMessage += ` Unbekannter Fehler: ${error.message}`;
      logError(`Error fetching daily recommendation: ${error.message}`);
    }

    await bot.sendMessage(chatId, errorMessage).catch(err => {
      logError(`Error sending daily recommendation error message to chatId ${chatId}: ${err.message}`);
    });
  }
});

// Session-Management für Feedback
const feedbackSessions = {};

// Fehlerprotokollierungsfunktion
function logError(error) {
  const errorMessage = `${dayjs().format('HH:mm:ss')} - Error: ${error}\n`;
  fs.appendFileSync(ERROR_LOG_PATH, errorMessage);
}

// Speichert Feedback in der Datei
function saveFeedbackToFile(feedbackData) {
  // Wenn die Datei nicht existiert, erstelle sie mit dem Header
  if (!fs.existsSync(feedbackFilePath)) {
    fs.writeFileSync(feedbackFilePath, 'timestamp - chatId: feedback\n');
  }
  const feedback = `${feedbackData.timestamp} - chatId ${feedbackData.chatId}: ${feedbackData.feedback}\n`;
  fs.appendFileSync(feedbackFilePath, feedback);
}

// Sendet Feedback an Administratoren
function sendFeedbackToAdmins(userId, feedback) {
  const adminChatIds = [USER1_ID, USER2_ID]; // Hier sollten die IDs der Administratoren festgelegt werden
  const message = `📢 Neues Feedback:\n\n Von userId: "${userId}"\n\n"${feedback}"`;

  adminChatIds.forEach(adminChatId => {
    bot.sendMessage(adminChatId, message).catch(error => {
      logError(`Fehler beim Senden von Feedback an Admin chatId ${adminChatId}: ${error.message}`);
    });
  });
}

const feedbackFilePath = path.join(__dirname, 'feedback.log'); // Überprüfe, ob dieser Pfad korrekt ist
// Fehlerprotokollierungsfunktion
function logError(error) {
  const errorMessage = `${new Date().toISOString()} - Error: ${error.message || error}\n`;
  try {
    fs.appendFileSync(errorLogPath, errorMessage);
  } catch (err) {
    console.error('Fehler beim Schreiben in die Fehlerprotokolldatei:', err.message);
  }
}

// Funktion, die überprüft, ob ein Benutzer autorisiert ist
function isUserAuthorized(userId) {
  const authorizedUsers = [process.env.USER1_ID, process.env.USER2_ID];
  return authorizedUsers.includes(userId.toString());
}

// Funktion, die überprüft, ob ein Benutzer autorisiert ist
function isUserAuthorized(userId) {
  const authorizedUsers = [process.env.USER1_ID, process.env.USER2_ID];
  return authorizedUsers.includes(userId.toString());
}

// Speichert Feedback in der Datei
function saveFeedbackToFile({ chatId, feedback, timestamp }) {
  const feedbackEntry = `${timestamp} - chatId ${chatId}: ${feedback}\n`;
  try {
    if (!fs.existsSync(feedbackFilePath)) {
      fs.writeFileSync(feedbackFilePath, 'timestamp - chatId: feedback\n');
    }
    fs.appendFileSync(feedbackFilePath, feedbackEntry);
  } catch (err) {
    logError(`Fehler beim Speichern des Feedbacks: ${err.message}`);
  }
}

// Sendet Feedback an Administratoren
function sendFeedbackToAdmins(userId, feedback) {
  const adminChatIds = [process.env.USER1_ID, process.env.USER2_ID];
  const message = `
✨ *Neues Feedback* ✨

🆔 *User ID:* ${userId}

════════════════════════════════════

📌 *Zusammenfassung:* 📌

${feedback}


`;

  adminChatIds.forEach(adminChatId => {
    bot.sendMessage(adminChatId, message)
      .catch(error => {
        logError(`Fehler beim Senden von Feedback an Admin chatId ${adminChatId}: ${error.message}`);
      });
  });
}

// Handler für den /feedback Befehl
bot.onText(/\/feedback/, (msg) => {
  const chatId = msg.chat.id;

  // Startet eine Feedback-Sitzung
  feedbackSessions[chatId] = { waitingForFeedback: true };

  bot.sendMessage(chatId, '✍️ Bitte gib dein Feedback ein. Du kannst den Befehl `/cancel` verwenden, um das Feedback zu abbrechen.', { parse_mode: 'Markdown' })
    .catch(error => {
      logError(`Fehler beim Senden der Feedback-Aufforderung an chatId ${chatId}: ${error.message}`);
    });
});

// Handler für den /cancel Befehl
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;

  if (feedbackSessions[chatId]) {
    delete feedbackSessions[chatId];
    bot.sendMessage(chatId, 'Feedback wurde abgebrochen.', { parse_mode: 'Markdown' })
      .catch(error => {
        logError(`Fehler beim Senden der Abbruch-Nachricht an chatId ${chatId}: ${error.message}`);
      });
  }
});

// Handler für Nachrichten
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (feedbackSessions[chatId] && msg.text && msg.text !== '/cancel') {
    const feedback = msg.text;
    const userId = msg.from.id; // Die userId des Feedbackers
    saveFeedbackToFile({ chatId, feedback, timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss') });
    sendFeedbackToAdmins(userId, feedback);
    bot.sendMessage(chatId, '👍 Danke für dein Feedback!', { parse_mode: 'Markdown' })
      .catch(error => {
        logError(`Fehler beim Senden der Bestätigung an chatId ${chatId}: ${error.message}`);
      });
    delete feedbackSessions[chatId];
  }
});

// Beispiel zur erweiterten Fehlerbehandlung im Bot
bot.on('polling_error', (error) => {
  logError(`Polling Error: ${error.code} - ${error.message}`);
});

// Handler für den /f_log Befehl
bot.onText(/\/f_log/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isUserAuthorized(userId)) {
    try {
      if (fs.existsSync(feedbackFilePath)) {
        const tempFilePath = path.join(__dirname, 'feedback_log.txt');
        const feedbackData = fs.readFileSync(feedbackFilePath, 'utf8');
        fs.writeFileSync(tempFilePath, feedbackData);

        bot.sendDocument(chatId, tempFilePath)
          .then(() => {
            fs.unlinkSync(tempFilePath);
            console.log('Feedback-Log-Datei erfolgreich gesendet und gelöscht.');
          })
          .catch(error => {
            logError(`Fehler beim Senden der feedback_log.txt an chatId ${chatId}: ${error.message}`);
            bot.sendMessage(chatId, '❌ Fehler beim Senden der Feedback-Log-Datei.')
              .catch(err => {
                logError(`Fehler beim Senden der Fehlermeldung an chatId ${chatId}: ${err.message}`);
              });
          });
      } else {
        const errMsg = `Keine Feedback-Datei gefunden unter ${feedbackFilePath}.`;
        console.log(errMsg);
        bot.sendMessage(chatId, `❌ ${errMsg}`)
          .catch(error => {
            logError(`Fehler beim Senden der Fehlermeldung an chatId ${chatId}: ${error.message}`);
          });
      }
    } catch (error) {
      logError(`Fehler beim Senden der Feedback-Log-Datei: ${error.message}`);
      bot.sendMessage(chatId, '❌ Fehler beim Senden der Feedback-Log-Datei.')
        .catch(err => {
          logError(`Fehler beim Senden der Fehlermeldung an chatId ${chatId}: ${err.message}`);
        });
    }
  } else {
    const errMsg = `Unberechtigter Zugriff auf /f_log von userId ${userId}.`;
    console.log(errMsg);
    bot.sendMessage(chatId, `❌ ${errMsg}`)
      .catch(error => {
        logError(`Unberechtigter Zugriff auf /f_log von userId ${userId}: ${error.message}`);
      });
  }
});

// Funktion zum Erstellen der allgemeinen Hilfennachricht
function createHelpMessage() {
  return `📜 *Hier ist eine Liste der verfügbaren Befehle:*\n\n` +
      `👋 /start - Registriert deinen Zugang.\n\n` +
      `🔔 /notification\\_on - Aktiviert Benachrichtigungen für neue Filme.\n\n` +
      `🔕 /notification\\_off - Deaktiviert Benachrichtigungen für neue Filme.\n\n` +
      `📺 /serien - Zeigt eine Liste aller Serien an.\n\n` +
      `🎬 /latestmovie - Zeigt den zuletzt hinzugefügten Film an.\n\n` +
      `📅 /latest10movies - Zeigt die letzten 10 hinzugefügten Filme an.\n\n` +
      `⭐ /top\\_rated - Zeigt die am besten bewerteten Filme an.\n\n` +
      `💭 /wunsch - Nutze diesen Befehl, um einen Filmwunsch zu äußern.\n\n` +
      `🎬 /trailer - Fordere einen Trailer für einen bestimmten Film an. \n\n` +
      `🔝 /empfehlung - Film Empfehlung des Tages.\n\n` +
      `📰 /newsletter - zeigt die Newsletter Funktion an\n\n` +
      `❓ /help - Zeigt diese Hilfennachricht an.\n\n`;
}

// Funktion zum Erstellen der weiteren Hilfennachricht
function createMoreHelpMessage() {
  return `📜 *weitere Hilfe:*\n\n` +
      `📝 /profil - Zeigt dein Profil an\n\n` +
      `✨ /w\\_list - Zeigt dir deine Wünsche an.\n\n` +
      `🔧 /dev - Funktionswunsch oder Bug melden.\n\n` +
      `💬 /feedback - Gib Feedback zum Bot.\n\n` +
      `❓ /faq - Häufig gestellte Fragen.\n\n` +
      `ℹ️ /info - Anzahl Filme und Serien.\n\n` +
      `🤖 /bot - Bot-Informationen.\n\n`;
}

// Funktion zum Erstellen der Admin-Hilfennachricht
function createAdminHelpMessage() {
  return `*👨‍💻 Admin Befehle* \n\n` +
      `🛠️ /admin - sendet eine Nachricht an alle Nutzer.\n\n` +
      `🔒 /passwd - gibt dir das Aktuelle Passwort vom Frontend\n\n` +
      `✨ /open\\_wishes - Zeigt alle offenen Wünsche an\n\n` +
      `👤 /user - Zeigt Benutzerinformationen an.\n\n` +
      `📰 /newsletter - Zeigt die Newsletter Funktion an\n\n` +
      `📝 /logs - Zeigt die letzten Fehlermeldungen an.\n\n` +
      `🗑️ /log\\_delete - Löscht Logs.\n\n` +
      `📝 /f\\_log - Sendet das Feedback als .txt-Datei.\n\n` +
      `❓ /add\\_faq - Fügt eine neue Frage zur FAQ hinzu.\n\n` +
      `🗑️ /del\\_faq - Löscht eine FAQ.\n\n\n`+
      `*👨‍💻 Dev Befehle* \n\n` +
      `🔄 /update - Aktuallisiert die user.yml\n\n` +
      `🗃️ /command\\_history - Zeigt eine Liste der zuletzt verwendeten Befehle an.\n\n` +
      `💾 /backup - erstellt ein Backup und sendet es als zip\n\n` +
      `🪧 /serverinfo - Zeigt Informationen über den Server\n\n` +
      `🔍 /healthcheck - Überprüft den Bot\n\n` +
      `🔄 /setdebug - Aktiviert oder deaktiviert den Debug-Modus\n\n` +
      `🛠️ /support - Erstellt ein Support-Ticket an den Bot-Ersteller.\n\n`;
}

// /help-Befehl verarbeiten
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  // Prüfen, ob der Benutzer ein Admin ist
  const isAdmin = chatId.toString() === process.env.USER1_ID || chatId.toString() === process.env.USER2_ID;

  if (!isAdmin) {
    // Normale Benutzer: Hilfennachricht und "Mehr"-Button anzeigen
    const helpMessage = createHelpMessage();
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "Mehr",
                        callback_data: "more_help",
                    },
                    {
                        text: "Kontakt",
                        url: process.env.CONTACT_LINK,
                    }
                ]
            ]
        },
        parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, helpMessage, options).catch(error => {
      console.log(`Error sending help message to chatId ${chatId}: ${error.message}`);
    });
  } else {
    // Admin-Benutzer: Buttons "User Hilfe" und "Admin Hilfe" anzeigen
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "User Hilfe",
              callback_data: "user_help"
            },
            {
              text: "Admin Hilfe",
              callback_data: "admin_help",
            }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, "Bitte wähle eine Option:", options).catch(error => {
      console.log(`Error sending admin help buttons to chatId ${chatId}: ${error.message}`);
    });
  }
});

// Callback für die Inline-Buttons verarbeiten
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === "user_help") {
    const helpMessage = createHelpMessage();

    // Inline-Button für "Mehr" und Kontakt hinzufügen
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Mehr",
              callback_data: "more_help",
            },
            {
              text: "Kontakt",
              url: process.env.CONTACT_LINK,
            }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, helpMessage, options).catch(error => {
      console.log(`Error sending user help message to chatId ${chatId}: ${error.message}`);
    });
  } else if (data === "more_help") {
    const moreHelpMessage = createMoreHelpMessage();

    // Kontakt-Button hinzufügen
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Kontakt",
              url: process.env.CONTACT_LINK,
            }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, moreHelpMessage, options).catch(error => {
      console.log(`Error sending more help message to chatId ${chatId}: ${error.message}`);
    });
  } else if (data === "admin_help") {
    // Überprüfung, ob der Benutzer berechtigt ist
    if (chatId.toString() === process.env.USER1_ID || chatId.toString() === process.env.USER2_ID) {
      const adminHelpMessage = createAdminHelpMessage();
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Kontakt",
                url: process.env.CONTACT_LINK,
              }
            ]
          ]
        },
        parse_mode: 'Markdown'
      };

      bot.sendMessage(chatId, adminHelpMessage, options).catch(error => {
        console.log(`Error sending admin help message to chatId ${chatId}: ${error.message}`);
      });
    } else {
      bot.sendMessage(chatId, "Du hast keine Berechtigung, diesen Befehl zu verwenden.", { parse_mode: 'Markdown' }).catch(error => {
        console.log(`Error sending unauthorized message to chatId ${chatId}: ${error.message}`);
      });
    }
  }
});

// Funktion zum Abrufen der letzten 10 hinzugefügten Filme
async function fetchLatest10Movies() {
  try {
    const movies = await fetchAllMovies();
    const sortedMovies = movies
      .filter(movie => movie.addedAt)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 10); // Nimm nur die neuesten 10 Filme

    return sortedMovies;
  } catch (error) {
    logError(`Error fetching latest 10 movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der letzten 10 hinzugefügten Filme
async function fetchLatest10Movies() {
  try {
    const movies = await fetchAllMovies();
    const sortedMovies = movies
      .filter(movie => movie.addedAt)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 10); // Nimm nur die neuesten 10 Filme

    return sortedMovies;
  } catch (error) {
    logError(`Error fetching latest 10 movies: ${error.message}`);
    throw error;
  }
}

// Funktion zum Abrufen der letzten 10 hinzugefügten Filme
async function fetchLatest10Movies() {
  try {
    const movies = await fetchAllMovies();
    const sortedMovies = movies
      .filter(movie => movie.addedAt)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 10); // Nimm nur die neuesten 10 Filme

    return sortedMovies;
  } catch (error) {
    logError(`Error fetching latest 10 movies: ${error.message}`);
    throw error;
  }
}

// Maximal zulässige Länge der Bildunterschrift (in Zeichen)
const MAX_CAPTION_LENGTH = 1024; // Telegrams Beschränkung für Bildunterschriften

// Funktion zum Kürzen der Zusammenfassung
function truncateSummary(summary, maxLength) {
  if (summary.length > maxLength) {
    return summary.slice(0, maxLength) + '...'; // Kürzen und "..." hinzufügen
  }
  return summary;
}

// Funktion zum Erstellen der Bildunterschrift
function createCaption(title, summary, addedAt) {
  // Initiale Bildunterschrift ohne Kürzung
  let caption = `
🎬 Titel: ${title || 'Unbekannt'}

📝 Zusammenfassung: 
${summary || 'Keine Zusammenfassung verfügbar.'}

📅 Hinzugefügt am: ${dayjs(addedAt * 1000).format('DD.MM.YYYY')}
  `;

  // Überprüfen, ob die Bildunterschrift zu lang ist
  if (caption.length > MAX_CAPTION_LENGTH) {
    // Berechnen der maximalen Länge für die Zusammenfassung
    const maxSummaryLength = MAX_CAPTION_LENGTH - (caption.length - summary.length);
    // Kürzen der Zusammenfassung auf die berechnete Länge
    const truncatedSummary = truncateSummary(summary, maxSummaryLength);

    // Neu zusammenstellen der Bildunterschrift mit der gekürzten Zusammenfassung
    caption = `
🎬 Titel: ${title || 'Unbekannt'}

📝 Zusammenfassung: 
${truncatedSummary}

📅 Hinzugefügt am: ${dayjs(addedAt * 1000).format('DD.MM.YYYY')}
    `;
  }
  
  return caption;
}

// /latest10movies-Befehl verarbeiten
bot.onText(/\/latest10movies/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const latestMovies = await fetchLatest10Movies();
    
    if (latestMovies.length > 0) {
      const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const inlineKeyboard = [[], []]; // Zwei Zeilen für das Inline-Keyboard
      let message = 'Letzten 10 hinzugefügten Filme:\n\n';
      
      latestMovies.forEach((movie, index) => {
        const numberEmoji = numberEmojis[index] || '';
        message += `${numberEmoji} - ${movie.title || 'Unbekannt'}\n\n`;

        // Ordne die Schaltflächen in zwei Zeilen an (5 pro Zeile)
        const rowIndex = index < 5 ? 0 : 1;
        inlineKeyboard[rowIndex].push({ text: numberEmoji, callback_data: `movie_${index}` });
      });

      // Füge die Anweisung unter den Filmnamen hinzu
      message += '\nKlicke auf die Zahl, um nähere Informationen zu bekommen.';

      bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }).catch(error => {
        logError(`Error sending message to chatId ${chatId}: ${error.message}`);
      });

      logMessage(`Sent latest 10 movies info to chatId ${chatId}`);
    } else {
      bot.sendMessage(chatId, 'Keine Filme gefunden.').catch(error => {
        logError(`Error sending no movies message to chatId ${chatId}: ${error.message}`);
      });
      logMessage(`No movies found for chatId ${chatId}`);
    }
  } catch (error) {
    handleError(chatId, error);
  }
});

app.use(express.json());

//Anfang für Frontend

// schnittstelle für Kontakt.html
app.get('/api/contact-info', (req, res) => {
  res.json({
      email: process.env.SMTP_USER,
      telegram: process.env.CONTACT_LINK
  });
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Route für Umgebungsvariablen
app.get('/api/env', (req, res) => {
    res.json({
        botAlias: process.env.BOT_ALIAS,
        telegramLink: process.env.TELEGRAM_LINK,
        PW_FRONT: process.env.PW_FRONT, //Frontend Passwort Abfrage
    });
});

app.use(express.static('public'));

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Funktion zum Laden der Abonnenten
function loadSubscribers() {
    if (fs.existsSync(subscribersFilePath)) {
        const data = fs.readFileSync(subscribersFilePath);
        subscribers = JSON.parse(data);
    }
}

// Abonnieren
app.post('/subscribe', (req, res) => {
    const { email, chatId, username } = req.body;

    if (!subscribers.find(subscriber => subscriber.chatId === chatId)) {
        subscribers.push({ chatId, email, username });
        fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers, null, 2));
        sendConfirmationEmail(email); // Bestätigungs-E-Mail senden
        res.status(200).send('Erfolgreich angemeldet!');
    } else {
        res.status(400).send('Bereits angemeldet!');
    }
});

// Abmelden
app.post('/unsubscribe', (req, res) => {
    const { chatId } = req.body;
    subscribers = subscribers.filter(subscriber => subscriber.chatId !== chatId);
    fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers, null, 2));
    res.status(200).send('Erfolgreich abgemeldet!');
});

// Lade Abonnenten beim Start
loadSubscribers();

// API-Route für die neuesten Filme
app.get('/api/latest-movies', async (req, res) => {
  try {
      const response = await axios.get(`${process.env.PLEX_DOMAIN}/library/recentlyAdded?X-Plex-Token=${process.env.PLEX_TOKEN}`);
      const movies = response.data.MediaContainer.Metadata.slice(0, 10).map(movie => ({
          title: movie.title,
          coverImage: `${process.env.PLEX_DOMAIN}${movie.thumb}?X-Plex-Token=${process.env.PLEX_TOKEN}`, // Coverbild-URL mit Token
      }));

      console.log(movies); // Überprüfung der Daten
      res.json(movies);
  } catch (error) {
      console.error('Fehler beim Abrufen der neuesten Filme:', error);
      res.status(500).json({ error: 'Interner Serverfehler' });
  }
});


app.get('/api/telegram-link', (req, res) => {
  res.json({ link: process.env.TELEGRAM_LINK }); // Stelle den Link aus der .env bereit
});

app.get('/api/bot-version', (req, res) => {
  res.json({ version: process.env.BOT_VERSION });
});

// Inline-Knopf-Ereignis für Film auswählen verarbeiten
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('movie_')) {
    const movieIndex = parseInt(data.split('_')[1], 10);

    try {
      const latestMovies = await fetchLatest10Movies();
      const selectedMovie = latestMovies[movieIndex];

      if (selectedMovie) {
        // Bildunterschrift erstellen und kürzen, falls nötig
        const movieDetails = createCaption(selectedMovie.title, selectedMovie.summary, selectedMovie.addedAt);

        if (selectedMovie.thumb) {
          const imageUrl = `${PLEX_DOMAIN}${selectedMovie.thumb}?X-Plex-Token=${PLEX_TOKEN}`;
          bot.sendPhoto(chatId, imageUrl, { caption: movieDetails, parse_mode: 'Markdown' }).catch(error => {
            logError(`Error sending photo to chatId ${chatId}: ${error.message}`);
          });
        } else {
          bot.sendMessage(chatId, movieDetails, { parse_mode: 'Markdown' }).catch(error => {
            logError(`Error sending message to chatId ${chatId}: ${error.message}`);
          });
        }

        logMessage(`Sent movie details for movie index ${movieIndex} to chatId ${chatId}`);
      } else {
        bot.sendMessage(chatId, 'Film nicht gefunden.').catch(error => {
          logError(`Error sending movie not found message to chatId ${chatId}: ${error.message}`);
        });
      }
    } catch (error) {
      handleError(chatId, error);
    }
  }
});

function handleError(chatId, error) {
  if (error.response) {
    bot.sendMessage(chatId, `Fehler beim Abrufen der Daten. Statuscode: ${error.response.status}`).catch(err => {
      logError(`Error sending error message to chatId ${chatId}: ${err.message}`);
    });
    logError(`Error fetching data: ${error.response.status} - ${error.response.statusText}`);
  } else if (error.request) {
    bot.sendMessage(chatId, 'Fehler beim Abrufen der Daten. Keine Antwort vom Server.').catch(err => {
      logError(`Error sending no response message to chatId ${chatId}: ${err.message}`);
    });
    logError(`Error fetching data: No response from server`);
  } else {
    logError(`Error fetching data: ${error.message}`);
  }
}

// Route für das Dashboard
app.get('/admin/dashboard', (req, res) => {
  if (!req.session.user) { // Überprüfung, ob der Benutzer eingeloggt ist
      return res.redirect('/login'); // Weiterleitung zur Login-Seite
  }
  res.sendFile(__dirname + '/views/admin-dashboard.html'); // Sende die HTML-Datei
});

// API-Endpunkt für Bot-Laufzeit
app.get('/api/bot-uptime', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  res.json({ runtime: `${hours}h ${minutes}m ${seconds}s` });
});

// API-Endpunkt für Dateiprüfung
app.get('/api/file-check', (req, res) => {
  const requiredFiles = ['user.yml', 'faq.json', 'subscribers.json', 'dev_reports.json', 'w_offen.json', 'feedback.log', 'command_history.json', 'error.log', 'Cache/cache-series.json', 'Cache/cache.json', 'Log/message.log', 'wunsch', 'backups'];
  let fileStatus = requiredFiles.map(file => ({
      file: file,
      exists: fs.existsSync(file)
  }));
  res.json(fileStatus);
});

// API-Endpunkt für Serverinformationen
app.get('/api/server-info', (req, res) => {
  const totalMemory = os.totalmem() / (1024 ** 3); // In GB
  const freeMemory = os.freemem() / (1024 ** 3); // In GB
  const serverInfo = {
      platform: os.platform(),
      architecture: os.arch(),
      totalMemory: totalMemory.toFixed(2),
      freeMemory: freeMemory.toFixed(2)
  };
  res.json(serverInfo);
});

// Route für das Fehlerprotokoll
app.get('/api/error-log', (req, res) => {
  fs.readFile('./error.log', 'utf8', (err, data) => {
      if (err) {
          return res.status(500).send('Fehler beim Lesen des Fehlerprotokolls');
      }
      res.send(data);
  });
});

// Route für die Kommando-Historie
app.get('/api/command-history', (req, res) => {
  fs.readFile('./command_history.json', 'utf8', (err, data) => {
      if (err) {
          return res.status(500).send('Fehler beim Lesen der Kommando-Historie');
      }
      res.send(data);
  });
});

// Route zum Leeren des Fehlerprotokolls
app.post('/api/clear-error-log', (req, res) => {
  fs.writeFile('./error.log', '', (err) => {
      if (err) {
          return res.status(500).json({ success: false, message: 'Fehler beim Leeren des Fehlerprotokolls' });
      }
      res.json({ success: true });
  });
});

// Route zum Leeren der Kommando-Historie
app.post('/api/clear-command-history', (req, res) => {
  fs.writeFile('./command_history.json', '', (err) => {
      if (err) {
          return res.status(500).json({ success: false, message: 'Fehler beim Leeren der Kommando-Historie' });
      }
      res.json({ success: true });
  });
});

// Route zum Abrufen der FAQs
app.get('/api/faqs', (req, res) => {
  const faqs = loadFaqs();
  res.json(faqs);
});

// Route zum Hinzufügen einer neuen FAQ
app.post('/api/add-faq', (req, res) => {
  const faqs = loadFaqs();
  const { question, answer } = req.body;

  faqs.push({ question, answer });
  saveFaqs(faqs);

  res.json({ success: true });
});

// Route zum Löschen einer FAQ
app.delete('/api/delete-faq', (req, res) => {
  const faqs = loadFaqs();
  const index = req.body.index;

  if (index >= 0 && index < faqs.length) {
      faqs.splice(index, 1);
      saveFaqs(faqs);
      res.json({ success: true });
  } else {
      res.status(400).json({ success: false });
  }
});

// API-Endpunkt für offene Wünsche
app.get('/api/wishes', (req, res) => {
  fs.readFile('w_offen.json', 'utf8', (err, data) => {
      if (err) {
          return res.status(500).json({ error: 'Fehler beim Lesen der Wünsche' });
      }
      res.json(JSON.parse(data));
  });
});

// Endpoint für das Feedback
app.get('/api/feedback', (req, res) => {
  const feedbackFilePath = path.join(__dirname, 'feedback.log');

  fs.readFile(feedbackFilePath, 'utf8', (err, data) => {
      if (err) {
          console.error('Fehler beim Lesen der feedback.log:', err);
          return res.status(500).send('Fehler beim Laden des Feedbacks.');
      }
      res.send(data);
  });
});

// Endpunkt /api/users, um die user.yml-Datei zu lesen und die Daten im JSON-Format zurückzugeben
app.get('/api/users', (req, res) => {
  try {
      // Pfad zur user.yml-Datei
      const filePath = path.join(__dirname, 'user.yml');
      
      // YAML-Datei laden
      const file = fs.readFileSync(filePath, 'utf8');

      // YAML in ein JSON-Objekt konvertieren
      const data = yaml.parse(file);  // 'parse' Funktion verwenden

      // Benutzerobjekte in ein Array umwandeln
      const usersArray = Object.values(data).map(user => ({
          userId: user.userId,
          username: user.username,
          notifications: user.notifications,
          firstUsed: user.firstUsed,
          favoriteGenre: user.favoriteGenre,
          commandCount: user.commandCount || 0,  // Default auf 0, wenn nicht vorhanden
          userLevel: user.userLevel || 'Nicht festgelegt', // Default-Wert
          nightMode: user.nightMode || {} // Optionales Feld
      }));

      // JSON-Daten zurückgeben
      res.json(usersArray);
  } catch (err) {
      console.error('Fehler beim Laden der YAML-Datei:', err);
      res.status(500).json({ message: 'Fehler beim Laden der Benutzerdaten' });
  }
});

// Endpunkt zum Löschen eines Benutzers
app.delete('/api/users/:userId', (req, res) => {
  const userId = req.params.userId;

  try {
      // Pfad zur user.yml-Datei
      const filePath = path.join(__dirname, 'user.yml');

      // YAML-Datei laden
      const file = fs.readFileSync(filePath, 'utf8');
      const data = yaml.parse(file); // YAML in ein JSON-Objekt konvertieren

      // Überprüfe, ob der Benutzer existiert
      if (!data[userId]) {
          return res.status(404).json({ message: 'Benutzer nicht gefunden' });
      }

      // Benutzer aus den Daten entfernen
      delete data[userId];

      // Aktualisiere die YAML-Datei mit den neuen Daten
      fs.writeFileSync(filePath, yaml.stringify(data), 'utf8');

      res.json({ message: 'Benutzer erfolgreich gelöscht' });
  } catch (err) {
      console.error('Fehler beim Löschen des Benutzers:', err);
      res.status(500).json({ message: 'Fehler beim Löschen des Benutzers' });
  }
});


let lastRestart = new Date(); // Speichere den aktuellen Zeitpunkt als letzten Neustart

// Funktion zum Formatieren des Datums
const formatLastRestartDate = (date) => {
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // 24-Stunden-Format
    };
    return date.toLocaleString('de-DE', options);
};

// Beispiel: Funktion, die beim Neustart des Bots aufgerufen wird
function onBotRestart() {
    lastRestart = new Date(); // Aktualisiere den letzten Neustart
}

// Endpunkt für den letzten Neustart
app.get('/api/last-restart', (req, res) => {
    // Hier ist der letzte Neustart korrekt referenziert
    res.json({ lastRestart: formatLastRestartDate(lastRestart) });
});

// Beispiel: Rufe die Funktion auf, wenn der Bot neu gestartet wird
onBotRestart();



app.post('/api/send-message', async (req, res) => {
  const { message } = req.body;

  // Überprüfen, ob die Nachricht leer ist
  if (!message) {
      return res.status(400).json({ success: false, error: 'Nachricht darf nicht leer sein.' });
  }

  try {
      const users = yaml.load(USER_YML_PATH);
      const sendMessages = Object.keys(users).map(userChatId => {
          return bot.sendMessage(userChatId, `❗️Systemnachricht\n\n"${message}"`).catch(error => {
              logError(`Fehler beim Senden der Systemnachricht an chatId ${userChatId}: ${error.message}`);
          });
      }).filter(promise => promise !== undefined);

      await Promise.all(sendMessages);
      res.json({ success: true });
  } catch (error) {
      console.error('Fehler beim Senden der Nachricht an alle Benutzer:', error);
      res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/media-count', async (req, res) => {
  try {
      const mediaData = await fetchAllMedia(); // Stelle sicher, dass diese Funktion existiert
      const { movieCount, showCount } = mediaData; // Zieht die Anzahl der Filme und Serien
      res.json({ movieCount, showCount });
  } catch (error) {
      console.error('Fehler beim Abrufen der Medienanzahl:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Medienanzahl.' });
  }
});

// Express-Endpunkt zum Empfangen des Wunsches
app.post('/api/telegram-wunsch', (req, res) => {
  const { wunsch, type } = req.body;

  // Überprüfe, ob req.user vorhanden ist und ob chatId existiert, andernfalls Dummy-ID verwenden
  const chatId = req.user && req.user.chatId ? req.user.chatId : '123456789'; // Dummy chatId

  sendWish(wunsch, type, chatId)
      .then(() => {
          res.json({ message: 'Dein Wunsch wurde erfolgreich gesendet!' });
      })
      .catch(err => {
          console.error('Fehler beim Senden des Wunsches:', err);
          res.status(500).json({ message: 'Fehler beim Senden deines Wunsches.' });
      });
});

app.get('/api/admin-password', (req, res) => {
  res.json({ password: process.env.ADMIN_PW });
});
















const BACKUP_DIR = path.join(__dirname, 'backups');

// Sicherstellen, dass der Backup-Ordner existiert
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Middleware für statische Dateien
app.use('/backups', express.static(BACKUP_DIR));
app.use(express.json()); // Für das Parsen von JSON-Daten

// Funktion zum Überprüfen und Löschen des ältesten Backups, wenn mehr als 10 vorhanden sind
const checkBackupCount = () => {
    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) {
            console.error('Fehler beim Lesen des Backup-Verzeichnisses:', err);
            return;
        }

        if (files.length > 6) {
            // Ältestes Backup löschen
            const oldestFile = files.reduce((oldest, file) => {
                const filePath = path.join(BACKUP_DIR, file);
                return fs.statSync(filePath).mtime < fs.statSync(path.join(BACKUP_DIR, oldest)).mtime ? file : oldest;
            });

            fs.unlink(path.join(BACKUP_DIR, oldestFile), (err) => {
                if (err) {
                    console.error('Fehler beim Löschen des ältesten Backups:', err);
                } else {
                    console.log(`Ältestes Backup gelöscht: ${oldestFile}`);
                }
            });
        }
    });
};

// API-Endpunkt für das Erstellen eines Backups
app.post('/api/create-backup', (req, res) => {
    const backupFileName = `backup_${Date.now()}.zip`;
    const output = fs.createWriteStream(path.join(BACKUP_DIR, backupFileName));
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximale Kompression
    });

    // Event Listener für den Abschluss des Archivierens
    output.on('close', () => {
        console.log(`Backup erfolgreich erstellt: ${backupFileName}`);
        checkBackupCount(); // Überprüfe die Anzahl der Backups
        res.json({ success: true, fileName: backupFileName });
    });

    // Fehlerbehandlung für das Archiveren
    archive.on('error', (err) => {
        console.error('Fehler beim Erstellen des Backups:', err);
        res.status(500).json({ success: false, error: 'Fehler beim Erstellen des Backups' });
    });

    archive.pipe(output);

    // Füge alle Dateien und Ordner hinzu, außer 'backups' und 'node_modules'
    fs.readdirSync(__dirname).forEach(file => {
        if (file !== 'backups' && file !== 'node_modules') {
            const filePath = path.join(__dirname, file);
            if (fs.statSync(filePath).isDirectory()) {
                archive.directory(filePath, file);
            } else {
                archive.file(filePath, { name: file });
            }
        }
    });

    archive.finalize();
});

// API-Endpunkt für das Abrufen der Backups
app.get('/api/backups', (req, res) => {
    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) {
            console.error('Fehler beim Lesen des Backup-Verzeichnisses:', err);
            return res.status(500).json({ success: false, error: 'Fehler beim Abrufen der Backups' });
        }

        const backups = files.map(file => ({
            name: file,
            date: fs.statSync(path.join(BACKUP_DIR, file)).mtime,
        }));

        res.json({ success: true, backups });
    });
});

// API-Endpunkt für das Löschen eines Backups
app.post('/api/delete-backup', (req, res) => {
  const { backupName } = req.body;

  fs.unlink(path.join(BACKUP_DIR, backupName), (err) => {
      if (err) {
          console.error('Fehler beim Löschen des Backups:', err);
          return res.status(500).json({ success: false, error: 'Fehler beim Löschen des Backups' });
      }
      console.log(`Backup gelöscht: ${backupName}`);
      res.json({ success: true });
  });
});














app.post('/api/toggle-debug', (req, res) => {
  debugMode = req.body.debugMode;
  console.log(`Debug-Modus wurde ${debugMode ? 'aktiviert' : 'deaktiviert'}`);
  res.json({ success: true, debugMode });
});

app.get('/api/debug-status', (req, res) => {
  res.json({ debugMode });
});

// Beispiel-Endpoint für den Backup-Download
app.post('/api/download-backup', (req, res) => {
    const { backupName, password } = req.body;

    // Überprüfe das Passwort
    if (password !== process.env.ADMIN_PW) {
        return res.status(403).json({ success: false, error: 'Falsches Passwort' });
    }

    // Der Download-Link oder die Logik für den Backup-Download
    const backupPath = `path/to/backups/${backupName}`;
    if (fs.existsSync(backupPath)) {
        res.json({ success: true, downloadUrl: `/backups/${backupName}` });
    } else {
        res.status(404).json({ success: false, error: 'Backup nicht gefunden' });
    }
});














// API-Endpunkt zum Abrufen der Entwicklerberichte
app.get('/api/dev-reports', (req, res) => {
  try {
      const reports = JSON.parse(fs.readFileSync(DEV_REPORTS_FILE_PATH));
      res.json(reports);
  } catch (error) {
      console.error('Fehler beim Laden der Entwicklerberichte:', error);
      res.status(500).json({ message: 'Fehler beim Laden der Entwicklerberichte.' });
  }
});

// Route zum Löschen eines Dev Reports
app.delete('/api/dev-reports', (req, res) => {
  const reportId = parseInt(req.query.id, 10);

  try {
      const reports = JSON.parse(fs.readFileSync(DEV_REPORTS_FILE_PATH));
      const updatedReports = reports.filter(report => report.id !== reportId); // Lösche den Bericht

      fs.writeFileSync(DEV_REPORTS_FILE_PATH, JSON.stringify(updatedReports, null, 2)); // Datei aktualisieren
      res.status(204).send(); // 204 No Content
  } catch (error) {
      console.error('Fehler beim Löschen des Berichts:', error);
      res.status(500).send('Interner Serverfehler');
  }
});

app.use(bodyParser.json());

// API zum Empfangen der Berichte von der HTML-Seite
app.post('/api/submit-report', (req, res) => {
    const { type, user, message } = req.body;

    // Falls keine Chat-ID vorhanden ist, generiere eine zufällige ID
    const chatId = user.id || Math.floor(Math.random() * 1000000);

    const newReport = {
        id: Date.now(), // Verwende die aktuelle Zeit als eindeutige ID
        type,
        user: {
            name: user.name || 'Anonym',
            id: chatId
        },
        message,
        timestamp: new Date().toISOString()
    };

    try {
        // Berichte aus der Datei laden oder ein leeres Array verwenden
        let reports = [];
        if (fs.existsSync(DEV_REPORTS_FILE_PATH)) {
            reports = JSON.parse(fs.readFileSync(DEV_REPORTS_FILE_PATH, 'utf-8'));
        }

        // Füge den neuen Bericht hinzu
        reports.push(newReport);

        // Datei aktualisieren
        fs.writeFileSync(DEV_REPORTS_FILE_PATH, JSON.stringify(reports, null, 2));

        // Optional: Senden des Berichts an Telegram
        sendToTelegram(newReport);

        res.status(200).json({ message: 'Bericht erfolgreich übermittelt.' });
    } catch (error) {
        console.error('Fehler beim Schreiben des Berichts:', error);
        res.status(500).json({ message: 'Fehler beim Schreiben des Berichts.' });
    }
});

function sendToTelegram(report) {
  const messageTemplate = `📩 ${report.type}\n\nvon: ${report.user.name} (${report.user.id})\n\n"${report.message}"`;

  // Telegram API URL
  const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  // Sende die Nachricht
  axios.post(telegramApiUrl, {
      chat_id: DEV_CHAT_ID, // Sende an die in der .env gespeicherte Dev Chat ID
      text: messageTemplate,
      parse_mode: 'Markdown' // Formatierung der Nachricht
  })
  .then(response => {
      console.log('Nachricht erfolgreich an Telegram gesendet:', response.data);
  })
  .catch(error => {
      console.error('Fehler beim Senden der Nachricht an Telegram:', error);
  });
}




// Ende Frontend

/// Definition der logDebug-Funktion
function logDebug(message) {
  console.log(`${new Date().toISOString()} - DEBUG: ${message}`);
}

// Funktion zum Verarbeiten von Webhook-Anfragen
app.post('/mywebhook', async (req, res) => {
try {
  const event = req.body;
  logDebug(`Received webhook event: ${JSON.stringify(event, null, 2)}`);

  if (event.type === 'library.new' && event.Metadata) {
    const addedMovie = event.Metadata;
    const movieTitle = addedMovie.title || 'Unbekannt';
    const message = `Ein neuer Film wurde hinzugefügt:\n\nTitel: ${movieTitle}`;

    const users = yaml.load(USER_YML_PATH);
    const sendMessages = Object.keys(users).map(chatId =>
      bot.sendMessage(chatId, message).catch(error => {
        logError(`Error sending message to chatId ${chatId}: ${error.message}`);
      })
    );

    await Promise.all(sendMessages);
    logMessage(`Sent new movie message to all users`);
  } else {
    logDebug(`Unhandled event type or missing metadata: ${event.type}`);
  }

  res.sendStatus(200);
} catch (error) {
  logError(`Error processing webhook: ${error.message}`);
  res.sendStatus(500);
}
});

// Express-Server starten
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});

// Log-Rotation
function rotateLogs() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const logFilePath = path.join(LOG_DIR, `${today}.log`);

  // Lösche die Log-Datei von gestern, wenn sie existiert
  const yesterday = format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
  const oldLogFilePath = path.join(LOG_DIR, `${yesterday}.log`);
  
  if (fs.existsSync(oldLogFilePath)) {
    fs.unlinkSync(oldLogFilePath);  // Lösche die alte Logdatei
    logMessage(`Deleted old log file: ${yesterday}`);
  }
}

// Logs täglich um Mitternacht rotieren
function scheduleDailyRotation() {
  const now = new Date();
  const millisTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0) - now;

  setTimeout(function() {
    rotateLogs();  // Rotieren der Logs um Mitternacht
    setInterval(rotateLogs, 24 * 60 * 60 * 1000);  // Danach täglich wiederholen
  }, millisTillMidnight);
}

// Starte die tägliche Rotation
scheduleDailyRotation();

console.log('Bot is running...');