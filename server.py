import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv, set_key
import fitz  # PyMuPDF
import shutil

# .env 파일 로드
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

app = FastAPI(title="EASYSAFE NoteBot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터 및 경로 설정
BASE_DIR = Path(__file__).parent
NOTES_FILE = BASE_DIR / "notes.json"
NOTES_DIR = BASE_DIR / "my_notes"
NOTES_DIR.mkdir(exist_ok=True)
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

# 기본 모델 설정
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gemini-1.5-flash")

# 시스템 프롬프트
SYSTEM_PROMPT = """당신은 사용자의 개인 지식 베이스를 기반으로 답변하는 전문 조수입니다.
도시락, 위생, 안전 등 서비스와 관련된 정보는 제공된 컨텍스트를 기반으로 답변하세요.
반드시 아래 규칙을 지키세요:
1. 제공된 <Context> 및 '등록된 노트' 내용에만 근거하여 답변하세요.
2. 정보가 충분하지 않거나 내용이 없으면 "노트에서 관련 정보를 찾을 수 없습니다."라고 정직하게 답변하세요.
3. 답변 끝에 반드시 해당 정보의 출처 파일명 또는 노트 제목을 [Source: 파일명] 또는 [노트: 제목] 형태로 명시하세요.
4. 모든 답변은 친절하고 정중한 한국어로 작성하세요.
5. 외부 지식을 섞지 마세요."""

# 모델
class Note(BaseModel):
    id: Optional[str] = None
    title: str
    content: str
    date: Optional[str] = None
    type: Optional[str] = "json"

class ChatRequest(BaseModel):
    message: str
    history: List[dict]

# 헬퍼 함수
def migrate_json_to_files():
    """notes.json의 데이터를 my_notes/ 폴더 내 .md 파일로 마이그레이션."""
    if os.path.exists(NOTES_FILE):
        try:
            with open(NOTES_FILE, "r", encoding="utf-8") as f:
                json_data = json.load(f)
            
            if json_data:
                migration_path = NOTES_DIR / "legacy_notes_migrated.md"
                content_parts = ["# Migrated Notes from JSON\n"]
                for k, v in json_data.items():
                    content_parts.append(f"## {v.get('title', 'No Title')}\n{v.get('content', '')}\n\n---\n")
                
                with open(migration_path, "w", encoding="utf-8") as f:
                    f.write("\n".join(content_parts))
                
                # 아카이빙 (이름 변경)
                os.rename(NOTES_FILE, str(NOTES_FILE) + ".bak")
                print(f"Migration complete: {migration_path}")
        except Exception as e:
            print(f"Migration error: {e}")

# 시작 시 마이그레이션 수행
if not os.path.exists(str(NOTES_FILE) + ".bak"):
    migrate_json_to_files()

def load_notes():
    """./my_notes/ 폴더의 파일들만 취합하여 반환 (폴더 기반 단일화)."""
    all_notes = {}
    
    # 폴더 내 파일 로드 (.md, .txt, .pdf)
    if NOTES_DIR.exists():
        for file_path in NOTES_DIR.glob("*"):
            ext = file_path.suffix.lower()
            if ext in [".md", ".txt"]:
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        all_notes[file_path.name] = {
                            "title": file_path.name,
                            "content": f.read(),
                            "date": datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
                            "type": "file"
                        }
                except:
                    pass
            elif ext == ".pdf":
                try:
                    doc = fitz.open(file_path)
                    content = "".join([page.get_text() for page in doc])
                    doc.close() # Close to release file handle
                    
                    # 텍스트가 없더라도 목록에 표시 (투명성 확보)
                    display_content = content if content.strip() else "(텍스트가 없는 PDF 문서입니다 - OCR 불필요 시 제외 가능)"
                    all_notes[file_path.name] = {
                        "title": file_path.name,
                        "content": display_content,
                        "date": datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
                        "type": "file"
                    }
                except Exception as e:
                    print(f"PDF loading error ({file_path.name}): {e}")
                    
    return all_notes

def build_context(notes):
    parts = []
    for name, note in notes.items():
        source_label = f"Source: {name}" if note.get("type") == "file" else f"노트: {note.get('title')}"
        parts.append(f"[{source_label}]\n{note['content']}\n")
    return "\n\n".join(parts)

# API 엔드포인트
@app.get("/api/notes")
async def get_notes():
    notes = load_notes()
    result = []
    for k, v in notes.items():
        result.append({"id": k, **v})
    return result

@app.post("/api/notes")
async def save_note(note: Note):
    # 제목에서 특수문자 제거 (안전한 파일명 생성)
    import re
    safe_title = re.sub(r'[\\/*?:"<>|]', "", note.title).strip()
    if not safe_title:
        safe_title = "Untitled"
    
    # .md 확장자 추가
    filename = f"{safe_title}.md"
    file_path = NOTES_DIR / filename
    
    # 파일명 중복 시 (1), (2) 등 추가
    counter = 1
    while file_path.exists():
        filename = f"{safe_title} ({counter}).md"
        file_path = NOTES_DIR / filename
        counter += 1
        
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(note.content)
        return {"id": filename, "status": "success", "title": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: ChatRequest):
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key is not set")
    
    notes = load_notes()
    context = build_context(notes)
    
    history_text = ""
    for msg in request.history[-10:]:
        role = "사용자" if msg["role"] == "user" else "AI"
        history_text += f"{role}: {msg['content']}\n"
    
    full_prompt = f"""<Context>
{context}
</Context>

<History>
{history_text if history_text else "(없음)"}
</History>

질문: {request.message}"""

    try:
        genai.configure(api_key=api_key)
        target_models = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro-latest"]
        
        last_error = ""
        for m_name in target_models:
            try:
                model = genai.GenerativeModel(model_name=m_name, system_instruction=SYSTEM_PROMPT)
                response = model.generate_content(full_prompt)
                return {"answer": response.text}
            except Exception as e:
                last_error = str(e)
                continue
        raise Exception(f"사용 가능한 모델을 찾을 수 없습니다: {last_error}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/models")
async def list_available_models():
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"models": []}
    try:
        genai.configure(api_key=api_key)
        models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
        return {"models": models}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in [".md", ".txt", ".pdf"]:
        raise HTTPException(status_code=400, detail="지원되지 않는 파일 형식입니다. (.md, .txt, .pdf만 가능)")

    MAX_SIZE = 50 * 1024 * 1024  # 50MB
    contents: bytes = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="파일 크기가 50MB를 초과합니다.")

    import re
    safe_name = re.sub(r'[\\/*?:"<>|]', "_", file.filename).strip()
    file_path = (NOTES_DIR / safe_name).resolve()
    if not str(file_path).startswith(str(NOTES_DIR.resolve())):
        raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다.")

    try:
        with file_path.open("wb") as buffer:
            buffer.write(contents)
        return {"filename": safe_name, "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settings")
