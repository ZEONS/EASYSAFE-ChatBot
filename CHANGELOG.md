# NoteBot 작업 내역

> 작성일: 2026-03-28

---

## 프로젝트 개요

**NoteBot** — FastAPI + Google Gemini API 기반 AI 지식 비서
업로드된 문서(PDF, Markdown, TXT)와 사용자 노트를 기반으로 질문에 답하는 챗봇

| 항목 | 내용 |
|------|------|
| Backend | FastAPI + Uvicorn (port 8001) |
| Frontend | Vanilla JS + CSS |
| AI | Google Gemini API (`google.generativeai`) |
| 서버 | AWS EC2 — Amazon Linux 2023 (`ec2-user@13.124.208.217`) |

---

## 작업 내역

### 1. Pencil MCP 디자인

`c:\Works\NoteBot\pencil-new.pen` 에 5개 화면 디자인

- **Main Chat** (1440×900 데스크탑)
- **Settings Modal**
- **Mobile View** (390×844)
- **File Upload Modal** — 드래그앤드롭 존 + 업로드 큐
- **New Note Modal** — 제목/내용/태그 입력

디자인 토큰:
```
--bg: #0F1117
--sidebar-bg: #13161F
--surface: #1A1D2E
--primary: #4D7EFF
--text-primary: #E2E4F0
--text-secondary: #8B90AD
--success: #22C55E
--danger: #EF4444
```

---

### 2. 전체 소스 리팩토링

Pencil 디자인 기준으로 `index.html`, `style.css`, `app.js`, `server.py` 전면 재작성

#### index.html
- 사이드바: 로고 + AI 배지, 지식 소스 목록, 하단 버튼 (새 노트 / 설정)
- 채팅 헤더: 인라인 모델 셀렉터 + 상태 배지 + 초기화 버튼
- 4개 모달: Settings, File Upload (드래그앤드롭), New Note (태그 입력), Delete Confirm
- Toast 컨테이너

#### style.css
- CSS 변수 시스템 전면 도입
- 노트 아이템, 메시지 버블(봇 아바타), 업로드 진행 바, 모델 카드, 태그 필, Toast, Chip 등 컴포넌트 스타일

#### app.js (380+ lines)
- `showToast(msg, type)` — `alert()` 전면 대체
- `openModal(id)` / `closeModal(id)` — `data-modal` 속성 기반 통합 모달 관리
- `renderNotes()` — 파일 타입별 아이콘 렌더링
- `sendMessage()` — `isSending` 플래그, 소스 태그 파싱
- `updateBotMessage()` — `[Source: ...]` / `[노트: ...]` 정규식 파싱 → `.source-tag` 렌더링
- `loadModels()` / `renderModelOptions()` — 라디오 카드 UI
- `uploadFileWithProgress()` — XHR progress 이벤트로 실시간 진행 바
- 태그 입력: Enter 키 추가, `.tag-pill` + 삭제 버튼
- AI 자동완성 버튼: `/api/chat` 호출로 노트 내용 자동 생성

#### server.py
- CORS 미들웨어 추가
- 파일 업로드 보안 강화: 경로 순회 방지, 50MB 크기 제한, 특수문자 치환

---

### 3. 사이드바 리사이즈 기능

긴 파일명이 잘려 보이는 문제 해결 — 사이드바 오른쪽 가장자리 드래그로 너비 조절

**index.html**
```html
<aside class="sidebar collapsed" id="sidebar">
    <div class="sidebar-resize-handle" id="sidebar-resize-handle"></div>
```

**style.css**
```css
.sidebar {
    transition: width 0.3s ease, opacity 0.3s ease;
    min-width: 180px;
    max-width: 520px;
    position: relative;
    flex-shrink: 0;
}
.sidebar.no-transition { transition: none; }
.sidebar.collapsed { width: 0; min-width: 0; opacity: 0; pointer-events: none; }

.sidebar-resize-handle {
    position: absolute; top: 0; right: 0;
    width: 5px; height: 100%;
    cursor: col-resize; z-index: 300;
}
.sidebar-resize-handle:hover,
.sidebar-resize-handle.dragging { background: var(--primary); opacity: 0.5; }
```

**app.js**
```javascript
resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    sidebar.classList.add('no-transition'); // 드래그 중 transition 비활성화
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const w = e.clientX;
    if (w >= 180 && w <= 520) sidebar.style.width = w + 'px';
});
document.addEventListener('mouseup', () => {
    isResizing = false;
    sidebar.classList.remove('no-transition');
    document.body.style.cursor = '';
});
```

---

### 4. 사이드바 슬라이드 토글

- 앱 시작 시 사이드바 기본값 → **닫힌 상태**
- 햄버거 버튼 클릭 시 슬라이드 애니메이션으로 열기/닫기
- 리사이즈 후 닫기 시 인라인 스타일 충돌 문제 해결 (너비 저장/복원)

```javascript
sidebarToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('collapsed')) {
        const savedWidth = sidebar.dataset.savedWidth || '270px';
        sidebar.classList.remove('collapsed');
        sidebar.style.width = savedWidth;
    } else {
        sidebar.dataset.savedWidth = sidebar.style.width || '270px';
        sidebar.style.width = '';
        sidebar.classList.add('collapsed');
    }
});
```

---

### 5. 파일 업로드 버그 수정

**원인**: `renderUploadQueue()`의 `forEach` 콜백에서 `idx` 파라미터 누락

```javascript
// 버그
pendingFiles.forEach((file) => {
    item.id = `upload-item-${idx}`; // idx = undefined

// 수정
pendingFiles.forEach((file, idx) => {
    item.id = `upload-item-${idx}`; // idx = 0, 1, 2...
```

---

### 6. AWS EC2 배포

```bash
# 접속
ssh -i ~/.ssh/zeons.pem ec2-user@13.124.208.217

# 파일 업로드
scp -i ~/.ssh/zeons.pem static/* ec2-user@13.124.208.217:~/notebot/static/
scp -i ~/.ssh/zeons.pem server.py ec2-user@13.124.208.217:~/notebot/

# 서버 재시작
sudo fuser -k 8001/tcp
cd ~/notebot && nohup python3 server.py > server.log 2>&1 &
```

**접속 주소**: http://13.124.208.217:8001

---

## 알려진 사항

- `google.generativeai` → `google.genai` 마이그레이션 권고 (FutureWarning, 동작에는 무관)
- Python 3.9 EOL 경고 — 추후 Python 3.11+ 업그레이드 권장
