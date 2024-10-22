 // index.html
 
 // Funktion, um die WEB_NAME-Variable abzurufen und einzufügen
 document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/web-name')
        .then(response => response.json())
        .then(data => {
            const webName = data.name;
            // Ersetze den Text im h1- und title-Tag
            document.getElementById('welcome-title').textContent = `Willkommen bei ${webName}`;
            document.getElementById('web-title').textContent = webName;
        })
        .catch(error => console.error('Fehler beim Abrufen des Web-Namens:', error));
});


// Funktion, um die Umgebungsvariablen abzurufen
const fetchEnvVariables = async () => {
    const response = await fetch('/api/env');
    const data = await response.json();

    document.getElementById('bot-alias').textContent = data.botAlias;
    document.getElementById('telegram-link').href = data.telegramLink;
};

document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/telegram-link') // API-Endpunkt zum Abrufen des Telegram-Links
        .then(response => response.json())
        .then(data => {
            const telegramLink = document.getElementById('telegram-link');
            telegramLink.href = data.link; // Setze den Link im Anchor-Tag
        })
        .catch(error => console.error('Fehler beim Abrufen des Telegram-Links:', error));

    // Version abrufen
    fetch('/api/bot-version')
        .then(response => response.json())
        .then(data => {
            const botVersion = document.getElementById('bot-version');
            botVersion.textContent = data.version; // Setze die Versionsnummer
        })
        .catch(error => console.error('Fehler beim Abrufen der Bot-Version:', error));

        async function fetchLatestMovies() {
            try {
                const response = await fetch('/api/latest-movies'); // API-URL
                const movies = await response.json(); // Filme abrufen
                const moviesList = document.getElementById('movies-list');
        
                // Leere die Liste, bevor du neue Filme hinzufügst
                moviesList.innerHTML = '';
        
                // Füge die neuesten Filme zur Liste hinzu
                movies.forEach(movie => {
                    const listItem = document.createElement('li');
                    listItem.classList.add('movie-item'); // Füge Klasse hinzu für CSS
        
                    // Erstelle das Coverbild
                    const coverImage = document.createElement('img');
                    coverImage.src = movie.coverImage; // URL des Coverbilds
                    coverImage.alt = movie.title; // Alternativtext für das Bild
        
                    // Überprüfen, ob das Bild geladen werden kann
                    coverImage.onerror = () => {
                        console.error(`Konnte das Bild für ${movie.title} nicht laden: ${coverImage.src}`);
                        coverImage.src = 'fallback-image-url.jpg'; // Fallback-Bild, wenn das Bild nicht geladen werden kann
                    };
        
                    // Füge ein Klick-Event hinzu, um das Popup zu öffnen
                    coverImage.addEventListener('click', () => {
                        openMoviePopup(movie); // Popup mit Filminformationen öffnen
                    });
        
                    // Füge das Bild zur Liste hinzu
                    listItem.appendChild(coverImage);
                    moviesList.appendChild(listItem);
                });
        
                // Animation für das Einblenden der Filme
                requestAnimationFrame(() => {
                    moviesList.childNodes.forEach((item, index) => {
                        setTimeout(() => {
                            item.style.opacity = 1; // Opazität für sanftes Einblenden
                        }, index * 100); // Verzögerung für jeden Film
                    });
                });
        
            } catch (error) {
                console.error('Fehler beim Abrufen der Filme:', error);
            }
        }
        
        // Funktion zum Öffnen des Popups mit Filmdetails
        function openMoviePopup(movie) {
            document.getElementById('popup-title').innerText = movie.title; // Titel
            document.getElementById('popup-cover').src = movie.coverImage; // Cover
            document.getElementById('popup-summary').innerText = movie.summary || "Keine Zusammenfassung verfügbar."; // Zusammenfassung
        
            // Popup anzeigen
            document.getElementById('movie-popup').style.display = 'block';
        }
        
        // Event Listener zum Schließen des Popups
        document.getElementById('close-popup').addEventListener('click', () => {
            document.getElementById('movie-popup').style.display = 'none';
        });
        
        // Event Listener zum Schließen des Popups, wenn außerhalb des Inhalts geklickt wird
        window.addEventListener('click', (event) => {
            const popup = document.getElementById('movie-popup');
            if (event.target === popup) {
                popup.style.display = 'none';
            }
        });

    // Event-Listener für das Formular
    document.getElementById('subscribe-form').addEventListener('submit', function(event) {
        event.preventDefault();
        const email = document.getElementById('email').value;
        const username = document.getElementById('username').value;

        // Generiere eine Dummy-Chat-ID
        const chatId = Math.floor(Math.random() * 1000000); // Zufällige Zahl zwischen 0 und 999999

        fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, chatId, username })
        })
        .then(response => response.text())
        .then(data => alert(data))
        .catch(error => alert('Fehler: ' + error));
    });

    // Darkmode umschalten
    const toggle = document.getElementById('dark-mode-toggle');

    // Darkmode-Zustand beim Laden der Seite überprüfen und anwenden
    const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
    toggle.checked = darkModeEnabled;
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
    }

    toggle.addEventListener('change', () => {
        const isChecked = toggle.checked;
        document.body.classList.toggle('dark-mode', isChecked);
        // Speichere den Zustand in localStorage
        localStorage.setItem('darkMode', isChecked);
    });

    // Beim Laden der Seite die neuesten Filme abrufen
    window.onload = fetchLatestMovies;

    // Aktualisiere die Filme jede Minute (60000 Millisekunden)
    setInterval(fetchLatestMovies, 60000);

    // Changelog-Daten
    const changelogData = {
        "changelog": [
            {
                "version": "1.8.8",  // Hinzugefügte Version
                "date": "2024-10-21", // Aktuelles Datum
                "changes": [
                    "Mehrere Bugfix",
                    "Genre im Profil hinzugefügt",
                    "Nachtmodus Zeit in Profil eingebaut"
                ]
            },
            {
                "version": "1.8.7",  // Hinzugefügte Version
                "date": "2024-10-20", // Aktuelles Datum
                "changes": [
                    "Fehlerbehebung mit Profil.",
                    "Nachtmodus komplett überarbeitet.",
                    "Fehler beim Wunsch behoben.",
                    "Benutzerlevel erweitert"
                ]
            },
            {
                "version": "1.8.6",  // Neue Version hinzufügen
                "date": "2024-10-19", // Aktuelles Datum
                "changes": [
                    "Neue Popup-Funktionalität für Filmcover hinzugefügt.",
                    "Cursor wechselt zu Handzeiger über Filmcover.",
                    "Rahmenfarbe für das Popup hinzugefügt.",
                    "Verschiedene kleinere Bugfixes."
                ]
            },
            {
                "version": "1.8.5",  
                "date": "2024-10-18", 
                "changes": [
                    "Dev-Report Filme können jetzt gemeldet werden",
                    "Backend Notification für Dev-Melungen hinzugefügt",
                    "Diverse kleinere Bugfix",
                    "Darkmode Bugfix"
                ]
            },
            {
                "version": "1.8.4",  
                "date": "2024-10-17", 
                "changes": [
                    "Backups Passwort schutz",
                    "Verbesserter Passwort schutz für Admin Bereich"
                ]
            }
        ]
    };
    


    // Changelog im Popup anzeigen
    const changelogList = document.getElementById('changelog-list');

    changelogData.changelog.forEach(entry => {
        const changelogItem = document.createElement('div');
        changelogItem.classList.add('changelog-entry'); // Füge eine Klasse für das Styling hinzu

        changelogItem.innerHTML = `
            <strong>Version ${entry.version} (${entry.date}):</strong>
            <ul>
                ${entry.changes.map(change => `<li>${change}</li>`).join('')}
            </ul>
        `;
        changelogList.appendChild(changelogItem);
    });

    // Changelog-Popup-Elemente
    const changelogIcon = document.getElementById('changelog-icon');
    const popup = document.getElementById('changelog-popup');
    const closePopup = document.getElementById('close-popup');

    // Popup öffnen
    changelogIcon.addEventListener('click', () => {
        popup.style.display = 'block';
        document.body.classList.toggle('dark-mode', toggle.checked); // Darkmode bei Popup-Anzeige aktivieren
    });

    // Popup schließen
    closePopup.addEventListener('click', () => {
        popup.style.display = 'none';
        document.body.classList.toggle('dark-mode', toggle.checked); // Darkmode wieder zurücksetzen
    });

    // Klick außerhalb des Popups schließt es
    window.addEventListener('click', (event) => {
        if (event.target === popup) {
            popup.style.display = 'none';
            document.body.classList.toggle('dark-mode', toggle.checked); // Darkmode wieder zurücksetzen
        }
    });
});


