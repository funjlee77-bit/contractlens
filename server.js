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
const GEMINI_UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Gemini 2.5 Flash', api_key_set: !!GEMINI_API_KEY });
});

// ── 텍스트 기반 번역 (텍스트 레이어 있는 PDF) ──────────────────
app.post('/api/translate-text', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: '텍스트가 비어있습니다.' });
    console.log('[Text mode] length:', text.length);

    const prompt = `아래는 계약서 원문입니다.\n\n${text}\n\n위 계약서를 분석하여 순수 JSON만 반환하세요 (마크다운 없이):\n{"detected_language":"언어명","title_original":"원문제목","title_ko":"한국어제목","sections":[{"type":"heading|subheading|article|clause|paragraph|table|signature","original":"원문","translation":"번역"}],"summary_ko":"핵심요약500자이내"}`;

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Gemini API 오류' });

    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Gemini raw]', raw.substring(0, 200));
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    try {
      return res.json(JSON.parse(raw));
    } catch(e) {
      console.error('[Parse error]', e.message);
      return res.status(500).json({ error: 'JSON 파싱 실패: ' + e.message });
    }
  } catch(err) {
    console.error('[Error]', err.message);
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
});

// ── 파일 업로드 번역 (스캔 PDF / 이미지) ────────────────────────
app.post('/api/translate-file', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });
  try {
    const { fileBase64, mimeType, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: '파일 데이터가 없습니다.' });

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    console.log('[File mode] mime:', mimeType, 'size:', fileBuffer.length, 'bytes');

    // 1단계: Gemini Files API에 파일 업로드
    const uploadRes = await fetch(`${GEMINI_UPLOAD}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'X-Goog-Upload-Header-Content-Length': fileBuffer.length
      },
      body: fileBuffer
    });

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      console.error('[Upload error]', errData);
      return res.status(uploadRes.status).json({ error: '파일 업로드 실패: ' + (errData.error?.message || uploadRes.status) });
    }

    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    if (!fileUri) return res.status(500).json({ error: '파일 URI를 받지 못했습니다.' });
    console.log('[File uploaded] uri:', fileUri);

    // 2단계: 번역 요청
    const prompt = '위 문서는 계약서입니다. 모든 텍스트를 OCR로 추출하고 한국어로 번역하여 순수 JSON만 반환하세요 (마크다운 없이):\n{"detected_language":"언어명","title_original":"원문제목","title_ko":"한국어제목","sections":[{"type":"heading|subheading|article|clause|paragraph|table|signature","original":"원문","translation":"번역"}],"summary_ko":"핵심요약500자이내"}';

    const genRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { fileData: { mimeType: mimeType, fileUri: fileUri } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
      })
    });

    const genData = await genRes.json();
    if (!genRes.ok) return res.status(genRes.status).json({ error: genData.error?.message || 'Gemini API 오류' });

    let raw = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Gemini raw]', raw.substring(0, 200));
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    try {
      return res.json(JSON.parse(raw));
    } catch(e) {
      console.error('[Parse error]', e.message);
      return res.status(500).json({ error: 'JSON 파싱 실패: ' + e.message });
    }
  } catch(err) {
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
