/**
 * 이미지 업로드 설정 (ui/common.py 의 save_uploaded_image 포팅).
 *
 * 브라우저의 accept 속성은 클라이언트 힌트일 뿐이라 조작이 가능하다.
 * 실제 확장자 검사는 여기(서버)가 유일한 강제 지점이다.
 */
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';

import * as db from './db.js';

const ALLOWED_IMAGE_SUFFIXES = new Set(['.jpg', '.jpeg', '.png']);

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, db.UPLOAD_DIR),
    // 원본 파일명은 쓰지 않는다 -- 경로 조작(../)과 파일명 충돌을 한 번에 없애기 위해
    // 랜덤 UUID + 검증된 확장자로만 저장한다.
    filename: (req, file, cb) => {
      const suffix = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID().replace(/-/g, '')}${suffix}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const suffix = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_SUFFIXES.has(suffix)) {
      cb(new db.ValidationError(`허용되지 않는 파일 형식입니다: ${suffix || '(확장자 없음)'}`));
      return;
    }
    cb(null, true);
  },
});

/** 저장된 파일 -> 브라우저가 부를 수 있는 경로. 파일이 없으면 null. */
export const imageUrlFor = (file) => (file ? `/uploads/${file.filename}` : null);

/** upload.array() 로 받은 파일 목록 -> 경로 배열. 파일이 없으면 빈 배열. */
export const imageUrlsFor = (files) => (files || []).map((f) => `/uploads/${f.filename}`);

/**
 * 업로드가 성공한 뒤 요청 처리에 실패했을 때 디스크에 남은 파일을 지운다.
 * helpers.js 의 wrap() 이 단일 파일(req.file)만 지우던 것을, 여러 장(req.files)까지
 * 처리하도록 이 헬퍼로 모아 뒀다.
 */
export const uploadedFilesOf = (req) => {
  if (req.files?.length) return req.files;
  return req.file ? [req.file] : [];
};
