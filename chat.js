// Gemini Chat Integration - Separate Module
// 
// SETUP: Paste your GEMINI_API_KEY below (get from aistudio.google.com/apikey)
// SECURITY NOTE: Exposing keys in client-side JS is insecure - for demos only!

const GEMINI_API_KEY = 'AIzaSyDGxvbq77yxKyaNRpH02dyIwK67BDdrNcM';

// Chat state
let chatHistory = [];
const MAX_CHAT_HISTORY = 25;

// Gemini API Integration
async function callGemini(prompt) {
    // Use the generateContent REST endpoint
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    
    const body = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini request failed: ${response.status} ${error}`);
    }

    const json = await response.json();
    
    // Handle different response shapes
    if (json.candidates && json.candidates[0]?.content?.parts?.[0]?.text) {
        return json.candidates[0].content.parts[0].text;
    } else if (json.output && json.output[0]?.content?.[0]?.text) {
        return json.output[0].content[0].text;
    } else {
        throw new Error('Unexpected Gemini response format');
    }
}

// Chat Handler
async function handleChatSend() {
    const chatInput = document.getElementById('chatInput');
    const prompt = chatInput.value.trim();
    
    if (!prompt) return;

    // Add user message
    addChatMessage(prompt, 'user');
    chatInput.value = '';
    chatInput.disabled = true;
    
    const chatSendBtn = document.getElementById('chatSendBtn');
    chatSendBtn.disabled = true;

    // Show typing indicator
    const typingIndicator = document.getElementById('chatTyping');
    typingIndicator.style.display = 'block';

    try {
        const response = await callGemini(prompt);
        addChatMessage(response, 'bot');
        
        // Save to chat history
        chatHistory.push({ role: 'user', content: prompt });
        chatHistory.push({ role: 'assistant', content: response });
        
        // Trim history
        if (chatHistory.length > MAX_CHAT_HISTORY) {
            chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);
        }
        
        saveChatHistory();
    } catch (error) {
        console.error('Chat error:', error);
        addChatMessage(`Sorry, I encountered an error: ${error.message}`, 'bot');
    } finally {
        typingIndicator.style.display = 'none';
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
    }
}

function addChatMessage(text, role) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    messageDiv.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toggleChat() {
    const container = document.getElementById('chatContainer');
    if (container) {
        container.classList.toggle('collapsed');
    }
}

function saveChatHistory() {
    try {
        const userId = localStorage.getItem('currentUser');
        const key = userId ? `chatHistory_${userId}` : 'chatHistory';
        localStorage.setItem(key, JSON.stringify(chatHistory));
    } catch (e) {
        console.warn('Failed to save chat history:', e);
    }
}

function loadChatHistory() {
    try {
        const userId = localStorage.getItem('currentUser');
        const key = userId ? `chatHistory_${userId}` : 'chatHistory';
        const stored = localStorage.getItem(key);
        if (stored) {
            chatHistory = JSON.parse(stored);
            // Render chat history
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                messagesContainer.innerHTML = '<div class="message bot-message"><div class="message-content">Hello! I\'m your carbon footprint assistant. Ask me about emissions, tips to reduce your footprint, or anything related to sustainability.</div></div>';
                chatHistory.forEach(msg => {
                    if (msg.role === 'user' || msg.role === 'assistant') {
                        addChatMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
                    }
                });
            }
        }
    } catch (e) {
        console.warn('Failed to load chat history:', e);
    }
}

// Initialize chat when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatToggle = document.getElementById('chatToggle');
    
    if (chatInput && chatSendBtn) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleChatSend();
        });
        chatSendBtn.addEventListener('click', handleChatSend);
    }
    
    if (chatToggle) {
        chatToggle.addEventListener('click', toggleChat);
    }
    
    loadChatHistory();
});

