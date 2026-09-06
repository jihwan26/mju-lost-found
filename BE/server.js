/**
 * 명지 스마트 분실물 센터 -- 단일 Express 서버의 진입점.
 *
 * 백엔드(BE) 전체의 시작점이다. 이 파일은 "조립"만 하고, 실제 내용은
 * 옆에 있는 파일들에 나뉘어 있다:
 *
 *   BE/session.js     세션 쿠키 설정
 *   BE/upload.js      이미지 업로드(multer) 설정
 *   BE/helpers.js     라우트 공통 도구 (에러 처리 등)
 *   BE/routes/*.js    기능별 API  ← 새 API 는 여기에 추가
 *   BE/db.js          SQLite 데이터 계층 (권한·검증이 전부 여기 있음)
 *   BE/ai.js          AI 유사도 매칭
 *   BE/auth.js        Google 로그인 + 로그인 가드
 *
 * 이 서버 하나가 세 가지를 담당한다:
 *   1. /api/*    : 백엔드 API
 *   2. /uploads/*: 사용자가 올린 이미지
 *   3. 그 외 전부: FE 빌드 결과물(dist/) + SPA 폴백(index.html)
 *
 * 3번 덕분에 프론트(FE)와 백엔드(BE)가 같은 도메인/같은 포트에서 돌아간다.
 * Railway 에는 이 서버 하나만 띄우면 되고, CORS 설정도 필요 없다.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as db from './db.js';
import * as auth from './auth.js';
import { sessionMiddleware } from './session.js';
import api from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 이 파일이 BE/ 안에 있으므로, 프로젝트 루트는 한 단계 위다.
// FE 빌드 결과(dist/)는 루트에 생기므로 '..' 를 거쳐서 가리킨다.
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const PORT = process.env.PORT || 3000;

const app = express();

// Railway 는 리버스 프록시 뒤에서 앱을 돌린다. 이걸 켜야 req.protocol 이
// 'https' 로 잡히고, secure 쿠키가 정상 동작한다.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);

// ---------------------------------------------------------------- 업로드 이미지

app.use('/uploads', express.static(db.UPLOAD_DIR, { maxAge: '7d' }));

// 없는 이미지 요청은 여기서 404로 끝낸다. 이 줄이 없으면 요청이 아래 SPA 폴백까지
// 흘러가서, <img src="/uploads/없는파일.png"> 에 200 + index.html(HTML)이 응답된다
// -- 이미지가 아닌 걸 이미지로 준 셈이라 브라우저 캐시/디버깅이 모두 헷갈려진다.
app.use('/uploads', (req, res) => res.status(404).json({ error: '이미지를 찾을 수 없습니다.' }));

// ---------------------------------------------------------------- API

app.use('/api', api);

// 등록되지 않은 /api 경로는 SPA 폴백으로 넘기지 않고 JSON 404 로 끝낸다
// (프론트가 HTML 을 JSON 으로 파싱하려다 엉뚱한 에러를 내는 걸 막는다).
app.use('/api', (req, res) => res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' }));

// multer 등 라우터 바깥에서 던져진 오류도 JSON 으로 돌려준다.
app.use('/api', (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? '이미지 크기는 5MB 이하여야 합니다.'
    : (err.message || '서버 오류가 발생했습니다.');
  if (status === 500) console.error('[api]', err);
  res.status(status).json({ error: message });
});

// ---------------------------------------------------------------- 프론트엔드

if (fs.existsSync(DIST_DIR)) {
  // 해시가 붙은 에셋(assets/*)은 오래 캐시해도 안전하다.
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));

  // SPA 폴백: /lost/3 같은 클라이언트 라우트로 새로고침/직접 접속해도
  // React 진입점을 돌려줘야 화면이 뜬다. index.html 자체는 캐시하지 않는다
  // (재배포 후에도 낡은 HTML이 남아 없는 JS 파일을 부르는 사고를 막는다).
  //
  // app.get('*') 대신 app.use() 를 쓰는 이유: Express 5 는 경로 문법이 바뀌어
  // 벌거벗은 '*' 를 더 이상 허용하지 않는다. 마지막 미들웨어로 두면 위에서
  // 아무 라우트도 응답하지 않은 요청만 여기로 오므로 결과는 같고,
  // Express 4/5 어디서나 동작한다.
  app.use((req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(503).type('html').send(
      '<h1>프론트엔드가 아직 빌드되지 않았습니다</h1>'
      + '<p>개발 중이라면 <code>npm run dev</code> 를 실행하고 '
      + '<a href="http://localhost:5173">http://localhost:5173</a> 으로 접속하세요.</p>'
      + '<p>배포라면 <code>npm run build</code> 가 먼저 실행돼야 합니다.</p>'
    );
  });
}

app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
  console.log(`데이터 위치: ${db.DATA_DIR}`);
  if (db.STORAGE_IS_EPHEMERAL) {
    console.warn(
      '\n****************************************************************\n'
      + '  경고: 데이터가 재배포하면 사라지는 곳에 저장되고 있습니다.\n'
      + '  계정·닉네임·게시글·채팅이 배포할 때마다 초기화됩니다.\n'
      + '\n'
      + '  Railway > 서비스 > Settings > Volumes 에서 볼륨을 만들고\n'
      + '  Mount path 를 /data 로 지정하세요. (그러면 자동으로 잡힙니다)\n'
      + '****************************************************************\n'
    );
  }
  if (!auth.isAuthConfigured()) {
    console.log('Google 로그인 미설정'
      + (auth.isDevLoginEnabled() ? ' -- 개발용 로그인이 활성화되어 있습니다.' : ''));
  }
});