async def get_settings():
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
    return {
        "api_key": api_key,
        "default_model": DEFAULT_MODEL
    }

@app.post("/api/settings/save")
async def save_settings(data: dict):
    api_key = data.get("api_key")
    default_model = data.get("default_model")
    
    if api_key:
        api_key = api_key.strip()
        set_key(str(env_path), "GEMINI_API_KEY", api_key)
        os.environ["GEMINI_API_KEY"] = api_key
    
    if default_model:
        set_key(str(env_path), "DEFAULT_MODEL", default_model)
        os.environ["DEFAULT_MODEL"] = default_model
        global DEFAULT_MODEL
        DEFAULT_MODEL = default_model
        
    return {"status": "success"}

@app.delete("/api/files/{filename:path}")
async def delete_file(filename: str):
    from urllib.parse import unquote
    decoded_name = unquote(filename)
    file_path = NOTES_DIR / decoded_name
    
    print(f"--- Delete Request Received ---")
    print(f"Input: {filename}")
    print(f"Decoded: {decoded_name}")
    print(f"Path: {file_path}")
    print(f"Exists: {file_path.exists()}")
    
    if file_path.exists():
        try:
            os.remove(file_path)
            print("Status: SUCCESS")
            return {"status": "success"}
        except Exception as e:
            print(f"Status: ERROR - {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    print("Status: NOT FOUND")
    raise HTTPException(status_code=404, detail="File not found")

# 루트 경로("/") 처리: index.html 반환 (캐시 방지 헤더 추가)
@app.get("/")
async def read_index():
    return FileResponse(
        str(STATIC_DIR / "index.html"),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
    )

# 정적 파일 서빙: /static 서브디렉토리로 마운트
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
