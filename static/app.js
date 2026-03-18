document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatContainer = document.getElementById('chat-container');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const notesList = document.getElementById('notes-list');
    const noteCount = document.getElementById('note-count');
    const newNoteBtn = document.getElementById('new-note-btn');
    const noteModal = document.getElementById('note-modal');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');
    const noteTitleInput = document.getElementById('note-title-input');
    const noteContentInput = document.getElementById('note-content-input');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const diagBtn = document.getElementById('diag-btn');
    const diagResult = document.getElementById('diag-result');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    let chatHistory = [];

    // --- API Calls ---

    async function fetchNotes() {
        try {
            const response = await fetch('/api/notes');
            const notes = await response.json();
            renderNotes(notes);
        } catch (error) {
            console.error('Error fetching notes:', error);
        }
    }

    function renderNotes(notes) {
        notesList.innerHTML = '';
        noteCount.textContent = notes.length;
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.innerHTML = `
                <div class="note-info">
                    <h4>${note.title}</h4>
                    <p>${note.date}</p>
                </div>
                <div class="note-actions">
                    <button class="icon-btn delete-note" data-id="${note.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-note')) return;
                // Open for edit if needed
            });
            notesList.appendChild(item);
        });

        // Delete Note listener
        document.querySelectorAll('.delete-note').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (confirm('정말로 이 노트를 삭제하시겠습니까?')) {
                    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
                    fetchNotes();
                }
            };
        });
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // User Message UI
        addMessage(text, 'user');
        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Bot Thinking UI
        const botMsgDiv = addMessage('...', 'bot', true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: chatHistory })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'API Error');
            }

            const data = await response.json();
            botMsgDiv.innerText = data.answer;
            chatHistory.push({ role: 'user', content: text });
            chatHistory.push({ role: 'bot', content: data.answer });
            chatContainer.scrollTo(0, chatContainer.scrollHeight);
        } catch (error) {
            botMsgDiv.innerHTML = `<span style="color: #ef4444;">오류: ${error.message}</span>`;
        }
    }

    function addMessage(text, role, isTemp = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerText = text;
        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTo(0, chatContainer.scrollHeight);
        
        // Remove welcome message if it exists
        const welcome = document.querySelector('.welcome-msg');
        if (welcome) welcome.remove();
        
        return msgDiv;
    }

    // --- Event Listeners ---

    sendBtn.onclick = sendMessage;
    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Auto-resize textarea
    chatInput.oninput = () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
    };

    newNoteBtn.onclick = () => {
        noteModal.classList.remove('hidden');
        noteTitleInput.focus();
    };

    cancelNoteBtn.onclick = () => {
        noteModal.classList.add('hidden');
        noteTitleInput.value = '';
        noteContentInput.value = '';
    };

    saveNoteBtn.onclick = async () => {
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        if (!title || !content) return;

        await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });

        cancelNoteBtn.click();
        fetchNotes();
    };

    settingsToggle.onclick = () => settingsPanel.classList.toggle('hidden');

    saveKeyBtn.onclick = async () => {
        const key = apiKeyInput.value.trim();
        if (!key) return;
        const response = await fetch('/api/settings/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key })
        });
        if (response.ok) alert('API 키가 저장되었습니다.');
    };

    diagBtn.onclick = async () => {
        diagResult.innerText = '목록 확인 중...';
        const response = await fetch('/api/models');
        const data = await response.json();
        if (data.models) {
            diagResult.innerHTML = `<strong>사용 가능:</strong><br>${data.models.join('<br>')}`;
        } else {
            diagResult.innerText = '확인 실패: ' + (data.error || '알 수 없는 오류');
        }
    };

    clearChatBtn.onclick = () => {
        chatContainer.innerHTML = '<div class="welcome-msg"><h2>대화가 초기화되었습니다.</h2></div>';
        chatHistory = [];
    };

    // Initialize
    fetchNotes();
});
