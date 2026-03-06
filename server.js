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
app.use(express.json({ limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Gemini 2.5 Flash', api_key_set: !!GEMINI_API_KEY });
});

// 텍스트 모드 (텍스트 레이어 있는 PDF)
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
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    try { return res.json(JSON.parse(raw)); }
    catch(e) { return res.status(500).json({ error: 'JSON 파싱 실패: ' + e.message }); }
  } catch(err) {
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
});

// 파일 모드 (스캔 PDF / 이미지) - Gemini Files API 사용
app.post('/api/translate-file', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64) return res.status(400).json({ error: '파일 데이터가 없습니다.' });

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    console.log('[File mode] mime:', mimeType, 'size:', fileBuffer.length);

    // multipart upload
    const boundary = '----FormBoundary' + Date.now();
    const metaJson = JSON.stringify({ file: { mimeType: mimeType } });
    const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metaJson}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const closing = `\r\n--${boundary}--`;

    const body = Buffer.concat([
      Buffer.from(metaPart, 'utf-8'),
      Buffer.from(filePart, 'utf-8'),
      fileBuffer,
      Buffer.from(closing, 'utf-8')
    ]);

    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': body.length
        },
        body: body
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      console.error('[Upload error]', JSON.stringify(uploadData));
      return res.status(uploadRes.status).json({ error: '파일 업로드 실패: ' + (uploadData.error?.message || uploadRes.status) });
    }

    const fileUri = uploadData.file?.uri;
    if (!fileUri) return res.status(500).json({ error: '파일 URI를 받지 못했습니다.' });
    console.log('[File uploaded] uri:', fileUri);

    const prompt = '위 문서는 계약서입니다. 모든 텍스트를 OCR로 추출하고 한국어로 번역하여 순수 JSON만 반환하세요 (마크다운 없이):\n{"detected_language":"언어명","title_original":"원문제목","title_ko":"한국어제목","sections":[{"type":"heading|subheading|article|clause|paragraph|table|signature","original":"원문","translation":"번역"}],"summary_ko":"핵심요약500자이내"}';

    const genRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { fileData: { mimeType: mimeType, fileUri: fileUri } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
      })
    });

    const genData = await genRes.json();
    if (!genRes.ok) return res.status(genRes.status).json({ error: genData.error?.message || 'Gemini API 오류' });

    let raw = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const m2 = raw.match(/\{[\s\S]*\}/);
    if (m2) raw = m2[0];
    try { return res.json(JSON.parse(raw)); }
    catch(e) { return res.status(500).json({ error: 'JSON 파싱 실패: ' + e.message }); }
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
