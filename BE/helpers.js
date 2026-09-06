/**
 * 라우트 파일들이 공통으로 쓰는 작은 도구들.
 * (분리 전에는 BE/server.js 상단에 같이 들어 있었다.)
 */
import fs from 'node:fs';
import * as db from './db.js';
import { uploadedFilesOf } from './upload.js';

/**
 * 라우트 핸들러를 감싸서 던져진 예외를 HTTP 응답으로 바꾼다.
 * db.js 의 ValidationError -> 400, PermissionDeniedError -> 403,
 * 그 외 예상 못 한 오류 -> 500 (원본 파이썬의 except 분기와 같은 매핑).
 */
export const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    // multer 는 라우터보다 먼저 실행되므로, 그 뒤 검증에서 걸리면 파일은 이미
    // 디스크에 저장된 상태다. 게시물이 안 만들어졌으면 그 이미지는 아무도
    // 참조하지 않으므로 여기서 지운다 (안 그러면 실패할 때마다 쓰레기가 쌓인다).
    // 사진 여러 장(req.files)도 함께 처리한다.
    for (const file of uploadedFilesOf(req)) {
      fs.promises.unlink(file.path).catch(() => {});
    }
    const status = e.status || 500;
    if (status === 500) console.error('[api]', req.method, req.path, e);
    res.status(status).json({ error: e.message || '서버 오류가 발생했습니다.' });
  }
};

/** "전체" 같은 필터 미선택 값을 null 로 정규화한다. */
export const filterValue = (v) => (!v || v === '전체' ? null : String(v));

export const intOrNull = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

/** kind 경로 파라미터 검증. 잘못된 값이면 db.postKindConfig 가 ValidationError 를 던진다. */
export const requireKind = (req) => {
  db.postKindConfig(req.params.kind);
  return req.params.kind;
};