//wunsch html



document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/telegram-link') // API-Endpunkt zum Abrufen des Telegram-Links
        .then(response => response.json())
        .then(data => {
            const telegramLink = document.getElementById('telegram-link');
            telegramLink.href = data.link; // Setze den Link im Anchor-Tag
        })
        .catch(error => console.error('Fehler beim Abrufen des Telegram-Links:', error));

    // Version abrufen
    fetch('/api/bot-version')
        .then(response => response.json())
        .then(data => {
            const botVersion = document.getElementById('bot-version');
            botVersion.textContent = data.version; // Setze die Versionsnummer
        })
        .catch(error => console.error('Fehler beim Abrufen der Bot-Version:', error));
    

    // Handle form submission
    document.getElementById('wunsch-form').addEventListener('submit', function(event) {
        event.preventDefault();
        const wunsch = document.getElementById('wunsch').value;
        const type = document.getElementById('type').value;

        fetch('/api/telegram-wunsch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wunsch, type })
        })
        .then(response => response.json())
        .then(data => {
            document.getElementById('response-message').textContent = data.message;
        })
        .catch(error => {
            document.getElementById('response-message').textContent = 'Fehler beim Senden des Wunsches: ' + error;
        });
    });
});

// Darkmode umschalten
const toggle = document.getElementById('dark-mode-toggle');
const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
toggle.checked = darkModeEnabled;
if (darkModeEnabled) document.body.classList.add('dark-mode');

