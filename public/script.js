document.addEventListener("DOMContentLoaded", function() {
    // Event Listener für den Backup-Link
    document.getElementById('backup-link').onclick = function() {
        document.getElementById('backup').style.display = 'block'; // Backup-Bereich anzeigen
        // Hier können andere Bereiche versteckt werden, wenn nötig
    };

    // Funktion zum Erstellen des Backups
    window.createBackup = function() {
        document.getElementById('backup-status').textContent = 'Backup wird erstellt...';

        fetch('/api/create-backup', {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Netzwerkantwort war nicht ok');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'backup.zip'; // Der Name der ZIP-Datei
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.getElementById('backup-status').textContent = 'Backup erfolgreich erstellt!';
        })
        .catch(error => {
            console.error('Fehler beim Erstellen des Backups:', error);
            document.getElementById('backup-status').textContent = 'Fehler beim Erstellen des Backups.';
        });
    };
});