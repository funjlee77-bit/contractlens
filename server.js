require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
app.use(cors());

// 용량 제한 100mb로 증가
app.use(express.json({ limit: '100mb' }));

// body parse 에러 처리
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '파일이 너무 큽니다. 페이지 수를 줄여주세요.' });
  }
  next(err);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Gemini 2.5 Flash', api_key_set: !!GEMINI_API_KEY });
});

app.post('/api/translate', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }
  try {
    const { parts } = req.body;
    if (!parts || !Array.isArray(parts)) {
      return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
    }
    console.log('[Request] parts count:', parts.length);

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 16384 }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Gemini API error]', data.error?.message);
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API 오류' });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Gemini raw]', text.substring(0, 300));
    console.log('[Gemini length]', text.length);

    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) text = match[0];

    try {
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch(e) {
      console.error('[Parse error]', e.message);
      return res.status(500).json({ error: 'JSON 파싱 실패: ' + e.message });
    }
  } catch (err) {
    console.error('[Error]', err.message);
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ContractLens 서버 실행 중: http://localhost:${PORT}`);
  console.log(`API 키: ${GEMINI_API_KEY ? '정상' : '미설정'}`);
});
