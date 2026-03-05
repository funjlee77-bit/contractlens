# ContractLens — AI 계약서 번역 시스템
> 외국어 계약서를 AI로 자동 번역하여 Word/Excel 파일로 산출하는 웹 서비스

---

## 📁 폴더 구조

```
contractlens/
├── server.js          ← 백엔드 서버 (API 키 보관)
├── package.json
├── .env.example       ← 환경변수 예시 (복사해서 .env 생성)
└── public/
    └── index.html     ← 프론트엔드 앱
```

---

## 🚀 Render.com 무료 배포 방법 (5~10분)

### 1단계 — Anthropic API 키 발급

1. https://console.anthropic.com 접속 → 회원가입/로그인
2. 왼쪽 메뉴 "API Keys" → "Create Key"
3. 생성된 키 복사 (sk-ant-api03-... 형태)

---

### 2단계 — GitHub에 코드 올리기

1. https://github.com 로그인 → "New repository"
2. Repository name: `contractlens` → Create
3. 아래 명령어로 업로드:

```bash
cd contractlens
git init
git add .
git commit -m "ContractLens 초기 배포"
git branch -M main
git remote add origin https://github.com/본인계정/contractlens.git
git push -u origin main
```

> **주의**: `.env` 파일은 절대 GitHub에 올리지 마세요! (이미 .gitignore에 추가되어 있음)

---

### 3단계 — Render.com 배포

1. https://render.com 접속 → 무료 회원가입
2. Dashboard → **"New +"** → **"Web Service"**
3. GitHub 연결 → `contractlens` 저장소 선택
4. 아래 설정 입력:

| 항목 | 값 |
|------|-----|
| Name | contractlens |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

5. **"Environment Variables"** 섹션에서:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-본인키입력`

6. **"Create Web Service"** 클릭

---

### 4단계 — 배포 완료

약 2~3분 후 배포 완료. 주소는 아래 형태:
```
https://contractlens.onrender.com
```

이 URL을 누구에게나 공유하면 API 키 없이 바로 사용 가능합니다.

---

## 💡 로컬 테스트 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 파일 생성
cp .env.example .env
# .env 파일을 열어서 ANTHROPIC_API_KEY에 실제 키 입력

# 3. 서버 시작
npm start

# 4. 브라우저에서 http://localhost:3000 접속
```

---

## ⚠️ 비용 안내

- Render.com 호스팅: **무료** (월 750시간, 개인 사용에 충분)
- Anthropic API: 번역 1건당 약 **$0.01~0.05** (문서 길이에 따라 다름)
  - Claude claude-opus-4-5 기준: 입력 $15/M tokens, 출력 $75/M tokens
  - 일반 계약서 1건 = 약 5,000~20,000 tokens

---

## 🔒 보안 구조

```
사용자 브라우저
     ↓ (이미지 데이터 전송)
Render.com 서버 (server.js)   ← API 키는 여기에만 존재
     ↓ (API 키 + 데이터)
Anthropic Claude API
     ↓ (번역 결과)
사용자 브라우저 (Word/Excel 생성)
```

사용자는 API 키를 볼 수 없습니다.

---

## 📞 지원 언어

영어, 일본어, 중국어(간체/번체), 베트남어, 태국어, 인도네시아어, 독일어, 프랑스어 등
→ Claude가 자동으로 언어를 감지합니다.
