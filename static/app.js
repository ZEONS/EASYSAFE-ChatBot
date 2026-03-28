document.addEventListener('DOMContentLoaded', () => {
    if (window.location.protocol === 'file:') {
        alert('주의: 직접 실행 불가.\n터미널에서 "python server.py" 실행 후 http://localhost:8001 로 접속하세요.');
        return;
    }

    // =============================================
    // DOM 요소
    // =============================================
    const chatContainer   = document.getElementById('chat-container');
    const chatInput       = document.getElementById('chat-input');
    const sendBtn         = document.getElementById('send-btn');
    const notesList       = document.getElementById('notes-list');
    const sourceCount     = document.getElementById('source-count');
    const modelSelect     = document.getElementById('model-select');
    const modelOptions    = document.getElementById('model-options');
    const clearChatBtn    = document.getElementById('clear-chat-btn');
    const sidebarToggle   = document.getElementById('sidebar-toggle');
    const sidebar         = document.getElementById('sidebar');

    // Settings Modal
    const settingsToggle  = document.getElementById('settings-toggle');
    const apiKeyInput     = document.getElementById('api-key-input');
    const visibilityToggle= document.getElementById('visibility-toggle');
    const saveKeyBtn      = document.getElementById('save-key-btn');
    const diagBtn         = document.getElementById('diag-btn');
    const diagResult      = document.getElementById('diag-result');
    const diagStatusPill  = document.getElementById('diag-status-pill');

    // Upload Modal
    const uploadOpenBtn   = document.getElementById('upload-open-btn');
    const dropZone        = document.getElementById('drop-zone');
    const fileUpload      = document.getElementById('file-upload');
    const uploadQueue     = document.getElementById('upload-queue');
    const uploadList      = document.getElementById('upload-list');
    const queueCount      = document.getElementById('queue-count');
    const startUploadBtn  = document.getElementById('start-upload-btn');

    // Note Modal
    const newNoteBtn        = document.getElementById('new-note-btn');
    const noteTitleInput    = document.getElementById('note-title-input');
    const noteContentInput  = document.getElementById('note-content-input');
    const saveNoteBtn       = document.getElementById('save-note-btn');
    const titleCharCount    = document.getElementById('title-char-count');
    const contentCharCount  = document.getElementById('content-char-count');
    const tagList           = document.getElementById('tag-list');
    const tagInputField     = document.getElementById('tag-input');
    const aiSuggestBtn      = document.getElementById('ai-suggest-btn');

    // Delete Modal
    const confirmDeleteBtn  = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn   = document.getElementById('cancel-delete-btn');
    const deleteConfirmText = document.getElementById('delete-confirm-text');

    // =============================================
    // 상태 변수
    // =============================================
    let chatHistory   = [];
    let isSending     = false;
    let pendingFiles  = [];      // 업로드 대기 파일 목록
    let noteTags      = [];      // 현재 노트 태그 목록
    let selectedModel = '';      // 현재 선택된 모델
    let deleteTarget  = null;    // { id, type, title }

    // =============================================
    // 토스트 알림
    // =============================================
    function showToast(msg, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type]} toast-icon"></i><span class="toast-msg">${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // =============================================
    // 모달 열기 / 닫기
    // =============================================
    function openModal(id) {
        document.getElementById(id).classList.remove('hidden');
    }

    function closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    }

    // 모든 닫기 버튼 (modal-close-btn, data-modal 속성)
    document.querySelectorAll('[data-modal]').forEach(el => {
        el.addEventListener('click', () => {
            const modalId = el.getAttribute('data-modal');
            if (modalId) closeModal(modalId);
        });
    });

    // =============================================
    // 사이드바 토글
    // =============================================
    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = sidebar.classList.contains('collapsed');
        if (isCollapsed) {
            // 열기: 저장된 너비 복원 후 클래스 제거
            const savedWidth = sidebar.dataset.savedWidth || '270px';
            sidebar.classList.remove('collapsed');
            sidebar.style.width = savedWidth;
        } else {
            // 닫기: 현재 너비 저장 후 인라인 스타일 제거하고 클래스 추가
            sidebar.dataset.savedWidth = sidebar.style.width || '270px';
            sidebar.style.width = '';
            sidebar.classList.add('collapsed');
        }
    });

    // =============================================
    // 사이드바 리사이즈
    // =============================================
    const resizeHandle = document.getElementById('sidebar-resize-handle');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('dragging');
        sidebar.classList.add('no-transition');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 180 && newWidth <= 520) {
            sidebar.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.classList.remove('dragging');
        sidebar.classList.remove('no-transition');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    // =============================================
    // API 호출 — 노트/파일 목록 조회
    // =============================================
    async function fetchNotes() {
        try {
            const res = await fetch('/api/notes');
            if (!res.ok) throw new Error('서버 응답 오류');
            const notes = await res.json();
            renderNotes(notes);
        } catch {
            notesList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">서버에 연결할 수 없습니다.</div>';
        }
    }

    function renderNotes(notes) {
        notesList.innerHTML = '';
        sourceCount.textContent = notes.length;

        if (notes.length === 0) {
            notesList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 4px">파일을 업로드하거나 노트를 추가하세요.</div>';
            return;
        }

        notes.forEach(note => {
            const ext = note.title.split('.').pop().toLowerCase();
            let iconClass = 'fa-sticky-note';
            let typeClass = 'note';
            let meta = note.date || '';

            if (ext === 'pdf')  { iconClass = 'fa-file-pdf';  typeClass = 'pdf';  meta = `PDF · ${note.date}`; }
            else if (ext === 'md')   { iconClass = 'fa-file-code'; typeClass = 'md';   meta = `Markdown · ${note.date}`; }
            else if (ext === 'txt')  { iconClass = 'fa-file-alt';  typeClass = 'txt';  meta = `TXT · ${note.date}`; }

            const item = document.createElement('div');
            item.className = 'note-item';
            item.dataset.id = note.id;
            item.dataset.type = note.type;
            item.dataset.title = note.title;
            item.innerHTML = `
                <div class="note-item-icon ${typeClass}"><i class="fas ${iconClass}"></i></div>
                <div class="note-item-info">
                    <div class="note-item-name" title="${note.title}">${note.title}</div>
                    <div class="note-item-meta">${meta}</div>
                </div>
                <button class="note-delete-btn" title="삭제"><i class="fas fa-trash"></i></button>
            `;
            item.querySelector('.note-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteConfirm(note.id, note.type, note.title);
            });
            notesList.appendChild(item);
        });
    }

    // =============================================
    // 삭제 확인 모달
    // =============================================
    function openDeleteConfirm(id, type, title) {
        deleteTarget = { id, type, title };
        deleteConfirmText.textContent = `[${title}] 를 삭제하시겠습니까?`;
        openModal('delete-modal');
    }

    cancelDeleteBtn.addEventListener('click', () => closeModal('delete-modal'));

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!deleteTarget) return;
        closeModal('delete-modal');
        const { id, type, title } = deleteTarget;
        try {
            const url = type === 'file'
                ? `/api/files/${encodeURIComponent(title)}`
                : `/api/notes/${id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '삭제 실패');
            }
            showToast(`"${title}" 삭제 완료`, 'success');
            await fetchNotes();
        } catch (err) {
            showToast('삭제 오류: ' + err.message, 'error');
        }
        deleteTarget = null;
    });

    // =============================================
    // 채팅 전송
    // =============================================
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
    });

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isSending) return;

        isSending = true;
        sendBtn.disabled = true;
        chatInput.value = '';
        chatInput.style.height = 'auto';

        hideWelcome();
        addMessage(text, 'user');
        const loadingRow = addMessage('답변을 생성하는 중...', 'bot', true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: chatHistory })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'API 오류');
            }
            const data = await res.json();
            updateBotMessage(loadingRow, data.answer);
            chatHistory.push({ role: 'user', content: text });
            chatHistory.push({ role: 'bot',  content: data.answer });
            if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
        } catch (err) {
            updateBotMessage(loadingRow, null, err.message);
        } finally {
            isSending = false;
            sendBtn.disabled = false;
            chatContainer.scrollTo(0, chatContainer.scrollHeight);
        }
    }

    function hideWelcome() {
        const w = document.getElementById('welcome-msg');
        if (w) w.remove();
    }

    function addMessage(text, role, isLoading = false) {
        const row = document.createElement('div');
        row.className = `message-row ${role}`;

        const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        if (role === 'bot') {
            const avatar = document.createElement('div');
            avatar.className = 'bot-avatar';
            avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

            const wrap = document.createElement('div');
            wrap.className = 'msg-bubble-wrap';

            const bubble = document.createElement('div');
            bubble.className = isLoading ? 'msg-bubble loading' : 'msg-bubble';
            bubble.textContent = text;

            const time = document.createElement('span');
            time.className = 'msg-time';
            time.textContent = now;

            wrap.appendChild(bubble);
            wrap.appendChild(time);
            row.appendChild(avatar);
            row.appendChild(wrap);
        } else {
            const wrap = document.createElement('div');
            wrap.className = 'msg-bubble-wrap';

            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble';
            bubble.textContent = text;

            const time = document.createElement('span');
            time.className = 'msg-time';
            time.textContent = now;

            wrap.appendChild(bubble);
            wrap.appendChild(time);
            row.appendChild(wrap);
        }

        chatContainer.appendChild(row);
        chatContainer.scrollTo(0, chatContainer.scrollHeight);
        return row;
    }

    function updateBotMessage(row, text, errorMsg = null) {
        const wrap = row.querySelector('.msg-bubble-wrap');
        const bubble = row.querySelector('.msg-bubble');

        if (errorMsg) {
            bubble.className = 'msg-bubble error';
            bubble.textContent = '오류: ' + errorMsg;
            return;
        }

        bubble.className = 'msg-bubble';

        // 출처 태그 파싱: [Source: ...] 또는 [노트: ...]
        const sourceRegex = /\[(?:Source|노트):\s*([^\]]+)\]/g;
        const sources = [];
        let match;
        while ((match = sourceRegex.exec(text)) !== null) {
            sources.push(match[1].trim());
        }
        const cleanText = text.replace(sourceRegex, '').trim();

        bubble.textContent = cleanText;

        if (sources.length > 0) {
            const tagsWrap = document.createElement('div');
            tagsWrap.className = 'source-tags';
            sources.forEach(src => {
                const tag = document.createElement('span');
                tag.className = 'source-tag';
                tag.innerHTML = `<i class="fas fa-file-text"></i> 출처: ${src}`;
                tagsWrap.appendChild(tag);
            });
            wrap.insertBefore(tagsWrap, wrap.querySelector('.msg-time'));
        }
    }

    // =============================================
    // 대화 초기화
    // =============================================
    clearChatBtn.addEventListener('click', () => {
        chatContainer.innerHTML = '';
        chatHistory = [];
        const welcome = document.createElement('div');
        welcome.id = 'welcome-msg';
        welcome.className = 'welcome-msg';
        welcome.innerHTML = `
            <div class="welcome-icon"><i class="fa-solid fa-robot"></i></div>
            <h2>대화가 초기화되었습니다.</h2>
            <p>새로운 질문을 시작해보세요.</p>`;
        chatContainer.appendChild(welcome);
        setupWelcomeChips();
    });

    // =============================================
    // 제안 칩
    // =============================================
    function setupSuggestionChips() {
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.getAttribute('data-text') || chip.textContent.trim();
                chatInput.value = text;
                chatInput.focus();
                chatInput.dispatchEvent(new Event('input'));
            });
        });
    }

    function setupWelcomeChips() {
        document.querySelectorAll('#welcome-msg .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.getAttribute('data-text') || chip.textContent.trim();
                chatInput.value = text;
                chatInput.focus();
                chatInput.dispatchEvent(new Event('input'));
            });
        });
    }

    setupSuggestionChips();
    setupWelcomeChips();

    // =============================================
    // 설정 모달
    // =============================================
    settingsToggle.addEventListener('click', () => {
        apiKeyInput.setAttribute('type', 'password');
        document.querySelector('#visibility-toggle i').className = 'fas fa-eye-slash';
        openModal('settings-modal');
    });

    visibilityToggle.addEventListener('click', () => {
        const isPass = apiKeyInput.type === 'password';
        apiKeyInput.type = isPass ? 'text' : 'password';
        document.querySelector('#visibility-toggle i').className = isPass ? 'fas fa-eye' : 'fas fa-eye-slash';
    });

    saveKeyBtn.addEventListener('click', async () => {
        const key   = apiKeyInput.value.trim();
        const model = selectedModel || modelSelect.value;
        try {
            const res = await fetch('/api/settings/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key, default_model: model })
            });
            if (!res.ok) throw new Error('저장 실패');
            closeModal('settings-modal');
            showToast('설정이 저장되었습니다.', 'success');
            await loadModels(model);
            updateStatusBadge(true);
        } catch (err) {
            showToast('저장 오류: ' + err.message, 'error');
        }
    });

    diagBtn.addEventListener('click', async () => {
        diagBtn.querySelector('span').textContent = '확인 중...';
        diagStatusPill.className = 'diag-status-pill hidden';
        diagResult.classList.add('hidden');

        try {
            const res  = await fetch('/api/models');
            const data = await res.json();
            if (data.models && data.models.length > 0) {
                diagStatusPill.textContent = '정상';
                diagStatusPill.className = 'diag-status-pill ok';
                diagResult.textContent = `연결 성공! 사용 가능 모델: ${data.models.length}개`;
                diagResult.classList.remove('hidden');
                await loadModels(selectedModel);
                updateStatusBadge(true);
            } else {
                throw new Error(data.error || 'API 키를 확인하세요.');
            }
        } catch (err) {
            diagStatusPill.textContent = '오류';
            diagStatusPill.className = 'diag-status-pill err';
            diagResult.textContent = '연결 실패: ' + err.message;
            diagResult.classList.remove('hidden');
            updateStatusBadge(false);
        }
        diagBtn.querySelector('span').textContent = 'API 연결 상태 확인';
    });

    function updateStatusBadge(ok) {
        const badge = document.getElementById('status-badge');
        const text  = document.getElementById('status-text');
        if (ok) {
            badge.className = 'status-badge';
            text.textContent = '연결됨';
        } else {
            badge.className = 'status-badge error';
            text.textContent = '연결 오류';
        }
    }

    // =============================================
    // 모델 로드 & 선택
    // =============================================
    async function fetchSettings() {
        try {
            const res  = await fetch('/api/settings');
            const data = await res.json();
            if (data.api_key) apiKeyInput.value = data.api_key;
            await loadModels(data.default_model || '');
        } catch { /* ignore */ }
    }

    async function loadModels(currentModel = '') {
        try {
            const res  = await fetch('/api/models');
            const data = await res.json();
            const models = data.models || [];

            // Header select 업데이트
            if (models.length > 0) {
                modelSelect.innerHTML = models.map(m =>
                    `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`
                ).join('');
                selectedModel = currentModel || models[0];
                modelSelect.value = selectedModel;
            } else {
                modelSelect.innerHTML = '<option value="">모델 없음 (API Key 확인)</option>';
            }

            // 설정 모달 라디오 카드 렌더링
            renderModelOptions(models, currentModel || (models[0] || ''));
        } catch {
            modelSelect.innerHTML = '<option value="">모델 로딩 실패</option>';
        }
    }

    function renderModelOptions(models, current) {
        if (!modelOptions) return;
        if (models.length === 0) {
            modelOptions.innerHTML = '<div class="model-loading">API 키를 입력하면 모델 목록이 표시됩니다.</div>';
            return;
        }

        const descMap = {
            'gemini-2.0-flash':        '빠른 응답 · 추천',
            'gemini-flash-latest':     '빠른 응답 · 최신',
            'gemini-1.5-flash':        '균형 잡힌 성능',
            'gemini-1.5-pro':          '높은 정확도',
            'gemini-pro-latest':       '최고 성능 · 느림',
        };

        modelOptions.innerHTML = '';
        models.forEach(m => {
            const div = document.createElement('div');
            div.className = 'model-option' + (m === current ? ' selected' : '');
            div.dataset.model = m;
            div.innerHTML = `
                <div class="model-dot"></div>
                <div class="model-option-info">
                    <div class="model-option-name">${m}</div>
                    <div class="model-option-desc">${descMap[m] || '사용 가능'}</div>
                </div>
                ${m === current ? '<span class="model-selected-badge">선택됨</span>' : ''}
            `;
            div.addEventListener('click', () => {
                document.querySelectorAll('.model-option').forEach(el => {
                    el.classList.remove('selected');
                    el.querySelector('.model-selected-badge')?.remove();
                });
                div.classList.add('selected');
                const badge = document.createElement('span');
                badge.className = 'model-selected-badge';
                badge.textContent = '선택됨';
                div.appendChild(badge);
                selectedModel = m;
                modelSelect.value = m;
            });
            modelOptions.appendChild(div);
        });
    }

    modelSelect.addEventListener('change', () => {
        selectedModel = modelSelect.value;
        renderModelOptions(
            Array.from(modelSelect.options).map(o => o.value),
            selectedModel
        );
    });

    // =============================================
    // 파일 업로드 모달
    // =============================================
    uploadOpenBtn.addEventListener('click', () => {
        pendingFiles = [];
        uploadQueue.classList.add('hidden');
        startUploadBtn.disabled = true;
        openModal('upload-modal');
    });

    dropZone.addEventListener('click', () => fileUpload.click());

    fileUpload.addEventListener('change', (e) => {
        addFilesToQueue(Array.from(e.target.files));
        fileUpload.value = '';
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        addFilesToQueue(Array.from(e.dataTransfer.files));
    });

    function addFilesToQueue(files) {
        const allowed = ['.md', '.txt', '.pdf'];
        const valid = files.filter(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            return allowed.includes(ext);
        });
        const invalid = files.length - valid.length;
        if (invalid > 0) showToast(`${invalid}개 파일은 지원하지 않는 형식입니다.`, 'error');
        if (valid.length === 0) return;

        pendingFiles.push(...valid);
        renderUploadQueue();
        uploadQueue.classList.remove('hidden');
        startUploadBtn.disabled = false;
    }

    function renderUploadQueue() {
        queueCount.textContent = pendingFiles.length;
        uploadList.innerHTML = '';
        pendingFiles.forEach((file, idx) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const iconMap = { pdf: 'fa-file-pdf', md: 'fa-file-code', txt: 'fa-file-alt' };
            const sizeStr = file.size > 1024*1024
                ? (file.size / (1024*1024)).toFixed(1) + ' MB'
                : (file.size / 1024).toFixed(0) + ' KB';

            const item = document.createElement('div');
            item.className = 'upload-item';
            item.id = `upload-item-${idx}`;
            item.innerHTML = `
                <div class="upload-item-row">
                    <div class="upload-item-icon"><i class="fas ${iconMap[ext] || 'fa-file'}"></i></div>
                    <div class="upload-item-info">
                        <div class="upload-item-name">${file.name}</div>
                        <div class="upload-item-status">${sizeStr} · 대기 중</div>
                    </div>
                    <div class="upload-item-right">—</div>
                </div>
                <div class="upload-progress-bar hidden"><div class="upload-progress-fill" style="width:0%"></div></div>
            `;
            uploadList.appendChild(item);
        });
    }

    startUploadBtn.addEventListener('click', async () => {
        if (pendingFiles.length === 0) return;
        startUploadBtn.disabled = true;

        let successCount = 0;
        for (let i = 0; i < pendingFiles.length; i++) {
            const file = pendingFiles[i];
            const itemEl = document.getElementById(`upload-item-${i}`);
            if (!itemEl) continue;

            // Loading 상태
            itemEl.className = 'upload-item loading';
            itemEl.querySelector('.upload-item-status').textContent = '업로드 중...';
            itemEl.querySelector('.upload-progress-bar').classList.remove('hidden');

            await uploadFileWithProgress(file, itemEl);
            const isOk = itemEl.classList.contains('done');
            if (isOk) successCount++;
        }

        await fetchNotes();
        if (successCount > 0) showToast(`${successCount}개 파일 업로드 완료`, 'success');

        setTimeout(() => closeModal('upload-modal'), 1200);
        pendingFiles = [];
    });

    async function uploadFileWithProgress(file, itemEl) {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    const fill = itemEl.querySelector('.upload-progress-fill');
                    const right = itemEl.querySelector('.upload-item-right');
                    if (fill)  fill.style.width = pct + '%';
                    if (right) right.textContent = pct + '%';
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    itemEl.className = 'upload-item done';
                    itemEl.querySelector('.upload-item-status').textContent = '업로드 완료';
                    itemEl.querySelector('.upload-item-right').innerHTML = '<i class="fas fa-circle-check"></i>';
                } else {
                    let errMsg = '업로드 실패';
                    try { errMsg = JSON.parse(xhr.responseText).detail || errMsg; } catch {}
                    itemEl.className = 'upload-item error';
                    itemEl.querySelector('.upload-item-status').textContent = errMsg;
                    itemEl.querySelector('.upload-item-right').innerHTML = '<i class="fas fa-circle-xmark"></i>';
                }
                resolve();
            });

            xhr.addEventListener('error', () => {
                itemEl.className = 'upload-item error';
                itemEl.querySelector('.upload-item-status').textContent = '네트워크 오류';
                itemEl.querySelector('.upload-item-right').innerHTML = '<i class="fas fa-circle-xmark"></i>';
                resolve();
            });

            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        });
    }

    // =============================================
    // 새 노트 작성 모달
    // =============================================
    newNoteBtn.addEventListener('click', () => {
        noteTitleInput.value = '';
        noteContentInput.value = '';
        noteTags = [];
        tagList.innerHTML = '';
        tagInputField.value = '';
        titleCharCount.textContent = '0/100';
        contentCharCount.textContent = '0 / 5000자';
        openModal('note-modal');
        noteTitleInput.focus();
    });

    noteTitleInput.addEventListener('input', () => {
        titleCharCount.textContent = `${noteTitleInput.value.length}/100`;
    });

    noteContentInput.addEventListener('input', () => {
        contentCharCount.textContent = `${noteContentInput.value.length} / 5000자`;
    });

    // 태그 입력
    tagInputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = tagInputField.value.trim().replace(/,/g, '');
            if (tag && !noteTags.includes(tag)) {
                noteTags.push(tag);
                renderTags();
            }
            tagInputField.value = '';
        }
    });

    function renderTags() {
        tagList.innerHTML = '';
        noteTags.forEach((tag, i) => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.innerHTML = `${tag}<span class="tag-pill-remove" data-i="${i}"><i class="fas fa-times"></i></span>`;
            pill.querySelector('.tag-pill-remove').addEventListener('click', () => {
                noteTags.splice(i, 1);
                renderTags();
            });
            tagList.appendChild(pill);
        });
    }

    // AI 자동완성
    aiSuggestBtn.addEventListener('click', async () => {
        const title = noteTitleInput.value.trim();
        if (!title) { showToast('제목을 먼저 입력하세요.', 'info'); return; }
        aiSuggestBtn.disabled = true;
        aiSuggestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...';
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `"${title}"에 관한 노트 내용을 작성해줘. 간결하게 핵심 내용만.`, history: [] })
            });
            const data = await res.json();
            if (data.answer) {
                noteContentInput.value = data.answer.replace(/\[(?:Source|노트):[^\]]+\]/g, '').trim();
                noteContentInput.dispatchEvent(new Event('input'));
            }
        } catch { showToast('자동완성 실패', 'error'); }
        finally {
            aiSuggestBtn.disabled = false;
            aiSuggestBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> AI 자동완성';
        }
    });

    saveNoteBtn.addEventListener('click', async () => {
        const title   = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        if (!title)   { showToast('제목을 입력해 주세요.', 'info'); return; }
        if (!content) { showToast('내용을 입력해 주세요.', 'info'); return; }

        const tagLine = noteTags.length > 0 ? `\n\n태그: ${noteTags.join(', ')}` : '';
        const fullContent = content + tagLine;

        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: fullContent })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '저장 실패');
            }
            closeModal('note-modal');
            showToast(`"${title}" 노트 저장 완료`, 'success');
            await fetchNotes();
        } catch (err) {
            showToast('저장 오류: ' + err.message, 'error');
        }
    });

    // =============================================
    // 초기화
    // =============================================
    fetchNotes();
    fetchSettings();
});
