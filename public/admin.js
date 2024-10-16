document.getElementById('login-button').addEventListener('click', () => {
    const passwordInput = document.getElementById('password').value;
    const correctPassword = 'deinPasswort'; // Setze hier das Passwort

    if (passwordInput === correctPassword) {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('admin-area').classList.remove('hidden');
        document.getElementById('error-message').classList.add('hidden');
    } else {
        document.getElementById('error-message').classList.remove('hidden');
    }
});

document.getElementById('logout-button').addEventListener('click', () => {
    document.getElementById('admin-area').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
});
