// Authentication Module - Simple localStorage-based auth
// Note: This is a demo implementation. For production, use proper backend authentication.

// Check if user is logged in
function isAuthenticated() {
    return localStorage.getItem('currentUser') !== null;
}

// Get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Login user
function loginUser(email, password) {
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        return { success: true, user };
    }
    return { success: false, error: 'Invalid email or password' };
}

// Signup user
function signupUser(email, password, name) {
    const users = getUsers();
    
    // Check if user already exists
    if (users.find(u => u.email === email)) {
        return { success: false, error: 'Email already registered' };
    }
    
    // Validate password
    if (password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
    }
    
    // Create new user
    const newUser = {
        id: Date.now().toString(),
        email: email,
        name: name || email.split('@')[0],
        createdAt: new Date().toISOString()
    };
    
    // Store user (in production, password should be hashed)
    users.push({
        ...newUser,
        password: password // In production, hash this!
    });
    
    saveUsers(users);
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    
    return { success: true, user: newUser };
}

// Logout user
function logoutUser() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

// Get all users from localStorage
function getUsers() {
    try {
        const usersStr = localStorage.getItem('users');
        return usersStr ? JSON.parse(usersStr) : [];
    } catch (e) {
        return [];
    }
}

// Save users to localStorage
function saveUsers(users) {
    try {
        localStorage.setItem('users', JSON.stringify(users));
    } catch (e) {
        console.error('Failed to save users:', e);
    }
}

// Require authentication for protected pages
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Redirect if already authenticated
function redirectIfAuthenticated() {
    if (isAuthenticated()) {
        window.location.href = 'index.html';
    }
}

