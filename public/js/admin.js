document.addEventListener("DOMContentLoaded", function() {
    const savedPassword = localStorage.getItem("adminPassword");
    const loginForm = document.getElementById("login-form");
    const adminArea = document.getElementById("admin-area");
    const sidebar = document.getElementById("sidebar");
    const errorMessage = document.getElementById("error-message");
    const passwordInput = document.querySelector("input[name='password']");
    const timerDisplay = document.getElementById('logout-timer'); // Logout-Timer Element

    let inactivityTimeout;
    let logoutTimerInterval; // Variable für den Timer-Interval
    let timeRemaining = 5 * 60 * 1000; // 5 Minuten in Millisekunden

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        clearInterval(logoutTimerInterval); // Timer-Interval zurücksetzen
        timeRemaining = 5 * 60 * 1000; // Reset des verbleibenden Zeitlimits
        startLogoutTimer(); // Timer neu starten

        inactivityTimeout = setTimeout(() => {
            logout();  // Automatischer Logout nach Inaktivität
        }, 5 * 60 * 1000); // 5 Minuten Timeout
    }

    // Überprüfen, ob ein Passwort gespeichert ist
    if (savedPassword) {
        loginForm.style.display = 'none';
        adminArea.style.display = 'block';
        sidebar.style.display = 'block';
        timerDisplay.style.display = 'block'; // Timer anzeigen, wenn eingeloggt
        loadDashboard();
        resetInactivityTimer();  // Timer bei Start setzen
        startLogoutTimer(); // Starte den Timer, wenn der Benutzer eingeloggt ist
    } else {
        // Standardmäßig den Timer ausblenden, wenn der Benutzer nicht eingeloggt ist
        timerDisplay.style.display = 'none';
    }

    // Holen Sie sich das Passwort und die letzten 3 Passwörter von der API
    fetch('/api/admin-password')
        .then(response => response.json())
        .then(data => {
            const correctPassword = data.password;
            const passwordChangeRequired = data.passwordChangeRequired; // Passwortänderung erforderlich
            const lastThreePasswords = data.lastThreePasswords || []; // Letzte 3 Passwörter

            // Wenn Passwortänderung erforderlich ist, blockiere den Login
            if (passwordChangeRequired) {
                errorMessage.textContent = "⚠️ Das Passwort muss geändert werden, bevor ein Login möglich ist.";
                errorMessage.style.display = 'block';
                loginForm.style.display = 'none'; // Verhindere den Login
                return;
            }

            document.getElementById("form").onsubmit = function(event) {
                event.preventDefault();
                const password = event.target.password.value;

                if (password === correctPassword) {
                    localStorage.setItem("adminPassword", password);
                    loginForm.style.display = 'none';
                    adminArea.style.display = 'block';
                    sidebar.style.display = 'block';
                    timerDisplay.style.display = 'block'; // Timer anzeigen, wenn eingeloggt
                    errorMessage.style.display = 'none';
                    loadDashboard();
                    resetInactivityTimer();
                } else {
                    // Passwortfeld verstecken und Fehlermeldung anstelle des Passwortfelds anzeigen
                    passwordInput.style.display = 'none';
                    errorMessage.style.display = 'block';

                    // Nach 3 Sekunden das Passwortfeld wieder anzeigen und Fehlermeldung ausblenden
                    setTimeout(() => {
                        passwordInput.style.display = 'block';
                        errorMessage.style.display = 'none';
                        passwordInput.value = '';  // Passwortfeld leeren
                    }, 3000); // 3 Sekunden Timeout
                }
            };
        })
        .catch(error => {
            console.error('Fehler beim Abrufen des Passworts:', error);
            errorMessage.textContent = 'Fehler beim Laden des Passworts.';
            errorMessage.style.display = 'block';
        });

    // Passwortänderungsfunktion mit Überprüfung der letzten 3 Passwörter
    window.changePassword = function(newPassword) {
        fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newPassword }),
        })
        .then(response => response.json())
        .then(data => {
            const lastThreePasswords = data.lastThreePasswords || [];

            // Prüfen, ob das neue Passwort in den letzten 3 Passwörtern enthalten ist
            if (lastThreePasswords.includes(newPassword)) {
                alert("⚠️ Das neue Passwort darf nicht eines der letzten 3 verwendeten Passwörter sein.");
                return;
            }

            // Passwort ändern und aktualisieren
            fetch('/api/update-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ newPassword }),
            })
            .then(() => {
                alert("✅ Passwort erfolgreich geändert.");
                localStorage.setItem("adminPassword", newPassword); // Neues Passwort speichern
                location.reload(); // Seite neu laden, um das neue Passwort zu aktivieren
            })
            .catch(error => {
                console.error('Fehler beim Ändern des Passworts:', error);
                alert("❌ Fehler beim Ändern des Passworts.");
            });
        })
        .catch(error => {
            console.error('Fehler beim Überprüfen des Passworts:', error);
        });
    };

    window.logout = function() {
        localStorage.removeItem("adminPassword");
        adminArea.style.display = 'none';
        loginForm.style.display = 'block';
        sidebar.style.display = 'none';
        timerDisplay.style.display = 'none'; // Timer ausblenden beim Logout
        
        // Login-Seite neu laden
        location.reload();
    };

    // Events, die Inaktivität verhindern: Mausbewegung, Tastatureingabe, etc.
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);

    // Timer-Funktion für den automatischen Logout
    function startLogoutTimer() {
        logoutTimerInterval = setInterval(() => {
            const minutes = Math.floor((timeRemaining / 1000 / 60) % 60);
            const seconds = Math.floor((timeRemaining / 1000) % 60);
            
            timerDisplay.textContent = `Automatischer Logout in: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            
            timeRemaining -= 1000; // Jede Sekunde 1000ms abziehen
            
            if (timeRemaining < 0) {
                clearInterval(logoutTimerInterval);
                logout(); // Führe Logout-Funktion aus
            }
        }, 1000);
    }




            document.getElementById('dashboard-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'block';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none'; // Wünsche ausblenden
                document.getElementById('feedback').style.display = 'none'; // Feedback ausblenden
                document.getElementById('users').style.display = 'none';
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('send-message').style.display = 'none'; // Send Message ausblenden
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'none';
            };

            document.getElementById('logs-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'block';
                document.getElementById('wishes').style.display = 'none'; // Wünsche ausblenden
                document.getElementById('feedback').style.display = 'none'; // Feedback ausblenden
                loadLogs(); // Logs laden, wenn der Bereich angezeigt wird
                document.getElementById('users').style.display = 'none';
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('send-message').style.display = 'none'; // Send Message ausblenden
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'none';
            };

            document.getElementById('wishes-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'block'; // Wünsche anzeigen
                loadWishes(); // Offene Wünsche laden, wenn der Bereich angezeigt wird
                document.getElementById('users').style.display = 'none';
                document.getElementById('feedback').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'none'; // Send Message ausblenden
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'none';
            };

            document.getElementById('feedback-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none'; // Wünsche ausblenden
                document.getElementById('feedback').style.display = 'block'; // Feedback anzeigen
                loadFeedback(); // Feedback laden, wenn der Bereich angezeigt wird
                document.getElementById('users').style.display = 'none';
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'none'; // Send Message ausblenden
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'none';
            };

            document.getElementById('admin-help-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('wishes').style.display = 'none'; // Wünsche ausblenden
                document.getElementById('feedback').style.display = 'none'; // Feedback ausblenden
                document.getElementById('admin-help').style.display = 'block'; // Admin Hilfe anzeigen
                document.getElementById('users').style.display = 'none';
                document.getElementById('send-message').style.display = 'none'; // Send Message ausblenden
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'none';
            };

            document.getElementById('users-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none';
                document.getElementById('feedback').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('users').style.display = 'block';
                loadUsers(); // Benutzer laden, wenn der Bereich angezeigt wird
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'none'; 
                document.getElementById('dev-report').style.display = 'none';
                document.getElementById('backups').style.display = 'none';
            };

            // Send Message Link
            document.getElementById('send-message-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none';
                document.getElementById('feedback').style.display = 'none';
                document.getElementById('users').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'block'; // Send Message anzeigen
                document.getElementById('dev-report').style.display = 'none';
                document.getElementById('backups').style.display = 'none';
            };

            document.getElementById('backups-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none';
                document.getElementById('feedback').style.display = 'none';
                document.getElementById('users').style.display = 'none';
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('dev-report').style.display = 'none';
                document.getElementById('backups').style.display = 'block'; // Backups anzeigen
                loadBackups(); // Backups laden, wenn der Bereich angezeigt wird
            };

            document.getElementById('dev-report-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none';
                document.getElementById('faq-container').style.display = 'none'; // FAQ-Bereich ausblenden
                document.getElementById('users').style.display = 'none';
                document.getElementById('feedback').style.display = 'none';
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'none'; // Send Message ausblenden
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'block'; // Dev Report anzeigen
                loadDevReports(); // Dev Reports laden, wenn der Bereich angezeigt wird
            };

            document.getElementById('faq-link').onclick = function() {
                document.getElementById('dashboard').style.display = 'none';
                document.getElementById('logs').style.display = 'none';
                document.getElementById('wishes').style.display = 'none';
                document.getElementById('feedback').style.display = 'none';
                document.getElementById('faq-container').style.display = 'block'; // FAQ-Bereich anzeigen
                document.getElementById('users').style.display = 'none';
                document.getElementById('admin-help').style.display = 'none';
                document.getElementById('send-message').style.display = 'none';
                document.getElementById('backups').style.display = 'none';
                document.getElementById('dev-report').style.display = 'none';
                fetchFaqs(); // FAQs laden, wenn der Bereich angezeigt wird
            };

        });

        function loadDashboard() {
            fetchBotUptime();
            fetchFileCheck();
            fetchServerInfo();
            document.getElementById('dashboard').style.display = 'block';
        }
    
        function loadLogs() {
            fetchCommandHistory();
            fetchErrorLog();
        }
        // Funktion zum Laden der Wünsche
        function loadWishes() {
            fetch('/api/wishes') // Endpoint für offene Wünsche
                .then(response => response.json())
                .then(data => {
                    const wishesDiv = document.getElementById('wishes-content');
                    wishesDiv.innerHTML = ''; // Vorherige Inhalte leeren
                    if (data.length === 0) {
                        wishesDiv.innerHTML = '<p>Keine offenen Wünsche vorhanden.</p>';
                    } else {
                        data.forEach((wish) => {
                            wishesDiv.innerHTML += `
                                <div class="wish-item">
                                    <div class="wish-message">${wish.message}</div>
                                </div>
                            `;
                        });
                    }
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Wünsche:', error);
                    document.getElementById('wishes-content').innerHTML = '<p>Fehler beim Laden der Wünsche.</p>';
                });
        }

            // Automatisches Aktualisieren des Wunsch alle 10 Sekunden
            setInterval(() => {
                loadWishes();
            }, 10000); // 10 Sekunden (10000 Millisekunden)


        // Funktion zum Laden des Feedbacks
            function loadFeedback() {
                fetch('/api/feedback')
                    .then(response => response.text())
                    .then(data => {
                        const feedbackDiv = document.getElementById('feedback-content');
                        feedbackDiv.innerHTML = ''; // Vorherige Inhalte leeren

                        const feedbackLines = data.split('\n');
                        feedbackLines.slice(1).forEach((line) => { // Ignoriere die erste Zeile
                            if (line.trim()) {
                                const feedbackMessage = line.split(' - ')[1]; // Nur den Feedback-Teil extrahieren
                                feedbackDiv.innerHTML += `
                                    <div class="feedback-item">
                                        <div class="feedback-message">${feedbackMessage}</div>
                                    </div>
                                `;
                            }
                        });

                        if (feedbackLines.length <= 1) { // Überprüfen, ob nur die erste Zeile vorhanden ist
                            feedbackDiv.innerHTML = '<p>Kein Feedback vorhanden.</p>';
                        }
                    })
                    .catch(error => {
                        console.error('Fehler beim Laden des Feedbacks:', error);
                        document.getElementById('feedback-content').innerHTML = '<p>Fehler beim Laden des Feedbacks.</p>';
                    });
            }

            // Automatisches Aktualisieren des Feedbacks alle 10 Sekunden
            setInterval(() => {
                loadFeedback();
            }, 10000); // 10 Sekunden (10000 Millisekunden)

    
        function fetchBotUptime() {
            fetch('/api/bot-uptime')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('bot-uptime').innerText = `Aktuelle Laufzeit des Bots: ${data.runtime}`;
                })
                .catch(error => console.error('Fehler beim Abrufen der Bot-Laufzeit:', error));
        }

        // Funktion, um die Bot-Laufzeit regelmäßig zu aktualisieren
        function startUptimeUpdate() {
            fetchBotUptime(); // Initialen Aufruf
            setInterval(fetchBotUptime, 1000); // Alle 5 Sekunden aktualisieren
        }

        // Aufruf der Startfunktion, wenn das Admin-Dashboard geladen wird
        document.addEventListener("DOMContentLoaded", function() {
            startUptimeUpdate();
        });
    
        function fetchFileCheck() {
            fetch('/api/file-check')
                .then(response => response.json())
                .then(data => {
                    const fileCheckDiv = document.getElementById('file-check');
                    fileCheckDiv.innerHTML = '<h2>Dateiüberprüfung:</h2>';
                    data.forEach(file => {
                        fileCheckDiv.innerHTML += `<p>${file.exists ? '✅' : '❌'} Datei ${file.file} ${file.exists ? 'ist vorhanden.' : 'fehlt.'}</p>`;
                    });
                })
                .catch(error => console.error('Fehler beim Abrufen der Dateiüberprüfung:', error));
        }

        // Automatisches Abrufen der Dateiüberprüfung alle 10 Sekunden
            setInterval(fetchFileCheck, 10000);

            // Optional: Einmaliges Abrufen, wenn die Seite geladen wird
            window.onload = fetchFileCheck;
    
        function fetchServerInfo() {
            fetch('/api/server-info')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('server-info').innerHTML = `
                        <h2>Server-Informationen:</h2>
                        <p>Plattform: ${data.platform}</p>
                        <p>Architektur: ${data.architecture}</p>
                        <p>Gesamter Speicher: ${data.totalMemory} GB</p>
                        <p>Freier Speicher: ${data.freeMemory} GB</p>
                    `;
                })
                .catch(error => console.error('Fehler beim Abrufen der Serverinformationen:', error));
        }
    
       // Funktion zum Abrufen des Fehlerprotokolls
function fetchErrorLog() {
    fetch('/api/error-log')
        .then(response => response.text())
        .then(data => {
            document.getElementById('error-log').querySelector('pre').innerText = data;
        })
        .catch(error => console.error('Fehler beim Abrufen des Fehlerprotokolls:', error));
}

let errorNotified = false; // Variable, um den Status der Benachrichtigung zu verfolgen

// Funktion zum Überprüfen des error.log
function checkErrorLog() {
    const savedPassword = localStorage.getItem("adminPassword"); // Überprüfen, ob der Benutzer eingeloggt ist

    if (!savedPassword) return; // Beende die Funktion, wenn der Benutzer nicht eingeloggt ist

    fetch('/api/error-log')
        .then(response => response.text())
        .then(data => {
            const welcomeBox = document.querySelector('.welcome-box');

            // Überprüfe, ob Fehler im Log vorhanden sind
            if (data && data.trim().length > 0) {
                if (!errorNotified) { // Nur Benachrichtigung anzeigen, wenn sie noch nicht angezeigt wird
                    welcomeBox.innerHTML += `
                        <div id="error-notification" class="error-notification">
                            <strong>Fehler erkannt!</strong> Bitte überprüfen Sie das Fehlerprotokoll.
                        </div>
                    `;
                    errorNotified = true; // Status aktualisieren
                }
            } else {
                // Fehler-Meldung entfernen, wenn kein Fehler mehr vorhanden ist
                const errorNotification = document.getElementById('error-notification');
                if (errorNotification) {
                    errorNotification.remove();
                    errorNotified = false; // Status zurücksetzen
                }
            }
        })
        .catch(error => {
            console.error('Fehler beim Abrufen des Fehlerprotokolls:', error);
        });
}

// Regelmäßige Überprüfung alle 10 Sekunden
setInterval(checkErrorLog, 10000); // Alle 10 Sekunden


// Funktion zum Abrufen der Kommando-Historie
function fetchCommandHistory() {
    fetch('/api/command-history')
        .then(response => response.text())
        .then(data => {
            document.getElementById('command-history').querySelector('pre').innerText = data;
        })
        .catch(error => console.error('Fehler beim Abrufen der Kommando-Historie:', error));
}

// Funktion zum Herunterladen des Error Logs
function downloadErrorLog() {
    fetch('/api/error-log')
        .then(response => response.text())
        .then(data => {
            const blob = new Blob([data], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'error_log.txt'; // Dateiname
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => console.error('Fehler beim Herunterladen des Fehlerprotokolls:', error));
}

// Funktion zum Herunterladen der Kommando-Historie
function downloadCommandHistory() {
    fetch('/api/command-history')
        .then(response => response.text())
        .then(data => {
            const blob = new Blob([data], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'command_history.txt'; // Dateiname
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => console.error('Fehler beim Herunterladen der Kommando-Historie:', error));
}

// Funktion zum Löschen des Fehlerprotokolls
function deleteErrorLog() {
    if (confirm('Möchten Sie das komplette Fehlerprotokoll wirklich löschen?')) {
        fetch('/api/clear-error-log', {
            method: 'POST',  // Ändere DELETE zu POST
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Fehlerprotokoll erfolgreich gelöscht.');
                fetchErrorLog(); // Log-Datei neu laden
            } else {
                alert('Fehler beim Löschen des Fehlerprotokolls.');
            }
        })
        .catch(error => console.error('Fehler beim Löschen des Fehlerprotokolls:', error));
    }
}

// Funktion zum Löschen der Kommando-Historie
function deleteCommandHistory() {
    if (confirm('Möchten Sie die gesamte Kommando-Historie wirklich löschen?')) {
        fetch('/api/clear-command-history', {
            method: 'POST',  // Ändere DELETE zu POST
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Kommando-Historie erfolgreich gelöscht.');
                fetchCommandHistory(); // Command-Historie neu laden
            } else {
                alert('Fehler beim Löschen der Kommando-Historie.');
            }
        })
        .catch(error => console.error('Fehler beim Löschen der Kommando-Historie:', error));
    }
}


// Automatisches Aktualisieren alle 10 Sekunden
setInterval(() => {
    fetchErrorLog();
    fetchCommandHistory();
}, 10000); // 10 Sekunden (10000 Millisekunden)



                    // Funktion zum Abfragen des Debug-Status
            function checkDebugStatus() {
                fetch('/api/debug-status')
                .then(response => response.json())
                .then(data => {
                    if (data.debugMode) {
                        showDebugMessage(); // Zeige die Debug-Meldung, wenn Debug aktiviert ist
                        updateDebugButton(true); // Aktualisiere den Button
                    } else {
                        hideDebugMessage(); // Verstecke die Debug-Meldung, wenn Debug deaktiviert ist
                        updateDebugButton(false); // Aktualisiere den Button
                    }
                })
                .catch(error => {
                    console.error('Fehler beim Abfragen des Debug-Status:', error);
                });
            }

            // Funktion zur Aktualisierung des Debug-Toggle-Buttons
            function updateDebugButton(isDebugActive) {
                const debugButton = document.getElementById('debug-button');
                
                if (isDebugActive) {
                    debugButton.textContent = 'Debug ON';
                    debugButton.style.backgroundColor = 'red'; // Rot für aktiviert
                } else {
                    debugButton.textContent = 'Debug OFF';
                    debugButton.style.backgroundColor = 'green'; // Grün für deaktiviert
                }
            }

            // Setze ein Intervall, um den Debug-Status alle 5 Sekunden zu überprüfen
            setInterval(checkDebugStatus, 5000);

            // Debug-Meldung anzeigen
            function showDebugMessage() {
                let debugBox = document.getElementById('debug-message-box');
                
                if (!debugBox) {
                    debugBox = document.createElement('div');
                    debugBox.id = 'debug-message-box';
                    debugBox.textContent = 'Debug-Modus aktiviert';
                    debugBox.style.position = 'fixed';
                    debugBox.style.top = '20px';
                    debugBox.style.right = '20px';
                    debugBox.style.backgroundColor = 'orange';
                    debugBox.style.color = 'white';
                    debugBox.style.padding = '10px 20px';
                    debugBox.style.borderRadius = '5px';
                    debugBox.style.zIndex = '1000';
                    document.body.appendChild(debugBox);
                }
            }

            // Debug-Meldung verstecken
            function hideDebugMessage() {
                const debugBox = document.getElementById('debug-message-box');
                if (debugBox) {
                    debugBox.remove();
                }
            }

            // Seite initial mit dem aktuellen Debug-Status laden
            checkDebugStatus();

            // Funktion zum Umschalten des Debug-Modus
            function toggleDebugMode() {
                const debugButton = document.getElementById('debug-button');
                const isDebugActive = debugButton.textContent === 'Debug ON';
                
                fetch('/api/toggle-debug', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ debugMode: !isDebugActive })
                })
                .then(response => response.json())
                .then(data => {
                    updateDebugButton(data.debugMode); // Aktualisiere den Button nach der Rückmeldung des Servers
                })
                .catch(error => {
                    console.error('Fehler beim Umschalten des Debug-Modus:', error);
                });
            }

        
       // Funktion zum Laden der Benutzerinformationen
function loadUsers() {
    fetch('/api/users') // API-Endpunkt für Benutzerinformationen
        .then(response => response.json())
        .then(data => {
            const usersDiv = document.getElementById('users-content');
            usersDiv.innerHTML = ''; // Vorherige Inhalte leeren

            if (data.length === 0) {
                usersDiv.innerHTML = '<p>Keine Benutzer vorhanden.</p>';
            } else {
                data.forEach((user, index) => {
                    // Bestimme die Klasse basierend auf der Index-Position
                    const className = index % 2 === 0 ? 'even' : 'odd'; // Klassen für gerade und ungerade Indizes

                    // Verwende favoriteGenres (Plural) und überprüfe, ob es Genres gibt
                    const favoriteGenres = user.favoriteGenres ? user.favoriteGenres : (user.favoriteGenre || 'Nicht festgelegt');

                    usersDiv.innerHTML += `
                        <div class="user-item ${className}">
                            <p><strong>Benutzername:</strong> ${user.username}</p>
                            <p><strong>Benutzerlevel:</strong> ${user.userLevel}</p>
                            <p><strong>Benachrichtigungen:</strong> ${user.notifications ? 'Aktiviert' : 'Deaktiviert'}</p>
                            <p><strong>Nachtmodus:</strong> ${user.nightMode}</p> <!-- Nachtmodus-Anzeige -->
                            <p><strong>Befehlsanzahl:</strong> ${user.commandCount}</p>
                            <p><strong>Erstnutzung:</strong> ${user.firstUsed}</p>
                            <p><strong>Lieblingsgenres:</strong> ${favoriteGenres}</p>
                            <button class="delete-user" data-user-id="${user.userId}">Löschen</button>
                        </div>
                        <hr>
                    `;
                });

                // Event Listener für die Lösch-Buttons
                document.querySelectorAll('.delete-user').forEach(button => {
                    button.onclick = function() {
                        const userId = this.getAttribute('data-user-id');
                        deleteUser(userId);
                    };
                });
            }
        })
        .catch(error => {
            console.error('Fehler beim Laden der Benutzer:', error);
            document.getElementById('users-content').innerHTML = '<p>Fehler beim Laden der Benutzerinformationen.</p>';
        });
}

// Funktion zum Löschen eines Benutzers
function deleteUser(userId) {
    if (confirm('Möchtest du diesen Benutzer wirklich löschen?')) {
        fetch(`/api/users/${userId}`, {
            method: 'DELETE',
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            loadUsers(); // Nach dem Löschen die Benutzerliste neu laden
        })
        .catch(error => {
            console.error('Fehler beim Löschen des Benutzers:', error);
            alert('Fehler beim Löschen des Benutzers.');
        });
    }
}

// Funktion zum Starten der automatischen Aktualisierung
function startAutoRefresh() {
    loadUsers(); // Einmaliges Laden der Benutzer beim Start
    setInterval(loadUsers, 10000); // Alle 10 Sekunden aktualisieren
}

// Stelle sicher, dass die Funktion beim Laden der Seite aufgerufen wird
window.onload = startAutoRefresh;








            
                function fetchLastRestart() {
    fetch('/api/last-restart')
        .then(response => response.json())
        .then(data => {
            document.getElementById('bot-restart').innerText = `Letzter Neustart: ${data.lastRestart}`;
        })
        .catch(error => console.error('Fehler beim Abrufen des letzten Neustarts:', error));
}

// Stelle sicher, dass die Funktion beim Laden des Dashboards aufgerufen wird
function loadDashboard() {
    fetchBotUptime();
    fetchLastRestart(); // Hinzufügen dieser Zeile
    fetchFileCheck();
    fetchServerInfo();
    document.getElementById('dashboard').style.display = 'block';
}


        function sendMessage() {
            const message = document.getElementById('message-input').value;
            const statusDiv = document.getElementById('send-message-status');

            if (!message) {
                statusDiv.innerHTML = '<span style="color: red;">Bitte gib eine Nachricht ein.</span>';
                return;
            }

            fetch('/api/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statusDiv.innerHTML = '<span style="color: green;">Nachricht erfolgreich gesendet!</span>';
                } else {
                    statusDiv.innerHTML = `<span style="color: red;">Fehler: ${data.error}</span>`;
                }
            })
            .catch(error => {
                console.error('Fehler beim Senden der Nachricht:', error);
                statusDiv.innerHTML = '<span style="color: red;">Ein Fehler ist aufgetreten.</span>';
            });
        }

        // Hier kann eine Funktion hinzugefügt werden, um den Abschnitt anzuzeigen
        document.getElementById('send-message-link').addEventListener('click', function() {
            document.getElementById('send-message').style.display = 'block';
        });

        async function loadMediaCount() {
            try {
                const response = await fetch('/api/media-count');
                if (!response.ok) {
                    throw new Error('Netzwerkantwort war nicht ok');
                }
                const data = await response.json();
                console.log('Medienanzahl-Daten:', data); // Debugging-Ausgabe

                const mediaCountContent = document.getElementById('media-count-content');
                mediaCountContent.innerHTML = `
                    📽️ Filme: ${data.movieCount}<br>
                    📺 Serien: ${data.showCount}
                `;
            } catch (error) {
                console.error('Fehler beim Laden der Medienanzahl:', error);
                document.getElementById('media-count-content').innerHTML = 'Fehler beim Laden der Medienanzahl.';
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            loadMediaCount(); // Medienanzahl laden, wenn das Dashboard geladen wird
        });

        document.getElementById('create-backup').onclick = function() {
                const statusDiv = document.getElementById('backup-status');

                fetch('/api/create-backup', {
                    method: 'POST',
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        statusDiv.innerHTML = `<span style="color: green;">Backup erfolgreich erstellt: ${data.fileName}</span>`;
                        loadBackups(); // Lade die Backups nach dem Erstellen
                        
                        // Blende die Meldung nach 10 Sekunden aus
                        setTimeout(() => {
                            statusDiv.innerHTML = '';
                        }, 10000); // 10 Sekunden in Millisekunden
                    } else {
                        statusDiv.innerHTML = `<span style="color: red;">Fehler: ${data.error}</span>`;
                    }
                })
                .catch(error => {
                    console.error('Fehler beim Erstellen des Backups:', error);
                    statusDiv.innerHTML = '<span style="color: red;">Ein Fehler ist aufgetreten.</span>';
                });
            };



        // Funktion zum Laden der Backups
        function loadBackups() {
            fetch('/api/backups')
                .then(response => response.json())
                .then(data => {
                    const backupsDiv = document.getElementById('backups-list');
                    backupsDiv.innerHTML = ''; // Leeren vorherige Inhalte

                    if (data.success && data.backups.length > 0) {
                        data.backups.forEach(backup => {
                            backupsDiv.innerHTML += `
                                <div class="backup-item">
                                    <span>${backup.name} - ${new Date(backup.date).toLocaleString()}</span>
                                    <a href="/backups/${backup.name}" download class="backup-button">Herunterladen</a>
                                    <button class="backup-button delete-backup" data-filename="${backup.name}">Löschen</button>
                                </div>
                            `;
                        });
                        
                        // Event Listener für die Löschen-Buttons
                        document.querySelectorAll('.delete-backup').forEach(button => {
                            button.onclick = function() {
                                const backupName = this.getAttribute('data-filename');
                                deleteBackup(backupName);
                            };
                        });
                    } else {
                        backupsDiv.innerHTML = '<p>Keine Backups vorhanden.</p>';
                    }
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Backups:', error);
                    document.getElementById('backups-list').innerHTML = '<p>Fehler beim Laden der Backups.</p>';
                });
        }

        // Funktion zum Löschen eines Backups
function deleteBackup(backupName) {
    fetch('/api/delete-backup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backupName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Nach dem Löschen die Backups erneut laden
            loadBackups();
        } else {
            console.error('Fehler beim Löschen des Backups:', data.error);
        }
    })
    .catch(error => {
        console.error('Fehler beim Löschen des Backups:', error);
    });
}






        // Automatisches Laden der Berichte alle 5 Sekunden (5000 Millisekunden)
setInterval(loadDevReports, 5000);

function loadDevReports() {
    fetch('/api/dev-reports') // Ersetze den URL mit deinem tatsächlichen Endpunkt
        .then(response => response.json())
        .then(data => {
            const devReportDiv = document.getElementById('dev-report-content');
            devReportDiv.innerHTML = ''; // Vorherige Inhalte leeren

            if (data.length === 0) {
                devReportDiv.innerHTML = '<p>Keine Entwicklerberichte vorhanden.</p>';
                document.getElementById('notification').style.display = 'none'; // Benachrichtigung verstecken
            } else {
                // Für jeden Bericht im Dev-Report durchlaufen und anzeigen
                data.forEach(report => {
                    const reportClass = report.type === "Bug" ? "bug" : 
                                        report.type === "Funktionswunsch" ? "feature-request" : 
                                        report.type === "Film Report" ? "film-report" : "";

                    const userName = report.user.name; // Den Namen des Benutzers aus dem Bericht holen
                    const message = report.message; // Den Text der Nachricht holen

                    devReportDiv.innerHTML += `
                        <div class="dev-report-item ${reportClass}">
                            <div class="dev-report-type"><strong>${report.type}</strong></div>
                            <div class="dev-report-user">@${userName}</div>
                            <div class="dev-report-message">"${message}"</div>
                            <button onclick="deleteDevReport(${report.id})">Löschen</button>
                        </div>
                    `;
                });

                // Wenn Berichte vorhanden sind, zeige die allgemeine Benachrichtigung an
                const notificationDiv = document.getElementById('notification');
                notificationDiv.innerHTML = `<strong>Meldung im Dev-Report bitte prüfen</strong>`;
                notificationDiv.className = 'general-notification'; // Allgemeine Benachrichtigungsklasse
                notificationDiv.style.display = 'block'; // Benachrichtigung anzeigen
            }
        })
        .catch(error => {
            console.error('Fehler beim Laden der Entwicklerberichte:', error);
            document.getElementById('dev-report-content').innerHTML = '<p>Fehler beim Laden der Entwicklerberichte.</p>';
        });
}

// Funktion zum Löschen eines Entwicklerberichts
function deleteDevReport(reportId) {
    fetch(`/api/dev-reports?id=${reportId}`, { method: 'DELETE' }) // Verwende hier die korrekte URL mit Query-Parameter
        .then(response => {
            if (response.ok) {
                loadDevReports(); // Berichte nach dem Löschen neu laden
            } else {
                console.error('Fehler beim Löschen des Berichts:', response.statusText);
            }
        })
        .catch(error => console.error('Fehler beim Löschen des Berichts:', error));
}

    













// Funktion zum Abrufen der FAQs
function fetchFaqs() {
    fetch('/api/faqs')
        .then(response => response.json())
        .then(data => {
            const faqSection = document.getElementById('faq-container'); // ID anpassen
            let faqText = '';

            if (data.length === 0) {
                faqText = 'Es gibt derzeit keine FAQs.';
            } else {
                data.forEach((faq, index) => {
                    faqText += `${index + 1}. *${faq.question}*\n${faq.answer}\n\n`;
                });
            }
            faqSection.querySelector('pre').innerText = faqText; // Text im <pre>-Tag setzen
        })
        .catch(error => console.error('Fehler beim Abrufen der FAQs:', error));
}

// Funktion zum Hinzufügen einer neuen FAQ
function addFaq() {
    const question = prompt('Bitte geben Sie die FAQ-Frage ein:');
    if (question) {
        const answer = prompt('Bitte geben Sie die Antwort ein:');
        if (answer) {
            fetch('/api/add-faq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answer }),
            })
            .then(response => response.json())
            .then(data => {
                const alertBox = document.createElement('div');
                alertBox.className = 'alert'; // Grundlegende Alert-Klasse

                if (data.success) {
                    alertBox.classList.add('success'); // Erfolgsklasse hinzufügen
                    alertBox.innerText = '✅ FAQ erfolgreich hinzugefügt.';
                } else {
                    alertBox.classList.add('error'); // Fehlerklasse hinzufügen
                    alertBox.innerText = '❌ Fehler beim Hinzufügen der FAQ.';
                }

                // Füge die Alert-Meldung zum FAQ-Bereich hinzu
                document.getElementById('faq-container').appendChild(alertBox);
                alertBox.style.display = 'block'; // Zeige die Meldung an

                // Nach einer kurzen Zeit die Meldung ausblenden
                setTimeout(() => {
                    alertBox.style.display = 'none';
                }, 5000); // 5 Sekunden warten, dann ausblenden

                fetchFaqs(); // FAQs neu laden
            })
            .catch(error => {
                const alertBox = document.createElement('div');
                alertBox.className = 'alert error'; // Fehlerklasse hinzufügen
                alertBox.innerText = '❌ Fehler beim Hinzufügen der FAQ.';
                document.getElementById('faq-container').appendChild(alertBox);
                alertBox.style.display = 'block'; // Zeige die Fehlermeldung an

                // Nach einer kurzen Zeit die Meldung ausblenden
                setTimeout(() => {
                    alertBox.style.display = 'none';
                }, 5000); // 5 Sekunden warten, dann ausblenden

                console.error('Fehler beim Hinzufügen der FAQ:', error);
            });
        }
    }
}

// Funktion zum Löschen einer FAQ
function deleteFaq() {
    fetch('/api/faqs')
        .then(response => response.json())
        .then(data => {
            if (data.length === 0) {
                alert('Es gibt derzeit keine FAQs zum Löschen.');
                return;
            }

            let faqText = 'Welche FAQ möchten Sie löschen?\n\n';
            data.forEach((faq, index) => {
                faqText += `${index + 1}. *${faq.question}*\n`;
            });

            const faqIndex = prompt(faqText);
            const index = parseInt(faqIndex, 10) - 1;

            if (index >= 0 && index < data.length) {
                fetch('/api/delete-faq', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ index }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('✅ FAQ erfolgreich gelöscht.');
                        fetchFaqs(); // FAQs neu laden
                    } else {
                        alert('❌ Fehler beim Löschen der FAQ.');
                    }
                })
                .catch(error => console.error('Fehler beim Löschen der FAQ:', error));
            } else {
                alert('❌ Ungültige Auswahl.');
            }
        })
        .catch(error => console.error('Fehler beim Abrufen der FAQs:', error));
}

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