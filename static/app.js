document.addEventListener('DOMContentLoaded', () => {
    // Check if running via file:// protocol
    if (window.location.protocol === 'file:') {
        alert('주의: index.html 파일을 직접 실행하면 기능을 사용할 수 없습니다.\n\n터미널에서 "python server.py"를 실행한 후\nhttp://localhost:8001 주소로 접속해 주세요!');
    }

    // DOM Elements
    const chatContainer = document.getElementById('chat-container');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const notesList = document.getElementById('notes-list');
    const noteCount = document.getElementById('note-count');
    const newNoteBtn = document.getElementById('new-note-btn');
    const noteModal = document.getElementById('note-modal');
    const settingsModal = document.getElementById('settings-modal');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');
    const noteTitleInput = document.getElementById('note-title-input');
    const noteContentInput = document.getElementById('note-content-input');
    const settingsToggle = document.getElementById('settings-toggle');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    const modelSelect = document.getElementById('model-select');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const diagBtn = document.getElementById('diag-btn');
    const diagResult = document.getElementById('diag-result');
    const visibilityToggle = document.querySelector('.visibility-toggle');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const dropZone = document.getElementById('drop-zone');
    const fileUpload = document.getElementById('file-upload');

    let chatHistory = [];

    // --- API Calls ---

    async function fetchNotes() {
        try {
            const response = await fetch('/api/notes');
            if (!response.ok) throw new Error('서버 응답 오류');
            const notes = await response.json();
            renderNotes(notes);
        } catch (error) {
            console.error('Error fetching notes:', error);
            notesList.innerHTML = '<div class="error-msg">서버에 연결할 수 없습니다. server.py가 실행 중인지 확인하세요.</div>';
        }
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '업로드 실패');
            }
            await fetchNotes(); // Refresh list
        } catch (error) {
            alert(`업로드 오류 (${file.name}): ${error.message}`);
        }
    }

    async function fetchSettings() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();
            if (data.api_key) apiKeyInput.value = data.api_key;
            
            // Populate models and select default
            await loadModels(data.default_model);
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    }

    async function loadModels(selectedModel = '') {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data.models && data.models.length > 0) {
                modelSelect.innerHTML = data.models.map(m => 
                    `<option value="${m}" ${m === selectedModel ? 'selected' : ''}>${m}</option>`
                ).join('');
            } else {
                modelSelect.innerHTML = '<option value="">사용 가능한 모델 없음 (API Key 확인)</option>';
            }
        } catch (error) {
            modelSelect.innerHTML = '<option value="">모델 로딩 실패</option>';
        }
    }

    function renderNotes(notes) {
        notesList.innerHTML = '';
        noteCount.textContent = notes.length;
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            
            let iconClass = 'fa-sticky-note';
            const titleLower = note.title.toLowerCase();
            if (titleLower.endsWith('.pdf')) iconClass = 'fa-file-pdf';
            else if (titleLower.endsWith('.md')) iconClass = 'fa-file-code';
            else if (titleLower.endsWith('.txt')) iconClass = 'fa-file-alt';
            
            const isFile = note.type === 'file';
            
            // Escape title for data attribute
            const escapedTitle = note.title.replace(/"/g, '&quot;');
            
            item.innerHTML = `
                <div class="note-icon">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="note-info">
                    <h4>${note.title}</h4>
                    <p>${note.date} ${isFile ? '<span class="tag">파일</span>' : ''}</p>
                </div>
                <div class="note-actions">
                    <button class="icon-btn delete-note" data-id="${note.id}" data-type="${note.type}" data-title="${escapedTitle}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-note')) return;
            });
            notesList.appendChild(item);
        });

        // Delete Note listener
        document.querySelectorAll('.delete-note').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const type = btn.getAttribute('data-type');
                const title = btn.getAttribute('data-title');
                
                const deleteModal = document.getElementById('delete-modal');
                const confirmBtn = document.getElementById('confirm-delete-btn');
                const cancelBtn = document.getElementById('cancel-delete-btn');
                const confirmText = document.getElementById('delete-confirm-text');

                confirmText.innerText = `[${title}] 소스를 삭제하시겠습니까?`;
                deleteModal.classList.remove('hidden');

                confirmBtn.onclick = async () => {
                    deleteModal.classList.add('hidden');
                    try {
                        let url = `/api/notes/${id}`;
                        if (type === 'file') {
                            url = `/api/files/${encodeURIComponent(title)}`;
                        }
                        const response = await fetch(url, { method: 'DELETE' });
                        if (!response.ok) {
                            const err = await response.json();
                            throw new Error(err.detail || '삭제 실패');
                        }
                        await fetchNotes();
                    } catch (error) {
                        alert('오류: ' + error.message);
                    }
                };

                cancelBtn.onclick = () => deleteModal.classList.add('hidden');
            };
        });
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        chatInput.value = '';
        chatInput.style.height = 'auto';

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

    chatInput.oninput = () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
    };

    newNoteBtn.onclick = () => {
        noteModal.classList.remove('hidden');
        noteTitleInput.value = '';
        noteContentInput.value = '';
        noteTitleInput.focus();
    };

    saveNoteBtn.onclick = async () => {
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        
        if (!title || !content) {
            alert('제목과 내용을 모두 입력해 주세요.');
            return;
        }

        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '저장 실패');
            }

            noteModal.classList.add('hidden');
            await fetchNotes(); // 목록 새로고침
        } catch (error) {
            alert('오류: ' + error.message);
        }
    };

    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menu-toggle');

    function toggleSidebar() {
        sidebar.classList.toggle('hidden');
        const isHidden = sidebar.classList.contains('hidden');
        
        // 아이콘 및 타이틀 변경
        const icon = menuToggle.querySelector('i');
        if (isHidden) {
            icon.className = 'fas fa-chevron-right';
            menuToggle.title = '사이드바 펼치기';
        } else {
            icon.className = 'fas fa-chevron-left';
            menuToggle.title = '사이드바 접기';
        }
    }

    menuToggle.onclick = (e) => {
        e.stopPropagation();
        toggleSidebar();
    };

    cancelNoteBtn.onclick = () => noteModal.classList.add('hidden');

    settingsToggle.onclick = () => settingsModal.classList.remove('hidden');

    closeModalBtns.forEach(btn => {
        btn.onclick = () => {
            noteModal.classList.add('hidden');
            settingsModal.classList.add('hidden');
        };
    });

    // 외부 영역 클릭 시 닫기
    window.onclick = (e) => {
        if (e.target === noteModal) noteModal.classList.add('hidden');
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
        if (e.target === document.getElementById('delete-modal')) {
            document.getElementById('delete-modal').classList.add('hidden');
        }
    };

    visibilityToggle.onclick = () => {
        const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        apiKeyInput.setAttribute('type', type);
        visibilityToggle.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    };

    saveKeyBtn.onclick = async () => {
        const key = apiKeyInput.value.trim();
        const model = modelSelect.value;
        
        const response = await fetch('/api/settings/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, default_model: model })
        });
        
        if (response.ok) {
            alert('설정이 저장되었습니다.');
            settingsModal.classList.add('hidden');
            // Reload models in case API key changed
            loadModels(model);
        }
    };

    diagBtn.onclick = async () => {
        diagResult.style.display = 'block';
        diagResult.innerText = '연결 상태 확인 중...';
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data.models) {
                diagResult.innerHTML = `<strong>연결 성공!</strong><br>사용 가능 모델: ${data.models.length}개`;
                loadModels(modelSelect.value); // Refresh dropdown
            } else {
                diagResult.innerText = '오류: ' + (data.error || 'API 키를 확인하세요.');
                diagResult.style.color = '#ef4444';
            }
        } catch (e) {
            diagResult.innerText = '서버 연결 실패';
            diagResult.style.color = '#ef4444';
        }
    };

    clearChatBtn.onclick = () => {
        chatContainer.innerHTML = '<div class="welcome-msg"><h2>대화가 초기화되었습니다.</h2></div>';
        chatHistory = [];
    };

    dropZone.onclick = () => fileUpload.click();
    fileUpload.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => uploadFile(file));
        fileUpload.value = '';
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    };
    dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => uploadFile(file));
    };

    // Initialize
    fetchNotes();
    fetchSettings();
});