toggle.addEventListener('change', () => {
    const isChecked = toggle.checked;
    document.body.classList.toggle('dark-mode', isChecked);
    localStorage.setItem('darkMode', isChecked);
});



//faq html
        // Funktion zum Abrufen der FAQs
        function fetchFaqs() {
            fetch('/api/faqs')
                .then(response => response.json())
                .then(data => {
                    const faqSection = document.getElementById('faq-section');
                    faqSection.innerHTML = ''; // Leere den Inhalt zuerst

                    if (data.length === 0) {
                        faqSection.innerHTML = '<p><h3>Es gibt derzeit keine FAQs.</h3></p>';
                    } else {
                        data.forEach((faq, index) => {
                            const faqItem = document.createElement('div');
                            faqItem.classList.add('faq-item');
                            
                            const faqToggle = document.createElement('div');
                            faqToggle.classList.add('faq-toggle');
                            faqToggle.innerHTML = `<h3 class="faq-question">${index + 1}. ${faq.question}</h3>
                                                   <i class="fas fa-chevron-down arrow"></i>`;
                            faqItem.appendChild(faqToggle);

                            const faqAnswer = document.createElement('p');
                            faqAnswer.classList.add('faq-answer');
                            faqAnswer.innerText = faq.answer;
                            faqItem.appendChild(faqAnswer);
                            
                            // Event-Listener hinzufügen, um die Antwort anzuzeigen oder auszublenden
                            faqToggle.addEventListener('click', () => {
                                faqAnswer.classList.toggle('show');
                                const arrow = faqToggle.querySelector('.arrow');
                                arrow.style.transform = faqAnswer.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
                            });
                            
                            faqSection.appendChild(faqItem);
                        });
                    }
                })
                .catch(error => console.error('Fehler beim Abrufen der FAQs:', error));
        }

        document.addEventListener('DOMContentLoaded', () => {
            // FAQs beim Laden der Seite abrufen
            fetchFaqs();

            
        });


//kontakt html

// Kontaktinformationen aus .env abrufen
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/contact-info') // API-Endpunkt zum Abrufen der Kontaktinformationen
        .then(response => response.json())
        .then(data => {
            document.getElementById('contact-email').href = `mailto:${data.email}`;
            document.getElementById('contact-email').textContent = data.email;
            document.getElementById('contact-telegram').href = data.telegram;
            document.getElementById('contact-telegram').textContent = data.telegram.split('/').pop(); // Extrahiere den Benutzernamen aus der URL
        })
        .catch(error => console.error('Fehler beim Abrufen der Kontaktinformationen:', error));
});


//Report html

document.getElementById('report-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const type = document.getElementById('report-type').value;
    const user = { name: document.getElementById('username').value };
    const message = document.getElementById('message').value;

    fetch('/api/submit-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, user, message })
    })
    .then(response => response.json())
    .then(data => {
        // Bestätigung anzeigen
        document.getElementById('confirmation').style.display = 'block';
        
        // Formular leeren
        document.getElementById('report-form').reset();

        // Bestätigung nach 5 Sekunden ausblenden
        setTimeout(() => {
            document.getElementById('confirmation').style.display = 'none';
        }, 5000);
    })
    .catch(error => {
        console.error('Fehler beim Übermitteln des Berichts:', error);
        alert('Es gab ein Problem beim Senden des Berichts. Bitte versuche es später erneut.');
    });
});


toggle.addEventListener('change', () => {
    const isChecked = toggle.checked;
    document.body.classList.toggle('dark-mode', isChecked);
    // Speichere den Zustand in localStorage
    localStorage.setItem('darkMode', isChecked);
});


//link html --> keine Scripte

//funktionen html --> keine Scripte

