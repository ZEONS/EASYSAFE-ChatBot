import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv, set_key

# .env 파일 로드
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

app = FastAPI(title="EASYSAFE NoteBot API")

# 데이터 및 경로 설정
NOTES_FILE = "notes.json"
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

# 시스템 프롬프트
SYSTEM_PROMPT = """당신은 사용자의 노트를 기반으로 답변하는 전문 AI 비서입니다.
반드시 아래 규칙을 지키세요:
1. 답변은 제공된 '등록된 노트 목록'의 내용에만 근거하여 작성하세요.
2. 노트에 없는 내용에 대해서는 "죄송합니다. 관련 내용을 노트에서 찾을 수 없습니다."라고 답변하세요.
3. 답변 내에 인용한 정보가 담긴 노트를 [노트 제목] 형태로 반드시 명시하세요.
4. 친절하고 명확한 한국어로 답변하세요.
"""

# 모델
class Note(BaseModel):
    id: Optional[str] = None
    title: str
    content: str
    date: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[dict]

# 헬퍼 함수
def load_notes():
    if not os.path.exists(NOTES_FILE):
        return {}
    with open(NOTES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_notes(notes):
    with open(NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(notes, f, ensure_ascii=False, indent=4)

def build_context(notes):
    parts = []
    for note in notes.values():
        parts.append(f"--- 노트: 「{note['title']}」 ---\n{note['content']}\n")
    return "\n".join(parts)

# API 엔드포인트
@app.get("/api/notes", response_model=List[Note])
async def get_notes():
    notes = load_notes()
    return [Note(id=k, **v) for k, v in notes.items()]

@app.post("/api/notes")
async def add_note(note: Note):
    notes = load_notes()
    note_id = str(uuid.uuid4())
    new_note = {
        "title": note.title,
        "content": note.content,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    notes[note_id] = new_note
    save_notes(notes)
    return {"id": note_id, **new_note}

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str):
    notes = load_notes()
    if note_id in notes:
        del notes[note_id]
        save_notes(notes)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Note not found")

@app.post("/api/chat")
async def chat(request: ChatRequest):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key is not set")
    
    notes = load_notes()
    context = build_context(notes)
    
    history_text = ""
    for msg in request.history[-10:]:
        role = "사용자" if msg["role"] == "user" else "AI"
        history_text += f"{role}: {msg['content']}\n"
    
    prompt = f"""## 등록된 노트 목록
{context}

## 이전 대화 기록
{history_text if history_text else "(없음)"}

## 현재 질문
{request.message}

위 노트의 내용에만 근거하여 답변하고, 반드시 [노트 제목] 형태로 출처를 밝히세요."""

    try:
        genai.configure(api_key=api_key)
        # 폴백 로직 적용
        target_models = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-pro"]
        
        last_error = ""
        for m_name in target_models:
            try:
                model = genai.GenerativeModel(model_name=m_name, system_instruction=SYSTEM_PROMPT)
                response = model.generate_content(prompt)
                return {"answer": response.text}
            except Exception as e:
                last_error = str(e)
                if "404" not in last_error:
                    raise e
                continue
        raise Exception(f"모든 모델 404: {last_error}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/models")
async def list_available_models():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"models": []}
    try:
        genai.configure(api_key=api_key)
        models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
        return {"models": models}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/settings/save")
async def save_settings(data: dict):
    api_key = data.get("api_key")
    if api_key:
        set_key(str(env_path), "GOOGLE_API_KEY", api_key)
        os.environ["GOOGLE_API_KEY"] = api_key
        return {"status": "success"}
    return {"status": "failed"}

# 정적 파일 서빙
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
